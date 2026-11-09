import {createPatientPairing,redeemPatientPairing,submitMotherRecord,listMotherRecords,approveMotherRecord} from "../src/care-intake";
import "fake-indexeddb/auto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, type Auth } from "firebase/auth";
import { deleteApp } from "firebase/app";
import { doc, getDocFromServer, terminate } from "firebase/firestore";
import { accountAuth } from "../src/auth";
import { activateCareFacility, assignCareStaff, careDb, contributeCare, createCareHandoff, enrollCareDevice, grantCareProfile, listCareProfiles, loadCareProfile, motherLoginEmail, receiveCareHandoff, registerCareProfile } from "../src/care-client";
import { careHash } from "../src/care-crypto";
import { careReceipts, latestCareHandoff, readCareCopy, readCareDraft, readPendingCareHandoff } from "../src/care-storage";
import { CareDraftSession } from "../src/care-draft-session";
import { emptyReferralFields } from "../src/referral-draft";
import { unbase64 } from "../src/vault-crypto";
import type { CareRole, CareView } from "../src/care-model";

// Failure injection surrounds real SDK operations; the server commit, rules,
// encryption and subsequent reconciliation are all real emulator operations.
const network = vi.hoisted(() => ({ loseResponse: false, unavailable: false, failBefore: false }));
vi.mock("firebase/firestore", async importOriginal => {
  const actual = await importOriginal<typeof import("firebase/firestore")>();
  return { ...actual,
    getDocFromServer: async (...args: Parameters<typeof actual.getDocFromServer>) => {
      if (network.unavailable) throw Object.assign(Error("Injected unavailable reconciliation"), { code: "unavailable" });
      return actual.getDocFromServer(...args);
    },
    runTransaction: async (...args: Parameters<typeof actual.runTransaction>) => {
      if (network.failBefore) { network.failBefore=false; throw Error("Injected timeout before commit"); }
      const result = await actual.runTransaction(...args);
      if (network.loseResponse) { network.loseResponse=false; network.unavailable=true; throw Error("Injected lost commit response"); }
      return result;
    },
  };
});

const project = "demo-matrisync", run = crypto.randomUUID(), password = "Synthetic-local-test-only-42!";
type Account = { uid: string; email: string; name: string };
let auth: Auth;
beforeAll(async () => {
  // Fail before any signup or operator seeding if this suite is misconfigured.
  expect(import.meta.env.VITE_FIREBASE_PROJECT_ID).toBe(project);
  expect(import.meta.env.VITE_FIREBASE_AUTH_EMULATOR_URL).toBe("http://127.0.0.1:9099");
  vi.stubGlobal("location", { hostname: "127.0.0.1" });
  vi.stubGlobal("navigator", { onLine: true });
  auth = await accountAuth();
  expect(auth.app.options.projectId).toBe(project);
});
afterAll(async () => {
  if (auth?.currentUser) { const database = await careDb(auth.currentUser.uid); await signOut(auth); await terminate(database); }
  if (auth) await deleteApp(auth.app);
  vi.unstubAllGlobals();
});
async function account(name: string): Promise<Account> {
  const email = `${name}-${run}@example.test`;
  const { user } = await createUserWithEmailAndPassword(auth, email, password);
  await enrollCareDevice(user.uid);
  return { uid: user.uid, email, name };
}
async function login(person: Account) {
  await signInWithEmailAndPassword(auth, person.email, password);
  expect(auth.currentUser?.uid).toBe(person.uid);
}
async function facility(name: string) {
  const person = await account(name), invitation = crypto.randomUUID(), hash = await careHash(invitation);
  const url = `http://127.0.0.1:8086/v1/projects/${project}/databases/(default)/documents/careFacilityInvites/${hash}`;
  const response = await fetch(url, { method: "PATCH", headers: { Authorization: "Bearer owner", "Content-Type": "application/json" }, body: JSON.stringify({ fields: { redeemedBy: { stringValue: "" }, redeemedAt: { nullValue: null }, expiresAt: { timestampValue: new Date(Date.now() + 3600000).toISOString() } } }) });
  expect(response.ok).toBe(true);
  await activateCareFacility(person.uid, `Synthetic ${name}`, invitation);
  return person;
}
async function team(admin: Account) {
  const people: Record<string, Account> = {};
  for (const role of ["doctor", "nurse", "lab"] as const) {
    const person = await account(`${admin.name}-${role}`);
    await login(admin); await assignCareStaff(admin.uid, person.uid, person.name, role, true);
    people[role] = person;
  }
  return people as Record<CareRole, Account>;
}
async function assign(admin: Account, view: CareView, people: Account[]) {
  await login(admin);
  for (const person of people) await grantCareProfile(admin.uid, view, person.uid);
}

