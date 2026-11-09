import { getFirestore, connectFirestoreEmulator, doc, getDocFromServer, getDocsFromServer, collection, query, where, limit, orderBy, setDoc, writeBatch, runTransaction, serverTimestamp, type Firestore } from "firebase/firestore";
import { existingSharingDevice, localSharingDevice } from "./sharing-storage";
import type { PublicDevice } from "./sharing-crypto";
import { careEnabled, checkCareProfile, checkContribution, type CareProfile, type CareRole, type CareEntry, type CareView, type ContributionKind } from "./care-model";
import { careAccount, readCareCopy, savedCareIds, saveCareCopy, saveCareReceipt, readCareDraft, readPendingCareHandoff, claimPendingCareHandoff, confirmPendingCareHandoff, type PendingCareHandoff } from "./care-storage";
import { careHash, jsonBytes, newCareKey, openCare, readJson, sealCare, signCare, unwrapCare, verifyCare, wrapCare, wrapCareBytes, unwrapCareBytes } from "./care-crypto";
import { base64, unbase64, deriveVaultKey, newSalt, seal, unseal } from "./vault-crypto";
import { compactCarePayload, compactCareWrapper, compactCarePacket, readCarePacket, expandCareWrapper, expandCarePayload } from "./care-handoff-codec";
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
  const database = await careDb(uid), ref = doc(database, "careDevices", uid);
  const current = await getDocFromServer(ref);
  const existing = await existingSharingDevice(uid);
  // Authentication cannot recover a browser's non-exportable private keys.
  // Inspect enrollment before generating anything: a missing key is not a
  // request to replace the enrolled identity or start an automatic recovery.
  if (current.exists() && current.data().keyId !== existing?.keyId) throw Error("This account is enrolled on another browser. Use the original browser with its saved data. Device recovery is not available yet; no existing key was replaced.");
  const device = existing ?? await localSharingDevice(uid);
  if (!current.exists()) await setDoc(ref, { encryption: device.encryption, signing: device.signing, keyId: device.keyId });
  return device;
}
export async function publicCareDevice(uid: string, peer: string) {
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
  if (!/^[a-f0-9-]{36}$/.test(id.trim())) throw Error("Enter the patient ID issued by your care facility.");
  return `patient.${id.trim()}@patients.matrisync.invalid`;
};
export async function registerCareProfile(uid: string, profile: CareProfile, facilityRegistration = false) {
  profile = checkCareProfile(profile);
  for (const saved of await savedCareIds(uid)) {
    const existing = await readCareCopy(uid, saved);
    if (existing?.profile.sourceUid === uid && existing.profile.sourceLocalId === profile.sourceLocalId)
      throw Error(`This local patient is already connected: ${saved}. Open that profile; no duplicate Mother account was created.`);
  }
  const member = facilityRegistration ? await careMembership(uid) : undefined;
  if (facilityRegistration && !member?.facility?.enabled) throw Error("An active invited facility is required to register a patient.");
  const staff = facilityRegistration ? {facilityId:uid} : await doctor(uid), database = await careDb(uid), own = await enrollCareDevice(uid);
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
    for (const [recipient, device] of (uid === staff.facilityId ? [[uid, own]] : [[uid, own], [staff.facilityId, facility]]) as [string, PublicDevice][])
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
    const copy = await readCareCopy(uid, id); if (!copy) throw Error("No saved profile exists here. Scan a handoff to view its basic offline details."); return copy.motherUid === uid ? {...copy, entries:copy.entries.filter(e=>e.kind==="prescription"||e.kind==="laboratory")} : copy;
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
  const snapshots = await getDocsFromServer(query(collection(database, "careCases", id, "entries"), ...(meta.motherUid === uid ? [where("kind", "in", ["prescription", "laboratory"])] : [orderBy("createdAt", "asc")]), limit(200)));
  const entries: CareEntry[] = [];
  for (const entry of snapshots.docs) {
    const value = entry.data(), content = await openCare(key, `care-entry:${id}:${entry.id}`, value.encrypted);
    checkContribution(value.role, value.kind, content.text, content.fields);
    if (typeof content.recordedAt !== "string" || !Number.isFinite(Date.parse(content.recordedAt))) throw Error("Invalid contribution timestamp.");
    entries.push({ id: entry.id, kind: value.kind, actorUid: value.actorUid, actorName: value.actorName, role: value.role, recordedAt: content.recordedAt, serverAt: value.createdAt.toDate().toISOString(), text: content.text, ...(content.fields ? { fields: content.fields } : {}) });
  }
  entries.sort((a,b)=>a.serverAt.localeCompare(b.serverAt));
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
export async function createCareHandoff(uid: string, view: CareView, recipientUid: string, fields: ReferralFields, capacity: number, approvalRevision?: string | null) {
  await careAccount(uid);
  let pending = await readPendingCareHandoff(uid, view.id);
  const draft = await readCareDraft(uid, view.id);
  const revision = approvalRevision === undefined ? (pending?.status === "pending" ? pending.approvalRevision : draft?.revision || null) : approvalRevision;
  const clean = referralInput(fields);
  if (pending?.status === "pending" || (pending && (pending.approvalRevision === revision || !draft || draft.cleared))) {
    if (pending.capacity !== capacity || pending.handoff.recipientUid !== recipientUid || JSON.stringify(pending.handoff.fields) !== JSON.stringify(clean)) throw Error("A saved approval has different details. Reload this patient and check the original approved handoff before creating another.");
    return submitPendingCareHandoff(uid, pending);
  }
  if ((draft?.revision || null) !== revision) throw Error("The referral draft changed. Reload before approving it.");
  if (draft && !draft.cleared && (JSON.stringify(referralInput(draft.fields)) !== JSON.stringify(clean) || draft.destination !== recipientUid || Number(draft.capacity) !== capacity)) throw Error("Save the current referral draft before approving it.");
  const staff = await doctor(uid), database = await careDb(uid), sender = await enrollCareDevice(uid), recipient = await publicCareDevice(uid, recipientUid);
  const facility = await getDocFromServer(doc(database, "careFacilities", recipientUid));
  if (!facility.exists() || !facility.data().enabled || view.snapshotOnly || !view.key) throw Error("Choose an approved receiving facility and load the full profile.");
  // A draft revision is the stable operation ID. The initial blank form has a
  // deterministic account/patient ID too, never a fresh retry UUID.
  const digest = await careHash(JSON.stringify([uid, view.id, revision]));
  const id = `${digest.slice(0,8)}-${digest.slice(8,12)}-${digest.slice(12,16)}-${digest.slice(16,20)}-${digest.slice(20,32)}`, recordedAt = new Date().toISOString();
  const { name, birthDate, sourceLocalId, sourceUid } = view.profile;
  const payload = { version: 1, id, caseId: view.id, sourceUid: uid, sourceName: staff.name, sourceFacility: staff.facilityId, recipientUid, recordedAt, profile: { name, birthDate, sourceLocalId, sourceUid }, fields: clean };
  const signed = await signCare(uid, compactCarePayload(payload));
  const ciphertext = await wrapCareBytes(await compactCareWrapper(signed, sender), recipient);
  const packet = compactCarePacket(id, ciphertext, capacity);
  pending = await claimPendingCareHandoff(uid, {
    version: 1, status: "pending", approvalRevision: revision, capacity, sourceFacility: staff.facilityId, senderKeyId: sender.keyId, recipientKeyId: recipient.keyId,
    handoff: { version: 1, id, caseId: view.id, sourceUid: uid, recipientUid, profile: payload.profile, fields: clean, packet: base64(packet), actorName: staff.name, recordedAt },
    entryEncrypted: await sealCare(view.key, `care-entry:${view.id}:${id}`, { text: "", recordedAt, fields: clean }),
    grantWrapped: await wrapCare({ id: view.id, uid: recipientUid, key: view.key }, recipient),
  }, pending);
  if (pending.approvalRevision !== revision || pending.capacity !== capacity || pending.handoff.recipientUid !== recipientUid || JSON.stringify(pending.handoff.fields) !== JSON.stringify(clean)) throw Error("Another approval is awaiting confirmation. Reload this patient to check it.");
  return submitPendingCareHandoff(uid, pending);
}

async function submitPendingCareHandoff(uid: string, pending: PendingCareHandoff) {
  const h = pending.handoff, database = await careDb(uid), packet = unbase64(h.packet);
  const envelope = readCarePacket(packet);
  if (h.sourceUid !== uid || envelope.kind !== "care-referral" || envelope.id !== h.id || typeof envelope.ciphertext !== "string") throw Error("Saved approval packet differs. No retry was sent.");
  const handoffRef = doc(database, "careHandoffs", h.id), entryRef = doc(database, "careCases", h.caseId, "entries", h.id);
  const matchesHandoff = (d: Record<string, unknown>) => d.caseId === h.caseId && d.sourceUid === uid && d.recipientUid === h.recipientUid && d.ciphertext === envelope.ciphertext;
  const matchesEntry = (d: Record<string, unknown>) => d.actorUid === uid && d.actorName === h.actorName && d.role === "doctor" && d.kind === "referral" && d.encrypted === pending.entryEncrypted;
  async function reconcile() {
    // A missing handoff get is denied by existing rules. Denial is NOT absence.
    // Its case entry is readable even when absent by currently authorized users.
    try {
      const receipt = await getDocFromServer(handoffRef);
      if (receipt.exists()) {
        if (!matchesHandoff(receipt.data())) throw Error("The server handoff differs from this saved approval. No retry was sent.");
        try {
          const entry = await getDocFromServer(entryRef);
          if (!entry.exists() || !matchesEntry(entry.data())) throw Error("The server referral entry differs from this saved approval. No retry was sent.");
        } catch (error) {
          // Revocation may remove case access while an author can still read
          // the exact immutable handoff. That is historical commit evidence,
          // never authority to append a new entry.
          if ((error as {code?:string}).code !== "permission-denied") throw error;
        }
        return true; // Historical commit evidence remains readable to its author.
      }
    } catch (error) {
      if ((error as {code?:string}).code !== "permission-denied") throw error;
    }
    const entry = await getDocFromServer(entryRef);
    if (entry.exists()) throw Error("A referral entry exists but its matching handoff could not be confirmed. No retry was sent.");
    return false;
  }
  try {
    if (!await reconcile()) {
      if (pending.status === "confirmed") throw Error("A previously confirmed handoff is missing from the server. No replacement was created.");
      await careAccount(uid);
      await runTransaction(database, async tx => {
        // Firestore transactions read server state and serialize competing tabs.
        // Existing records are checked, never updated to make retries succeed.
        const entry = await tx.get(entryRef);
        if (entry.exists()) {
          const receipt = await tx.get(handoffRef);
          if (!matchesEntry(entry.data()) || !receipt.exists() || !matchesHandoff(receipt.data())) throw Error("The server operation differs from this approval.");
          return;
        }
        const [member, sender, recipient, facility, grant] = await Promise.all([
          tx.get(doc(database, "careStaff", uid)), tx.get(doc(database, "careDevices", uid)), tx.get(doc(database, "careDevices", h.recipientUid)),
          tx.get(doc(database, "careFacilities", h.recipientUid)), tx.get(doc(database, "careAccess", `${h.caseId}_${h.recipientUid}`)),
        ]);
        if (!member.exists() || !member.data().enabled || member.data().role !== "doctor" || member.data().facilityId !== pending.sourceFacility || member.data().name !== h.actorName) throw Error("The original Doctor assignment changed. No new submission was made.");
        if (!sender.exists() || sender.data().keyId !== pending.senderKeyId || !recipient.exists() || recipient.data().keyId !== pending.recipientKeyId) throw Error("A device identity changed. The saved approval cannot be sent to a different device.");
        if (!facility.exists() || !facility.data().enabled) throw Error("The receiving facility is no longer active.");
        await careAccount(uid);
        tx.set(entryRef, { actorUid: uid, actorName: h.actorName, role: "doctor", kind: "referral", encrypted: pending.entryEncrypted, createdAt: serverTimestamp() });
        if (!grant.exists()) tx.set(doc(database, "careAccess", `${h.caseId}_${h.recipientUid}`), { caseId: h.caseId, uid: h.recipientUid, facilityId: h.recipientUid, grantedBy: uid, viaNfc: true, wrapped: pending.grantWrapped, createdAt: serverTimestamp() });
        tx.set(handoffRef, { caseId: h.caseId, sourceUid: uid, recipientUid: h.recipientUid, ciphertext: envelope.ciphertext, createdAt: serverTimestamp() });
      });
    }
  } catch (error) {
    // A lost acknowledgement can follow a successful commit. Only an exact
    // authoritative match resolves it; unavailable reads keep the approval.
    let confirmed = false;
    try { confirmed = await reconcile(); } catch { /* Keep uncertainty durable. */ }
    if (!confirmed) throw Error(`The approved handoff is saved, but completion is not confirmed. Reload this patient and use the same approval action to check or retry it. ${error instanceof Error ? error.message : "Connection unavailable."}`);
  }
  let savedLocally = false;
  try { await confirmPendingCareHandoff(uid, pending); savedLocally = true; } catch { /* Pending original still retained for reconciliation. */ }
  return { packet, id: h.id, recordedAt: h.recordedAt, fields: h.fields, actorName: h.actorName, profile: h.profile, approvalRevision: pending.approvalRevision, savedLocally };
}
export async function receiveCareHandoff(uid: string, bytes: Uint8Array): Promise<CareView> {
  await careAccount(uid);
  const packet = readCarePacket(bytes);
  if (packet.kind !== "care-referral" || typeof packet.id !== "string" || typeof packet.ciphertext !== "string") throw Error("This is not a supported care handoff.");
  const wrapper = await expandCareWrapper(await unwrapCareBytes(uid, packet.ciphertext)), payload = expandCarePayload(await verifyCare(wrapper.signed, wrapper.sender));
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
