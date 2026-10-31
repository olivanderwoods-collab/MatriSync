import { beforeAll, beforeEach, afterAll, describe, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  updateDoc,
  deleteDoc,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";

let env: RulesTestEnvironment;
const point = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
const device = (key = "a") => ({
  encryption: point,
  signing: point,
  keyId: key.repeat(64),
});
const member = (key = "a") => ({
  enabled: true,
  role: "mother",
  keyId: key.repeat(64),
});
const channel = {
  enabled: true,
  members: ["sender", "recipient"],
  senderUid: "sender",
  recipientUid: "recipient",
  sender: device(),
  recipient: device("b"),
};
const id = "11111111-1111-4111-a111-111111111111";
const db = (uid: string) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
const transfer = () => ({
  version: 1,
  senderUid: "sender",
  recipientUid: "recipient",
  senderKeyId: "a".repeat(64),
  recipientKeyId: "b".repeat(64),
  ciphertext: "a".repeat(220),
  createdAt: serverTimestamp(),
});
const target = (uid: string) =>
  doc(db(uid), "channels", "approved", "transfers", id);
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-matrisync-sharing-rules",
    firestore: {
      host: "127.0.0.1",
      port: 8087,
      rules: readFileSync("firestore.sharing.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const store = ctx.firestore();
    await setDoc(doc(store, "members", "sender"), member());
    await setDoc(doc(store, "members", "recipient"), member("b"));
    await setDoc(doc(store, "channels", "approved"), channel);
  });
});
afterAll(async () => {
  await env?.cleanup();
});
describe("controlled sharing rules", () => {
  const manifest = () => ({ version: 2, senderUid: "sender", recipientUid: "recipient", senderKeyId: "a".repeat(64),
    recipientKeyId: "b".repeat(64), chunkCount: 2, ciphertextLength: 700001, ciphertextHash: "a".repeat(64), createdAt: serverTimestamp() });
  const upload = (uid: string) => doc(db(uid), "channels", "approved", "uploads", id);
  const chunk = (uid: string, index = "0") => doc(upload(uid), "chunks", index);
  const part = (index = 0) => ({ index, ciphertext: "a".repeat(index === 0 ? 400000 : 300001), createdAt: serverTimestamp() });
  it("keeps staging private, publishes immutable manifests and denies chunk enumeration", async () => {
    await assertFails(setDoc(chunk("sender"), part()));
    await assertFails(setDoc(target("sender"), manifest()));
    await assertFails(setDoc(upload("recipient"), manifest()));
    await assertSucceeds(setDoc(upload("sender"), manifest()));
    await assertSucceeds(setDoc(chunk("sender"), part()));
    await assertFails(getDoc(chunk("recipient")));
    await assertFails(getDoc(upload("recipient")));
    await assertFails(getDocs(collection(db("sender"), "channels", "approved", "uploads")));
    await assertFails(getDocs(collection(upload("sender"), "chunks")));
    await assertSucceeds(setDoc(chunk("sender", "1"), part(1)));
    await assertSucceeds(setDoc(target("sender"), manifest()));
    await assertSucceeds(getDoc(chunk("recipient")));
    await assertFails(getDoc(chunk("stranger")));
    await assertFails(getDoc(doc(env.unauthenticatedContext().firestore(), "channels", "approved", "uploads", id, "chunks", "0")));
    await assertFails(updateDoc(chunk("sender"), { ciphertext: "b".repeat(400000) }));
    await assertFails(deleteDoc(chunk("sender")));
    await assertFails(updateDoc(upload("sender"), { ciphertextHash: "b".repeat(64) }));
    await assertFails(updateDoc(target("sender"), { chunkCount: 3 }));
    await assertFails(deleteDoc(upload("sender")));
  });
  it("validates every manifest/chunk field, bound, timestamp and final staging match", async () => {
    for (const change of [{ patientName: "plaintext" }, { version: 1 }, { senderUid: "recipient" },
      { recipientKeyId: "c".repeat(64) }, { chunkCount: 71 }, { chunkCount: 1.5 }, { chunkCount: 1 },
      { ciphertextLength: 28000001 }, { ciphertextLength: 700000 }, { ciphertextHash: "bad" }, { createdAt: new Date(0) }])
      await assertFails(setDoc(upload("sender"), { ...manifest(), ...change }));
    for (const key of Object.keys(manifest())) {
      const value: Record<string, unknown> = { ...manifest() }; delete value[key];
      await assertFails(setDoc(upload("sender"), value));
    }
    await assertSucceeds(setDoc(upload("sender"), manifest()));
    for (const change of [{ extra: "plaintext" }, { index: 70 }, { index: -1 }, { index: 0.5 },
      { ciphertext: "a".repeat(400001) }, { ciphertext: "a".repeat(399999) }, { ciphertext: " ".repeat(400000) }, { createdAt: new Date(0) }])
      await assertFails(setDoc(chunk("sender"), { ...part(), ...change }));
    for (const key of Object.keys(part())) {
      const value: Record<string, unknown> = { ...part() }; delete value[key];
      await assertFails(setDoc(chunk("sender"), value));
    }
    await assertFails(setDoc(chunk("sender", "01"), part(1)));
    await assertFails(setDoc(chunk("recipient"), part()));
    await assertFails(setDoc(target("sender"), { ...manifest(), ciphertextHash: "b".repeat(64) }));
  });
  it("blocks staged continuation and committed chunk reads after revocation or key change", async () => {
    await assertSucceeds(setDoc(upload("sender"), manifest()));
    await assertSucceeds(setDoc(chunk("sender"), part()));
    await assertSucceeds(setDoc(target("sender"), manifest()));
    for (const change of [{ enabled: false }, { enabled: true, keyId: "c".repeat(64) }]) {
      await env.withSecurityRulesDisabled(ctx => updateDoc(doc(ctx.firestore(), "members", "recipient"), change));
      await assertFails(getDoc(chunk("recipient")));
      await assertFails(setDoc(chunk("sender", "1"), part(1)));
    }
  });
  it("keeps identity verifiers, ownership, grants, receipts and rate limits server-only", async () => {
    const paths = ["patientIdentities/patient", "patientIdentities/patient/directGrants/sender",
      "patientIdentities/patient/events/event", "identitySources/source", "identityOwners/sender",
      "identityRequests/request", "identityRateLimits/sender"];
    await env.withSecurityRulesDisabled(async ctx => {
      for (const path of paths) await setDoc(doc(ctx.firestore(), path), { verifier: "server-only", ownerUid: "sender" });
    });
    for (const path of paths) {
      const ref = doc(db("sender"), path);
      await assertFails(getDoc(ref));
      await assertFails(getDocs(collection(db("sender"), path.slice(0, path.lastIndexOf("/")))));
      await assertFails(setDoc(ref, { ownerUid: "sender" }));
      await assertFails(updateDoc(ref, { ownerUid: "sender" }));
      await assertFails(deleteDoc(ref));
    }
    await assertFails(setDoc(doc(db("sender"), "patientIdentities", "new"), { ownerUid: "sender" }));
  });
  it("allows only an immutable owner public-device request, never self approval", async () => {
    await assertSucceeds(
      setDoc(doc(db("new"), "deviceRequests", "new"), device()),
    );
    await assertFails(
      setDoc(doc(db("new"), "deviceRequests", "new"), device("b")),
    );
    await assertFails(getDoc(doc(db("sender"), "deviceRequests", "new")));
    await assertFails(
      setDoc(doc(db("new"), "deviceRequests", "other"), device()),
    );
    await assertFails(
      setDoc(doc(db("private"), "deviceRequests", "private"), {
        ...device(),
        encryption: { ...point, d: "private-key" },
      }),
    );
    await assertFails(setDoc(doc(db("new"), "members", "new"), member()));
    await assertFails(
      updateDoc(doc(db("sender"), "members", "sender"), {
        role: "organization",
      }),
    );
    await assertFails(setDoc(doc(db("sender"), "channels", "forged"), channel));
    await assertFails(getDocs(collection(db("sender"), "deviceRequests")));
  });
  it("constrains connection queries to approved members and bounded results", async () => {
    await assertSucceeds(
      getDocs(
        query(
          collection(db("sender"), "channels"),
          where("members", "array-contains", "sender"),
          limit(20),
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(db("sender"), "channels"),
          where("members", "array-contains", "sender"),
        ),
      ),
    );
    await assertFails(
      getDocs(query(collection(db("sender"), "channels"), limit(20))),
    );
    await assertFails(getDoc(doc(db("stranger"), "channels", "approved")));
    await assertFails(
      getDoc(
        doc(env.unauthenticatedContext().firestore(), "channels", "approved"),
      ),
    );
    await assertFails(
      getDoc(
        doc(
          env
            .authenticatedContext("sender", {
              firebase: { sign_in_provider: "anonymous" },
            })
            .firestore(),
          "channels",
          "approved",
        ),
      ),
    );
  });
  it("delivers immutable ciphertext only from the sender to the approved pair", async () => {
    await assertFails(setDoc(target("recipient"), transfer()));
    await assertFails(setDoc(target("stranger"), transfer()));
    await assertSucceeds(setDoc(target("sender"), transfer()));
    await assertSucceeds(getDoc(target("recipient")));
    await assertSucceeds(
      getDocs(
        query(
          collection(db("recipient"), "channels", "approved", "transfers"),
          limit(20),
        ),
      ),
    );
    await assertFails(
      getDocs(collection(db("recipient"), "channels", "approved", "transfers")),
    );
    await assertFails(getDoc(target("stranger")));
    await assertFails(setDoc(target("sender"), transfer()));
    await assertFails(
      updateDoc(target("sender"), { ciphertext: "b".repeat(220) }),
    );
    await assertFails(deleteDoc(target("sender")));
  });
  it("rejects injected plaintext, forged keys, timestamps and oversized ciphertext", async () => {
    for (const change of [
      { patientName: "Private name" },
      { senderUid: "recipient" },
      { recipientKeyId: "c".repeat(64) },
      { createdAt: new Date(0) },
      { ciphertext: "x".repeat(700001) },
      { ciphertext: "invalid plaintext" },
    ])
      await assertFails(setDoc(target("sender"), { ...transfer(), ...change }));
  });
  it("blocks future reads and writes after connection revocation", async () => {
    await assertSucceeds(setDoc(target("sender"), transfer()));
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), "channels", "approved"), {
        enabled: false,
      });
    });
    await assertFails(getDoc(target("recipient")));
    await assertFails(
      setDoc(
        doc(
          db("sender"),
          "channels",
          "approved",
          "transfers",
          "22222222-2222-4222-a222-222222222222",
        ),
        transfer(),
      ),
    );
    await assertSucceeds(getDoc(doc(db("recipient"), "channels", "approved")));
  });
  it("blocks a revoked member or changed approved device key on either side", async () => {
    await assertSucceeds(setDoc(target("sender"), transfer()));
    for (const uid of ["sender", "recipient"]) {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "members", uid), {
          enabled: false,
        });
      });
      await assertFails(getDoc(target("recipient")));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await updateDoc(doc(ctx.firestore(), "members", uid), {
          enabled: true,
          keyId: "c".repeat(64),
        });
      });
      await assertFails(getDoc(target("recipient")));
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), "members", uid),
          member(uid === "sender" ? "a" : "b"),
        );
      });
    }
  });
});