it("completes the nine-account encrypted care journey with real Auth and Firestore rules", async () => {
  const source = await facility("source"), destination = await facility("destination");
  const sending = await team(source), receiving = await team(destination);
  await login(sending.doctor);
  const profile = { name: "Synthetic continuity patient", birthDate: "", sourceUid: sending.doctor.uid, sourceLocalId: `synthetic-${run}` };
  const registered = await registerCareProfile(sending.doctor.uid, profile);
  expect(auth.currentUser?.uid).toBe(sending.doctor.uid);
  await expect(registerCareProfile(sending.doctor.uid, profile)).rejects.toThrow("already connected");
  const sourceView = registered.view;
  await assign(source, sourceView, [sending.nurse, sending.lab]);
  await login(receiving.doctor);
  await expect(loadCareProfile(receiving.doctor.uid, sourceView.id)).rejects.toMatchObject({ code: "permission-denied" });
  for (const [role, kind] of [["doctor", "prescription"], ["nurse", "observation"], ["lab", "laboratory"]] as const) {
    const person = sending[role]; await login(person);
    const view = await loadCareProfile(person.uid, sourceView.id);
    await contributeCare(person.uid, view, kind, `Synthetic ${role} entry; no treatment recommendation`);
    if (role !== "doctor") await expect(contributeCare(person.uid, view, "prescription", "Forbidden draft")).rejects.toThrow("cannot make");
  }
  await login(source);
  await expect(contributeCare(source.uid, await loadCareProfile(source.uid, sourceView.id), "prescription", "Forbidden admin draft")).rejects.toThrow("staff account");
  await login(sending.doctor);
  const full = await loadCareProfile(sending.doctor.uid, sourceView.id);
  expect(full.entries).toHaveLength(3);
  const fields = { ...emptyReferralFields(), reason: "Synthetic referral for continuity test" };
  const draft = new CareDraftSession(sending.doctor.uid, full.id);
  await draft.save({ fields, destination: destination.uid, capacity: "32768" });
  expect((await loadCareProfile(sending.doctor.uid, full.id)).entries).toHaveLength(3);
  await expect(createCareHandoff(sending.doctor.uid, full, destination.uid, fields, 48)).rejects.toThrow();
  expect((await readCareDraft(sending.doctor.uid, full.id))?.fields.reason).toBe(fields.reason);
  network.loseResponse = true;
  await expect(createCareHandoff(sending.doctor.uid, full, destination.uid, fields, 32768, draft.revision)).rejects.toThrow("completion is not confirmed");
  const approved = await readPendingCareHandoff(sending.doctor.uid, full.id);
  expect(approved?.status).toBe("pending");
  await expect(createCareHandoff(sending.doctor.uid, full, destination.uid, fields, 32768, draft.revision)).rejects.toThrow("completion is not confirmed");
  network.unavailable = false;
  const [handoff, simultaneous] = await Promise.all([
    createCareHandoff(sending.doctor.uid, full, destination.uid, fields, 32768, draft.revision),
    createCareHandoff(sending.doctor.uid, full, destination.uid, fields, 32768, draft.revision),
  ]);
  expect(handoff.id).toBe(approved?.handoff.id); expect(handoff.packet).toEqual(unbase64(approved!.handoff.packet));
  expect(simultaneous.packet).toEqual(handoff.packet);
  expect((await loadCareProfile(sending.doctor.uid, full.id)).entries.filter(e => e.id === handoff.id)).toHaveLength(1);
  await draft.complete();
  expect((await readCareDraft(sending.doctor.uid, full.id))?.cleared).toBe(true);
  expect(handoff.savedLocally).toBe(true);
  const recovered = await latestCareHandoff(sending.doctor.uid, full.id);
  expect(recovered?.id).toBe(handoff.id);
  expect(unbase64(recovered!.packet)).toEqual(handoff.packet);
  expect((await loadCareProfile(sending.doctor.uid, full.id)).entries).toHaveLength(4);
  const stored = (await getDocFromServer(doc(await careDb(sending.doctor.uid), "careHandoffs", handoff.id))).data();
  expect(JSON.stringify(stored)).not.toContain(profile.name);
  expect(JSON.stringify(stored)).not.toContain(registered.code);
  expect(new TextDecoder().decode(handoff.packet)).not.toContain(fields.reason);

  await login(destination);
  expect(await listCareProfiles(destination.uid)).not.toContain(full.id);
  vi.stubGlobal("navigator", { onLine: false });
  const corrupt = handoff.packet.slice(); corrupt[corrupt.length - 1] ^= 1;
  await expect(receiveCareHandoff(destination.uid, corrupt)).rejects.toThrow();
  expect(await careReceipts(destination.uid, full.id)).toHaveLength(0);
  const basic = await receiveCareHandoff(destination.uid, handoff.packet);
  expect(basic.snapshotOnly).toBe(true); expect(basic.verified).toBe(false);
  expect(basic.entries[0].fields?.allergies || "").toBe("");
  expect(await loadCareProfile(destination.uid, full.id)).toEqual(basic);
  vi.stubGlobal("navigator", { onLine: true });
  const verified = await receiveCareHandoff(destination.uid, handoff.packet);
  expect(verified.verified).toBe(true);
  const incomingFull = await loadCareProfile(destination.uid, full.id);
  expect(incomingFull.snapshotOnly).toBe(false); expect(incomingFull.entries).toHaveLength(4);
  vi.stubGlobal("navigator", { onLine: false });
  await receiveCareHandoff(destination.uid, handoff.packet);
  expect((await readCareCopy(destination.uid, full.id))?.snapshotOnly).toBe(false);
  const [retainedReceipt] = await careReceipts(destination.uid, full.id);
  expect(retainedReceipt.verified).toBe(true);
  expect(retainedReceipt.receivedAt).toBe(basic.receivedAt);
  vi.stubGlobal("navigator", { onLine: true });
  await assign(destination, incomingFull, Object.values(receiving));
  for (const [role, kind] of [["doctor", "clinical-note"], ["nurse", "administration"], ["lab", "laboratory"]] as const) {
    const person = receiving[role]; await login(person);
    const view = await loadCareProfile(person.uid, full.id);
    await contributeCare(person.uid, view, kind, `Synthetic receiving ${role} entry`);
  }
  await signInWithEmailAndPassword(auth, motherLoginEmail(full.id), registered.code);
  const motherUid = auth.currentUser!.uid;
  expect(motherUid).not.toBe(sending.doctor.uid);
  await expect(loadCareProfile(motherUid, full.id, "wrong-code")).rejects.toThrow();
  const mother = await loadCareProfile(motherUid, full.id, registered.code);
  expect(mother.entries).toHaveLength(3);
  expect(mother.entries.map(e => e.serverAt).every(Boolean)).toBe(true);
  expect(mother.entries.some(e => e.kind === "referral")).toBe(false);
  await expect(contributeCare(motherUid, mother, "prescription", "Forbidden Mother draft")).rejects.toThrow("staff account");
  expect(await latestCareHandoff(motherUid, full.id)).toBeUndefined();
  vi.stubGlobal("navigator", { onLine: false });
  expect((await loadCareProfile(motherUid, full.id)).entries).toHaveLength(3);
  vi.stubGlobal("navigator", { onLine: true });

  await login(source); await assignCareStaff(source.uid, sending.nurse.uid, sending.nurse.name, "nurse", false);
  await login(sending.nurse);
  await expect(loadCareProfile(sending.nurse.uid, full.id)).rejects.toMatchObject({ code: "permission-denied" });
  vi.stubGlobal("navigator", { onLine: false });
  expect((await loadCareProfile(sending.nurse.uid, full.id)).profile.name).toBe(profile.name);
  vi.stubGlobal("navigator", { onLine: true });
  await expect(contributeCare(sending.nurse.uid, full, "observation", "Revoked staff draft")).rejects.toThrow("staff account");

  // Competing actual transactions for one saved approval, after a pre-commit
  // timeout and revocation. Revocation cannot become permission to retry.
  await login(sending.doctor);
  const nextDraft = new CareDraftSession(sending.doctor.uid, full.id, await readCareDraft(sending.doctor.uid, full.id));
  const nextFields = { ...fields, reason: "Second explicitly approved synthetic referral" };
  await nextDraft.save({ fields: nextFields, destination: destination.uid, capacity: "32768" });
  network.failBefore=true;
  const retry = () => createCareHandoff(sending.doctor.uid, full, destination.uid, nextFields, 32768, nextDraft.revision);
  await expect(retry()).rejects.toThrow("completion is not confirmed");
  await login(source); await assignCareStaff(source.uid, sending.doctor.uid, sending.doctor.name, "doctor", false);
  await login(sending.doctor); await expect(retry()).rejects.toThrow("completion is not confirmed");
  await login(source); await assignCareStaff(source.uid, sending.doctor.uid, sending.doctor.name, "doctor", true);
  await login(sending.doctor);
  const competing = await Promise.all([retry(), retry()]);
  expect(competing[0].packet).toEqual(competing[1].packet);
  const afterRetry = await loadCareProfile(sending.doctor.uid, full.id);
  expect(afterRetry.entries).toHaveLength(8);
  expect(afterRetry.entries.filter(e => e.id === competing[0].id)).toHaveLength(1);
  await login(source); await assignCareStaff(source.uid, sending.doctor.uid, sending.doctor.name, "doctor", false);
  await login(sending.doctor);
  // Authors can still read their exact committed handoff, even though revoked
  // case access now prevents reading entries or creating another one.
  expect((await retry()).packet).toEqual(competing[0].packet);
});

