import { beforeAll, afterAll, beforeEach, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, updateDoc, deleteDoc, serverTimestamp, Timestamp, writeBatch, collection, query, where, limit, getDocs } from "firebase/firestore";
let env: RulesTestEnvironment;
const caseId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const client = (uid: string) => env.authenticatedContext(uid, { firebase: { sign_in_provider: "password" } }).firestore();
const grant = (uid: string, viaNfc = false) => ({ caseId, uid, facilityId: uid === "receiving" ? "receiving" : "facility", grantedBy: "doctor", viaNfc, wrapped: "encrypted-key", createdAt: serverTimestamp() });
const entry = (uid: string, role: string, kind: string) => ({ actorUid: uid, actorName: uid, role, kind, encrypted: "encrypted-clinical-text", createdAt: serverTimestamp() });
beforeAll(async () => { env = await initializeTestEnvironment({ projectId: "demo-matrisync-care-rules", firestore: { host: "127.0.0.1", port: 8086, rules: readFileSync("firestore.rules", "utf8") } }); });
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async context => {
    const db = context.firestore();
    for (const uid of ["facility", "receiving"]) await setDoc(doc(db, "careFacilities", uid), { name: uid, enabled: true });
    for (const [uid, role] of [["doctor", "doctor"], ["nurse", "nurse"], ["lab", "lab"], ["outsider", "doctor"]]) {
      await setDoc(doc(db, "careStaff", uid), { facilityId: "facility", name: uid, role, enabled: true });
      if (uid !== "outsider") await setDoc(doc(db, "careAccess", `${caseId}_${uid}`), grant(uid));
    }
    await setDoc(doc(db, "careAccess", `${caseId}_facility`), grant("facility"));
    await setDoc(doc(db, "careCases", caseId), { creatorUid: "doctor", facilityId: "facility", motherUid: "mother", motherSalt: "s".repeat(24), motherWrapped: "encrypted", encrypted: "encrypted", createdAt: Timestamp.now() });
  });
});
it("enforces Doctor/Nurse/Lab contribution kinds, UID and server time with append-only history", async () => {
  for (const [uid, role, kind] of [["doctor", "doctor", "prescription"], ["nurse", "nurse", "observation"], ["lab", "lab", "laboratory"]]) {
    const ref = doc(client(uid), "careCases", caseId, "entries", crypto.randomUUID());
    await assertSucceeds(setDoc(ref, entry(uid, role, kind)));
    await assertFails(updateDoc(ref, { encrypted: "replacement" })); await assertFails(deleteDoc(ref));
  }
  for (const [uid, role, kind] of [["nurse", "nurse", "prescription"], ["nurse", "doctor", "referral"], ["lab", "lab", "observation"], ["outsider", "doctor", "prescription"], ["mother", "doctor", "referral"], ["facility", "doctor", "prescription"]])
    await assertFails(setDoc(doc(client(uid), "careCases", caseId, "entries", crypto.randomUUID()), entry(uid, role, kind)));
  for (const bad of [{ ...entry("doctor", "doctor", "clinical-note"), actorUid: "nurse" }, { ...entry("doctor", "doctor", "clinical-note"), createdAt: Timestamp.fromMillis(0) }, { ...entry("doctor", "doctor", "clinical-note"), extraData: "bad" }])
    await assertFails(setDoc(doc(client("doctor"), "careCases", caseId, "entries", crypto.randomUUID()), bad));
});
it("allows assigned staff/Mother and rejects strangers, self-assigned roles and revoked access", async () => {
  for (const uid of ["doctor", "nurse", "lab", "mother", "facility"]) await assertSucceeds(getDoc(doc(client(uid), "careCases", caseId)));
  await assertFails(getDoc(doc(client("outsider"), "careCases", caseId)));
  await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "careCases", caseId)));
  await assertFails(setDoc(doc(client("outsider"), "careStaff", "outsider"), { name: "outsider", facilityId: "facility", role: "doctor", enabled: true, updatedAt: serverTimestamp() }));
  await assertFails(setDoc(doc(client("nurse"), "careAccess", `${caseId}_outsider`), { ...grant("outsider"), grantedBy: "nurse" }));
  await env.withSecurityRulesDisabled(async c => { await updateDoc(doc(c.firestore(), "careStaff", "nurse"), { enabled: false }); });
  await assertFails(getDoc(doc(client("nurse"), "careCases", caseId)));
});
it("requires an atomic one-use invitation for facility privileges and prevents reuse", async () => {
  const inviteId = "a".repeat(64), db = client("new-facility");
  await env.withSecurityRulesDisabled(c => setDoc(doc(c.firestore(), "careFacilityInvites", inviteId), { redeemedBy: "", redeemedAt: null, expiresAt: Timestamp.fromMillis(Date.now() + 60000) }));
  const value = { name: "Fictional facility", enabled: true, inviteId, createdAt: serverTimestamp() };
  await assertFails(setDoc(doc(db, "careFacilities", "new-facility"), value));
  const batch = writeBatch(db); batch.set(doc(db, "careFacilities", "new-facility"), value); batch.update(doc(db, "careFacilityInvites", inviteId), { redeemedBy: "new-facility", redeemedAt: serverTimestamp() });
  await assertSucceeds(batch.commit());
  const other = client("another"), repeat = writeBatch(other); repeat.set(doc(other, "careFacilities", "another"), value); repeat.update(doc(other, "careFacilityInvites", inviteId), { redeemedBy: "another", redeemedAt: serverTimestamp() });
  await assertFails(repeat.commit());
  await assertFails(getDocs(collection(db, "careFacilityInvites")));
});
it("supports app queries but prevents enumerating NFC-only incoming patient references", async () => {
  const db = client("doctor");
  await assertSucceeds(setDoc(doc(db, "careAccess", `${caseId}_receiving`), grant("receiving", true)));
  await assertSucceeds(getDocs(query(collection(db, "careAccess"), where("uid", "==", "doctor"), where("viaNfc", "==", false), limit(50))));
  const incoming = client("receiving");
  await assertFails(getDocs(query(collection(incoming, "careAccess"), where("uid", "==", "receiving"), limit(50))));
  expect((await assertSucceeds(getDocs(query(collection(incoming, "careAccess"), where("uid", "==", "receiving"), where("viaNfc", "==", false), limit(50))))).size).toBe(0);
  await assertSucceeds(getDoc(doc(incoming, "careCases", caseId)));
  await assertSucceeds(getDocs(query(collection(client("mother"), "careCases"), where("motherUid", "==", "mother"), limit(50))));
});
it("binds new case and initial encrypted key grants to the creating Doctor's facility", async () => {
  const id = crypto.randomUUID(), db = client("doctor"), batch = writeBatch(db);
  batch.set(doc(db, "careCases", id), { creatorUid: "doctor", facilityId: "facility", motherUid: "new-mother", motherSalt: "s".repeat(24), motherWrapped: "encrypted", encrypted: "encrypted", createdAt: serverTimestamp() });
  for (const uid of ["doctor", "facility"]) batch.set(doc(db, "careAccess", `${id}_${uid}`), { ...grant(uid), caseId: id });
  await assertSucceeds(batch.commit());
  await assertFails(setDoc(doc(client("nurse"), "careCases", crypto.randomUUID()), { creatorUid: "nurse", facilityId: "facility", motherUid: "new-mother", motherSalt: "s".repeat(24), motherWrapped: "encrypted", encrypted: "encrypted", createdAt: serverTimestamp() }));
});
