import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, collection, query, where, limit, orderBy, setDoc, writeBatch, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { localSharingDevice } from "./sharing-storage";
import type { PublicDevice } from "./sharing-crypto";
import { careEnabled, checkCareProfile, checkContribution, type CareProfile, type CareRole, type CareEntry, type CareView, type ContributionKind } from "./care-model";
import { careAccount, readCareCopy, savedCareIds, saveCareCopy, saveCareReceipt, saveCareHandoff } from "./care-storage";
import { careHash, jsonBytes, newCareKey, openCare, readJson, sealCare, signCare, unwrapCare, verifyCare, wrapCare } from "./care-crypto";
import { base64, deriveVaultKey, newSalt, seal, unseal } from "./vault-crypto";
import { frameHandoff, unframeHandoff } from "./handoff-frame";
import { referralInput, type ReferralFields } from "./referral-draft";
let db: Firestore | undefined;
export type CareStaff = { facilityId: string; name: string; role: CareRole; enabled: boolean };
export type CareFacility = { name: string; enabled: boolean };
export async function careDb(uid: string) {
  if (!careEnabled) throw Error("Connected care is not enabled in this build.");
  const auth = await careAccount(uid);
  if (!db) {
    if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL && (!["localhost", "127.0.0.1"].includes(location.hostname) || auth.app.options.projectId !== "demo-matrisync")) throw Error("Care emulator must use the isolated local project.");
    db = getFirestore(auth.app);
    if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) {
      if (!["localhost", "127.0.0.1"].includes(location.hostname) || auth.app.options.projectId !== "demo-matrisync") throw Error("Care emulator must use the isolated local project.");
      connectFirestoreEmulator(db, "127.0.0.1", 8086);
    }
  }
  return db;
}
export async function enrollCareDevice(uid: string) {
  const database = await careDb(uid), device = await localSharingDevice(uid), ref = doc(database, "careDevices", uid);
  const current = await getDocFromServer(ref);
  if (current.exists() && current.data().keyId !== device.keyId) throw Error("This account is enrolled on another browser. Device recovery is required; no existing key was replaced.");
  if (!current.exists()) await setDoc(ref, { encryption: device.encryption, signing: device.signing, keyId: device.keyId });
  return device;
}
async function publicCareDevice(uid: string, peer: string) {
  const snapshot = await getDocFromServer(doc(await careDb(uid), "careDevices", peer));
  if (!snapshot.exists()) throw Error("The other account must enroll its browser first.");
  return snapshot.data() as PublicDevice;
}
export async function careMembership(uid: string) {
  const database = await careDb(uid);
  const [s, f] = await Promise.all([getDocFromServer(doc(database, "careStaff", uid)), getDocFromServer(doc(database, "careFacilities", uid))]);
  return { staff: s.exists() ? s.data() as CareStaff : undefined, facility: f.exists() ? f.data() as CareFacility : undefined };
}
async function doctor(uid: string) {
  const { staff } = await careMembership(uid);
  if (!staff?.enabled || staff.role !== "doctor") throw Error("An active facility-assigned Doctor account is required.");
  return staff;
}
export async function activateCareFacility(uid: string, name: string, invitation: string) {
  const database = await careDb(uid), inviteId = await careHash(invitation.trim());
  if (!name.trim() || name.length > 120) throw Error("Enter the facility name.");
  await enrollCareDevice(uid);
  await runTransaction(database, async tx => {
    const ref = doc(database, "careFacilityInvites", inviteId), invite = await tx.get(ref);
    if (!invite.exists() || invite.data().redeemedBy) throw Error("Facility invitation is missing or already used.");
    tx.update(ref, { redeemedBy: uid, redeemedAt: serverTimestamp() });
    tx.set(doc(database, "careFacilities", uid), { name: name.trim(), enabled: true, inviteId, createdAt: serverTimestamp() });
  });
}
export async function assignCareStaff(uid: string, staffUid: string, name: string, role: CareRole, enabled: boolean) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(staffUid) || !name.trim() || name.length > 120 || !["doctor", "nurse", "lab"].includes(role)) throw Error("Check staff account, name and role.");
  await publicCareDevice(uid, staffUid);
  await setDoc(doc(await careDb(uid), "careStaff", staffUid), { facilityId: uid, name: name.trim(), role, enabled, updatedAt: serverTimestamp() });
}
export async function listCareFacilities(uid: string) {
  const snapshots = await getDocsFromServer(query(collection(await careDb(uid), "careFacilities"), where("enabled", "==", true), limit(30)));
  return snapshots.docs.map(s => ({ id: s.id, ...s.data() as CareFacility }));
}
export async function listCareProfiles(uid: string, mother = false) {
  const database = await careDb(uid);
  const snapshots = await getDocsFromServer(query(collection(database, mother ? "careCases" : "careAccess"), where(mother ? "motherUid" : "uid", "==", uid), ...(mother ? [] : [where("viaNfc", "==", false)]), limit(50)));
  return snapshots.docs.map(s => mother ? s.id : s.data().caseId as string);
}
export const motherLoginEmail = (id: string) => {
  if (!/^[a-f0-9-]{36}$/.test(id.trim())) throw Error("Enter the patient ID issued by the Doctor.");
  return `patient.${id.trim()}@patients.matrisync.invalid`;
};
export async function registerCareProfile(uid: string, profile: CareProfile) {
  profile = checkCareProfile(profile);
  for (const saved of await savedCareIds(uid)) {
    const existing = await readCareCopy(uid, saved);
    if (existing?.profile.sourceUid === uid && existing.profile.sourceLocalId === profile.sourceLocalId)
      throw Error(`This local patient is already connected: ${saved}. Open that profile; no duplicate Mother account was created.`);
  }
  const staff = await doctor(uid), database = await careDb(uid), own = await enrollCareDevice(uid);
  const facility = await publicCareDevice(uid, staff.facilityId);
  const id = crypto.randomUUID(), key = newCareKey(), code = `MS!${crypto.randomUUID().replaceAll("-", "")}`;
  const salt = newSalt();
  const motherWrapped = JSON.stringify(await seal(await deriveVaultKey(code, salt), jsonBytes({ id, key }), `care-mother:${id}`));
  // A separate in-memory Auth instance creates Mother credentials without
  // signing the Doctor out. No staff password/privilege is shared with Mother.
  const [{ initializeApp, deleteApp }, authSdk] = await Promise.all([import("firebase/app"), import("firebase/auth")]);
  const app = initializeApp((await careAccount(uid)).app.options, `mother-registration-${id}`);
  const auth = authSdk.initializeAuth(app, { persistence: authSdk.inMemoryPersistence });
  if (import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL) authSdk.connectAuthEmulator(auth, import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL, { disableWarnings: true });
  let created: import("firebase/auth").User | undefined, committed = false;
  try {
    created = (await authSdk.createUserWithEmailAndPassword(auth, motherLoginEmail(id), code)).user;
    const batch = writeBatch(database);
    batch.set(doc(database, "careCases", id), { creatorUid: uid, facilityId: staff.facilityId, motherUid: created.uid, motherSalt: salt, motherWrapped, encrypted: await sealCare(key, `care-profile:${id}`, profile), createdAt: serverTimestamp() });
    for (const [recipient, device] of [[uid, own], [staff.facilityId, facility]] as const)
      batch.set(doc(database, "careAccess", `${id}_${recipient}`), { caseId: id, uid: recipient, facilityId: staff.facilityId, grantedBy: uid, viaNfc: false, wrapped: await wrapCare({ id, uid: recipient, key }, device), createdAt: serverTimestamp() });
    await careAccount(uid); await batch.commit(); committed = true;
    const view: CareView = { id, key, profile, motherUid: created.uid, entries: [], verified: true, snapshotOnly: false, receivedAt: new Date().toISOString() };
    await saveCareCopy(uid, view).catch(() => {});
    return { id, code, view };
  } catch (error) {
    if (created && !committed) await authSdk.deleteUser(created).catch(() => {});
    throw error;
  } finally { await authSdk.signOut(auth); await deleteApp(app); }
}
export async function loadCareProfile(uid: string, id: string, motherCode?: string) {
  if (!navigator.onLine) {
    const copy = await readCareCopy(uid, id); if (!copy) throw Error("No saved profile exists here. Scan a handoff to view its basic offline details."); return copy;
  }
  const database = await careDb(uid), old = await readCareCopy(uid, id);
  const snapshot = await getDocFromServer(doc(database, "careCases", id));
  if (!snapshot.exists()) throw Error("The full profile is not available to this account.");
  const meta = snapshot.data(); let key: string;
  if (meta.motherUid === uid) {
    if (motherCode) {
      const opened = readJson(await unseal(await deriveVaultKey(motherCode, meta.motherSalt), JSON.parse(meta.motherWrapped), `care-mother:${id}`));
      if (opened.id !== id) throw Error("Mother profile binding differs."); key = opened.key;
    } else if (old?.key) key = old.key;
    else throw Error("Enter your patient access code once to unlock the linked profile on this browser.");
  } else {
    const access = await getDocFromServer(doc(database, "careAccess", `${id}_${uid}`));
    if (!access.exists()) throw Error("This patient is not assigned to your account.");
    const opened = await unwrapCare(uid, access.data().wrapped);
    if (opened.id !== id || opened.uid !== uid) throw Error("Patient access binding differs."); key = opened.key;
  }
  const profile = checkCareProfile(await openCare(key, `care-profile:${id}`, meta.encrypted));
  const snapshots = await getDocsFromServer(query(collection(database, "careCases", id, "entries"), orderBy("createdAt", "asc"), limit(200)));
  const entries: CareEntry[] = [];
  for (const entry of snapshots.docs) {
    const value = entry.data(), content = await openCare(key, `care-entry:${id}:${entry.id}`, value.encrypted);
    checkContribution(value.role, value.kind, content.text, content.fields);
    if (typeof content.recordedAt !== "string" || !Number.isFinite(Date.parse(content.recordedAt))) throw Error("Invalid contribution timestamp.");
    entries.push({ id: entry.id, kind: value.kind, actorUid: value.actorUid, actorName: value.actorName, role: value.role, recordedAt: content.recordedAt, serverAt: value.createdAt.toDate().toISOString(), text: content.text, ...(content.fields ? { fields: content.fields } : {}) });
  }
  // Do not silently label an incomplete audit trail as the full profile.
  if (snapshots.size === 200) throw Error("This profile exceeds the bounded demonstration history. No complete-profile refresh was claimed.");
  const view: CareView = { id, key, profile, motherUid: meta.motherUid, entries, verified: true, snapshotOnly: false, receivedAt: new Date().toISOString(), ...(old?.handoffId ? { handoffId: old.handoffId } : {}) };
  await careAccount(uid); await saveCareCopy(uid, view); return view;
}
export async function grantCareProfile(uid: string, view: CareView, recipient: string) {
  if (view.snapshotOnly || !view.key) throw Error("Load the authorized full profile before assigning staff.");
  const database = await careDb(uid), peer = await publicCareDevice(uid, recipient);
  const member = await getDocFromServer(doc(database, "careStaff", recipient));
  if (!member.exists() || !member.data().enabled || member.data().facilityId !== uid) throw Error("Choose active staff in your own facility.");
  const ref = doc(database, "careAccess", `${view.id}_${recipient}`);
  if ((await getDocFromServer(ref)).exists()) return;
  await setDoc(ref, { caseId: view.id, uid: recipient, facilityId: uid, grantedBy: uid, viaNfc: false, wrapped: await wrapCare({ id: view.id, uid: recipient, key: view.key }, peer), createdAt: serverTimestamp() });
}
export async function contributeCare(uid: string, view: CareView, kind: ContributionKind, text: string, fields?: ReferralFields) {
  const { staff } = await careMembership(uid);
  if (!staff?.enabled || view.snapshotOnly) throw Error("An active assigned staff account and a full profile are required.");
  checkContribution(staff.role, kind, text, fields);
  const id = crypto.randomUUID(), recordedAt = new Date().toISOString();
  const encrypted = await sealCare(view.key, `care-entry:${view.id}:${id}`, { text: text.trim(), recordedAt, ...(fields ? { fields: referralInput(fields) } : {}) });
  await setDoc(doc(await careDb(uid), "careCases", view.id, "entries", id), { actorUid: uid, actorName: staff.name, role: staff.role, kind, encrypted, createdAt: serverTimestamp() });
  return { id, recordedAt, actorName: staff.name, role: staff.role };
}
export async function createCareHandoff(uid: string, view: CareView, recipientUid: string, fields: ReferralFields, capacity: number) {
  const staff = await doctor(uid), database = await careDb(uid), sender = await enrollCareDevice(uid), recipient = await publicCareDevice(uid, recipientUid);
  const facility = await getDocFromServer(doc(database, "careFacilities", recipientUid));
  if (!facility.exists() || !facility.data().enabled || view.snapshotOnly || !view.key) throw Error("Choose an approved receiving facility and load the full profile.");
  const clean = referralInput(fields), id = crypto.randomUUID(), recordedAt = new Date().toISOString();
  const { name, birthDate, sourceLocalId, sourceUid } = view.profile;
  const payload = { version: 1, id, caseId: view.id, sourceUid: uid, sourceName: staff.name, sourceFacility: staff.facilityId, recipientUid, recordedAt, profile: { name, birthDate, sourceLocalId, sourceUid }, fields: clean };
  const signed = await signCare(uid, payload);
  const ciphertext = await wrapCare({ signed, sender: { encryption: sender.encryption, signing: sender.signing, keyId: sender.keyId } }, recipient);
  const packet = frameHandoff(jsonBytes({ kind: "care-referral", id, ciphertext }), capacity);
  // Size checks happen before writes. Blank clinical fields never stop this;
  // permissions, invalid/corrupt data and physical tag capacity still do.
  const batch = writeBatch(database);
  batch.set(doc(database, "careCases", view.id, "entries", id), { actorUid: uid, actorName: staff.name, role: "doctor", kind: "referral", encrypted: await sealCare(view.key, `care-entry:${view.id}:${id}`, { text: "", recordedAt, fields: clean }), createdAt: serverTimestamp() });
  const grant = doc(database, "careAccess", `${view.id}_${recipientUid}`);
  if (!(await getDocFromServer(grant)).exists()) batch.set(grant, { caseId: view.id, uid: recipientUid, facilityId: recipientUid, grantedBy: uid, viaNfc: true, wrapped: await wrapCare({ id: view.id, uid: recipientUid, key: view.key }, recipient), createdAt: serverTimestamp() });
  batch.set(doc(database, "careHandoffs", id), { caseId: view.id, sourceUid: uid, recipientUid, ciphertext, createdAt: serverTimestamp() });
  await careAccount(uid); await batch.commit();
  // A local quota/device failure must not turn a committed cloud handoff into
  // an apparent creation failure and encourage duplicate clinical entries.
  let savedLocally = false;
  try {
    await saveCareHandoff(uid, { version: 1, id, caseId: view.id, sourceUid: uid, recipientUid, profile: payload.profile, fields: clean, packet: base64(packet), actorName: staff.name, recordedAt });
    savedLocally = true;
  } catch { /* Return the confirmed packet with an explicit recovery warning. */ }
  return { packet, id, recordedAt, fields: clean, actorName: staff.name, savedLocally };
}
export async function receiveCareHandoff(uid: string, bytes: Uint8Array): Promise<CareView> {
  await careAccount(uid);
  const packet = readJson(unframeHandoff(bytes));
  if (packet.kind !== "care-referral" || typeof packet.id !== "string" || typeof packet.ciphertext !== "string") throw Error("This is not a supported care handoff.");
  const wrapper = await unwrapCare(uid, packet.ciphertext), payload = await verifyCare(wrapper.signed, wrapper.sender);
  if (payload.version !== 1 || payload.id !== packet.id || payload.recipientUid !== uid || !/^[a-f0-9-]{36}$/.test(payload.caseId)) throw Error("Handoff identity or receiving facility differs.");
  if (!/^[a-f0-9-]{36}$/.test(packet.id) || typeof payload.sourceUid !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(payload.sourceUid) || typeof payload.sourceName !== "string" || !payload.sourceName.trim() || payload.sourceName.length > 120 || typeof payload.recordedAt !== "string" || !/^\d{4}-\d{2}-\d{2}T/.test(payload.recordedAt) || !Number.isFinite(Date.parse(payload.recordedAt))) throw Error("Invalid handoff attribution.");
  const profile = checkCareProfile(payload.profile); const fields = referralInput(payload.fields);
  let verified = false;
  try { if (navigator.onLine) {
    const database = await careDb(uid), record = await getDocFromServer(doc(database, "careHandoffs", packet.id));
    if (!record.exists() || record.data().ciphertext !== packet.ciphertext || record.data().sourceUid !== payload.sourceUid || record.data().caseId !== payload.caseId || record.data().recipientUid !== uid) throw Error("This handoff does not match the authorized stored record.");
    const source = await publicCareDevice(uid, payload.sourceUid);
    if (source.keyId !== wrapper.sender.keyId) throw Error("The source device identity changed.");
    verified = true;
  } } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String(error.code) : "";
    if (!["unavailable", "deadline-exceeded"].includes(code)) throw error;
  }
  const receivedAt = new Date().toISOString();
  const view: CareView = { id: payload.caseId, key: "", profile, entries: [{ id: payload.id, kind: "referral", actorUid: payload.sourceUid, actorName: payload.sourceName, role: "doctor", recordedAt: payload.recordedAt, serverAt: "", text: "", fields }], verified, snapshotOnly: true, receivedAt, ...(verified ? { verifiedAt: receivedAt } : {}), handoffId: packet.id };
  const existing = await readCareCopy(uid, view.id);
  // Retain a previously loaded full record instead of downgrading its history.
  const receipt = await saveCareReceipt(uid, view);
  if (!existing || existing.snapshotOnly) await saveCareCopy(uid, receipt);
  await careAccount(uid); return receipt;
}