it("registers at a facility, pairs with Mother consent and approves immutable copied records",async()=>{
 const origin=await facility("intake-origin"),destination=await facility("intake-destination"),people=await team(origin);
 await login(origin);
 const registered=await registerCareProfile(origin.uid,{name:"Synthetic intake patient",birthDate:"1998-05-03",sourceLocalId:crypto.randomUUID(),sourceUid:origin.uid},true);
 await grantCareProfile(origin.uid,registered.view,people.doctor.uid);await grantCareProfile(origin.uid,registered.view,people.nurse.uid);
 await signInWithEmailAndPassword(auth,motherLoginEmail(registered.id),registered.code);
 const motherUid=auth.currentUser!.uid,view=await loadCareProfile(motherUid,registered.id,registered.code);
 const pairing=await createPatientPairing(motherUid,view,destination.uid);
 const record={id:crypto.randomUUID(),kind:"prescriptions" as const,title:"Synthetic copied record",source:"Original inspected separately",date:"2026-11-09",addedAt:new Date().toISOString(),enteredBy:motherUid,manual:{title:"Synthetic copied record",dose:"",route:"",administeredAt:"",notes:"Fictional record; no treatment advice"}};
 const id=await submitMotherRecord(motherUid,view,record);
 expect(await submitMotherRecord(motherUid,view,record)).toBe(id);
 await expect(submitMotherRecord(motherUid,view,{...record,title:"Changed"})).rejects.toThrow("different version");
 await expect(approveMotherRecord(motherUid,view.id,id,true)).rejects.toThrow("Doctor");
 await login(origin);await expect(redeemPatientPairing(origin.uid,pairing.code)).rejects.toThrow();
 await login(destination);const paired=await redeemPatientPairing(destination.uid,pairing.code);expect(paired.profile.name).toBe("Synthetic intake patient");expect(await listCareProfiles(destination.uid)).toContain(view.id);
 await expect(redeemPatientPairing(destination.uid,pairing.code)).rejects.toThrow("already used");
 await login(people.nurse);await expect(approveMotherRecord(people.nurse.uid,view.id,id,true)).rejects.toThrow("Doctor");
 await login(people.doctor);await expect(approveMotherRecord(people.doctor.uid,view.id,id,false)).rejects.toThrow("original separately");
 const before=await listMotherRecords(people.doctor.uid,await loadCareProfile(people.doctor.uid,view.id));expect(before[0].record).toEqual(record);expect(before[0].approved).toBeUndefined();
 await approveMotherRecord(people.doctor.uid,view.id,id,true);await approveMotherRecord(people.doctor.uid,view.id,id,true);
 await signInWithEmailAndPassword(auth,motherLoginEmail(registered.id),registered.code);
 const after=await listMotherRecords(motherUid,await loadCareProfile(motherUid,view.id));expect(after).toHaveLength(1);expect(after[0].approved?.reviewerUid).toBe(people.doctor.uid);expect(after[0].record).toEqual(record);
},60000);
