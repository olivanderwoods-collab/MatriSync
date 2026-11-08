import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  encryptCloudRecords,
  decryptCloudRecords,
  recordBackupAdapter,
} from "../src/records-cloud";
import type { RecordData } from "../src/records-model";
let env: RulesTestEnvironment;
const uid = "owner-a";
const owner = () =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
const target = (db: ReturnType<typeof owner>, account = uid) =>
  doc(db, "recordOwners", account, "vaults", "patients");
const pass = "separate test backup phrase";
const sample: RecordData = {
  version: 1,
  patients: [
    {
      id: "random-patient",
      name: "Private Patient",
      birthDate: "",
      history: "Private history",
      createdAt: "2026-10-22T00:00:00Z",
      updatedAt: "2026-10-22T00:00:00Z",
    },
  ],
  documents: [
    {
      id: "local-file",
      patientId: "random-patient",
      name: "secret-report.pdf",
      type: "application/pdf",
      size: 42,
      kind: "reports",
      addedAt: "2026-10-22T00:00:00Z",
      source: "secret facility",
      reportDate: "",
    },
  ],
};
async function envelope() {
  return {
    ...(await encryptCloudRecords(uid, sample, pass)),
    kind: "patient-records",
    generation: 1,
    updatedAt: serverTimestamp(),
  };
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-matrisync",
    firestore: {
      host: "127.0.0.1",
      port: 8086,
      rules: readFileSync("firestore.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
});
afterAll(async () => {
  await env?.cleanup();
});

describe("prototype encrypted-record Firestore rules", () => {
  it("round-trips encrypted structured records and excludes documents from the decrypted backup", async () => {
    const db = owner();
    const adapter = recordBackupAdapter(db, uid, async () => {});
    const first = await encryptCloudRecords(uid, sample, pass);
    expect(first.ciphertext).not.toContain("Private Patient");
    await expect(adapter.write(first, undefined)).resolves.toEqual({
      revision: first.revision,
      generation: 1,
    });
    const saved = (await adapter.read())!;
    const restored = await decryptCloudRecords(uid, saved, pass);
    expect(restored.patients).toEqual(sample.patients);
    expect(restored.documents).toEqual([]);
    expect(JSON.stringify(restored)).not.toContain("secret-report");
    await expect(
      decryptCloudRecords("other-account", saved, pass),
    ).rejects.toThrow();
    const next = await encryptCloudRecords(uid, sample, pass, saved.salt);
    await expect(adapter.write(next, saved.revision)).resolves.toEqual({
      revision: next.revision,
      generation: 2,
    });
    await expect(adapter.write(first, saved.revision)).rejects.toThrow(
      "cloud copy changed",
    );
  });
  it("denies unauthenticated, anonymous and foreign account reads, creates, updates and deletes", async () => {
    const value = await envelope();
    await assertSucceeds(setDoc(target(owner()), value));
    for (const db of [
      env.unauthenticatedContext().firestore(),
      env.authenticatedContext("other").firestore(),
      env
        .authenticatedContext(uid, {
          firebase: { sign_in_provider: "anonymous" },
        })
        .firestore(),
    ]) {
      await assertFails(getDoc(target(db)));
      await assertFails(setDoc(target(db), value));
      await assertFails(setDoc(target(db, "other-owner"), value));
      await assertFails(updateDoc(target(db), { generation: 2 }));
      await assertFails(deleteDoc(target(db)));
    }
    await assertFails(deleteDoc(target(owner())));
  });
  it("denies public/owner list queries, unrecognized paths and self-assigned privileges", async () => {
    for (const db of [owner(), env.unauthenticatedContext().firestore()]) {
      await assertFails(getDocs(collection(db, "recordOwners")));
      await assertFails(getDocs(collection(db, "recordOwners", uid, "vaults")));
      await assertFails(setDoc(doc(db, "users", uid), { role: "admin" }));
      await assertFails(
        setDoc(doc(db, "recordOwners", uid, "reports", "photo"), {
          contents: "plaintext",
        }),
      );
    }
  });
  it("validates required fields, types, bounds, metadata and plaintext-field injection on create and update", async () => {
    const db = owner();
    const value = await envelope();
    const mutations = [
      { name: "plaintext name" },
      { documents: [] },
      { role: "admin" },
      { ownerId: "other" },
      { salt: "bad" },
      { iv: 123 },
      { ciphertext: "x" },
      { ciphertext: "A".repeat(700001) },
      { version: 2 },
      { kind: "photos" },
      { revision: "short" },
      { generation: -1 },
      { updatedAt: new Date("2000-01-01") },
    ];
    for (const mutation of mutations)
      await assertFails(setDoc(target(db), { ...value, ...mutation }));
    const omitted = { ...value } as Record<string, unknown>;
    delete omitted.iv;
    await assertFails(setDoc(target(db), omitted));
    await assertSucceeds(setDoc(target(db), value));
    const next = { ...(await envelope()), salt: value.salt, generation: 2 };
    for (const mutation of mutations)
      await assertFails(setDoc(target(db), { ...next, ...mutation }));
    const missing = { ...next } as Record<string, unknown>;
    delete missing.iv;
    await assertFails(setDoc(target(db), missing));
  });
  it("denies salt replacement, stale generations and IV/revision reuse", async () => {
    const db = owner();
    const first = await envelope();
    await setDoc(target(db), first);
    const next = { ...(await envelope()), generation: 2 };
    await assertFails(setDoc(target(db), next));
    await assertFails(
      setDoc(target(db), { ...next, salt: first.salt, generation: 1 }),
    );
    await assertFails(
      setDoc(target(db), { ...next, salt: first.salt, iv: first.iv }),
    );
    await assertFails(
      setDoc(target(db), {
        ...next,
        salt: first.salt,
        revision: first.revision,
      }),
    );
    await assertSucceeds(setDoc(target(db), { ...next, salt: first.salt }));
  });
});
