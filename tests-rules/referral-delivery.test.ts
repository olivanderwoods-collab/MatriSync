import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  getDocs,
  collection,
  query,
  orderBy,
  limit,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
let env: RulesTestEnvironment;
const db = (uid: string) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
const id =
    "11111111-1111-4111-a111-111111111111_22222222-2222-4222-a222-222222222222",
  event = "33333333-3333-4333-a333-333333333333",
  hash = "f".repeat(64);
const delivery = (uid: string, channel = "incoming") =>
  doc(db(uid), "channels", channel, "referrals", id);
const initiation = (uid: string) =>
  doc(db(uid), "channels", "incoming", "referralInitiations", id);
const data = () => ({
  version: 1,
  approvalId: id,
  contentHash: hash,
  senderUid: "doctor",
  recipientUid: "facility",
  senderKeyId: "a".repeat(64),
  recipientKeyId: "b".repeat(64),
  ciphertext: "a".repeat(400),
  createdAt: serverTimestamp(),
});
const initiated = () => ({
  approvalId: id,
  contentHash: hash,
  initiatedBy: "facility",
  destinationChannelId: "outgoing",
  destinationUid: "destination",
  destinationKeyId: "c".repeat(64),
  createdAt: serverTimestamp(),
});
async function admin(path: string, change: DocumentData) {
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), path), change),
  );
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-matrisync-referral-rules",
    firestore: {
      host: "127.0.0.1",
      port: 8087,
      rules: readFileSync("firestore.sharing.rules", "utf8"),
    },
  });
});
afterAll(async () => env?.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    const s = c.firestore();
    for (const [uid, role, key] of [
      ["doctor", "professional", "a"],
      ["facility", "organization", "b"],
      ["destination", "organization", "c"],
      ["outsider", "professional", "d"],
    ])
      await setDoc(doc(s, "members", uid), {
        enabled: true,
        role,
        keyId: key.repeat(64),
      });
    await setDoc(doc(s, "facilityApprovers", "facility"), {
      enabled: true,
      keyId: "b".repeat(64),
    });
    await setDoc(doc(s, "credentialScopes", "doctor"), {
      enabled: true,
      staffUid: "doctor",
      facilityUid: "facility",
      staffKeyId: "a".repeat(64),
      facilityKeyId: "b".repeat(64),
      category: "doctor",
    });
    await setDoc(doc(s, "clinicalCredentials", "doctor"), {
      status: "approved",
      lastEventId: event,
    });
    await setDoc(doc(s, "referralApprovals", "doctor", "versions", id), {
      doctorUid: "doctor",
      doctorKeyId: "a".repeat(64),
      facilityUid: "facility",
      credentialEventId: event,
      contentHash: hash,
      createdAt: Timestamp.fromMillis(1),
    });
    for (const [name, sender, recipient, sk, rk] of [
      ["incoming", "doctor", "facility", "a", "b"],
      ["outgoing", "facility", "destination", "b", "c"],
      ["wrong", "doctor", "destination", "a", "c"],
    ])
      await setDoc(doc(s, "channels", name), {
        enabled: true,
        members: [sender, recipient],
        senderUid: sender,
        recipientUid: recipient,
        sender: { keyId: sk.repeat(64) },
        recipient: { keyId: rk.repeat(64) },
      });
  });
});
it("allows exact approved delivery, bounded receiving query and distinct immutable Organization initiation", async () => {
  await assertSucceeds(setDoc(delivery("doctor"), data()));
  expect(
    (
      await assertSucceeds(
        getDocs(
          query(
            collection(db("facility"), "channels", "incoming", "referrals"),
            orderBy("createdAt", "desc"),
            limit(20),
          ),
        ),
      )
    ).size,
  ).toBe(1);
  expect((await getDoc(initiation("facility"))).exists()).toBe(false);
  await assertSucceeds(setDoc(initiation("facility"), initiated()));
  await assertSucceeds(getDoc(initiation("doctor")));
  for (const ref of [delivery("doctor"), initiation("facility")]) {
    await assertFails(updateDoc(ref, { contentHash: "0".repeat(64) }));
    await assertFails(deleteDoc(ref));
    await assertFails(setDoc(ref, {}));
  }
});
it("rejects outsider, public, wrong-facility, unbounded and orphan access", async () => {
  await assertFails(setDoc(delivery("outsider"), data()));
  await assertFails(setDoc(delivery("facility"), data()));
  await assertFails(
    setDoc(delivery("doctor", "wrong"), {
      ...data(),
      recipientUid: "destination",
      recipientKeyId: "c".repeat(64),
    }),
  );
  await assertFails(getDoc(delivery("outsider")));
  await assertFails(
    getDoc(
      doc(
        env.unauthenticatedContext().firestore(),
        "channels",
        "incoming",
        "referrals",
        id,
      ),
    ),
  );
  await assertFails(
    getDocs(collection(db("facility"), "channels", "incoming", "referrals")),
  );
  await assertFails(setDoc(delivery("doctor", "missing"), data()));
  await assertFails(setDoc(initiation("facility"), initiated()));
  await setDoc(delivery("doctor"), data());
  await assertFails(setDoc(initiation("doctor"), initiated()));
  await assertFails(setDoc(initiation("destination"), initiated()));
  await assertFails(
    getDocs(
      collection(db("facility"), "channels", "incoming", "referralInitiations"),
    ),
  );
});
it("allows only one destination when two initiation requests race", async () => {
  await setDoc(delivery("doctor"), data());
  await env.withSecurityRulesDisabled(async (c) => {
    const s = c.firestore();
    await setDoc(doc(s, "members", "destination-two"), {
      enabled: true,
      role: "organization",
      keyId: "e".repeat(64),
    });
    await setDoc(doc(s, "channels", "outgoing-two"), {
      enabled: true,
      members: ["facility", "destination-two"],
      senderUid: "facility",
      recipientUid: "destination-two",
      sender: { keyId: "b".repeat(64) },
      recipient: { keyId: "e".repeat(64) },
    });
  });
  const choices = [
    initiated(),
    {
      ...initiated(),
      destinationChannelId: "outgoing-two",
      destinationUid: "destination-two",
      destinationKeyId: "e".repeat(64),
    },
  ];
  const results = await Promise.allSettled(
    choices.map((choice) => setDoc(initiation("facility"), choice)),
  );
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
  const winner = choices[results.findIndex((r) => r.status === "fulfilled")];
  const saved = (await getDoc(initiation("facility"))).data();
  expect(saved?.destinationUid).toBe(winner.destinationUid);
  expect(saved?.destinationChannelId).toBe(winner.destinationChannelId);
  expect(saved?.destinationKeyId).toBe(winner.destinationKeyId);
});
it("rejects malformed, missing, extra, forged and oversized delivery and initiation fields", async () => {
  for (const key of Object.keys(data())) {
    const d: DocumentData = data();
    delete d[key];
    await assertFails(setDoc(delivery("doctor"), d));
  }
  for (const change of [
    { extra: "plaintext" },
    { ciphertext: "a".repeat(700001) },
    { contentHash: "x" },
    { contentHash: 0 },
    { version: 2 },
    { senderUid: "outsider" },
    { recipientKeyId: "d".repeat(64) },
    { createdAt: Timestamp.fromMillis(1) },
    { approvalId: "wrong" },
  ])
    await assertFails(setDoc(delivery("doctor"), { ...data(), ...change }));
  await setDoc(delivery("doctor"), data());
  for (const key of Object.keys(initiated())) {
    const d: DocumentData = initiated();
    delete d[key];
    await assertFails(setDoc(initiation("facility"), d));
  }
  for (const change of [
    { extra: "plaintext" },
    { approvalId: "wrong" },
    { contentHash: "0".repeat(64) },
    { initiatedBy: "doctor" },
    { destinationChannelId: "a".repeat(201) },
    { destinationChannelId: "../outgoing" },
    { destinationChannelId: "incoming" },
    { destinationUid: "outsider" },
    { destinationKeyId: "d".repeat(64) },
    { createdAt: Timestamp.fromMillis(1) },
  ])
    await assertFails(
      setDoc(initiation("facility"), { ...initiated(), ...change }),
    );
});
it("denies future delivery and initiation after credential, facility, key or connection changes", async () => {
  await setDoc(delivery("doctor"), data());
  for (const [path, change, restore] of [
    [
      "clinicalCredentials/doctor",
      { status: "suspended" },
      { status: "approved" },
    ],
    [
      "clinicalCredentials/doctor",
      { lastEventId: crypto.randomUUID() },
      { lastEventId: event },
    ],
    [
      "credentialScopes/doctor",
      { category: "caregiver" },
      { category: "doctor" },
    ],
    ["credentialScopes/doctor", { enabled: false }, { enabled: true }],
    ["facilityApprovers/facility", { enabled: false }, { enabled: true }],
    ["members/doctor", { keyId: "d".repeat(64) }, { keyId: "a".repeat(64) }],
    ["channels/incoming", { enabled: false }, { enabled: true }],
  ] as [string, DocumentData, DocumentData][]) {
    await admin(path, change);
    await assertFails(setDoc(initiation("facility"), initiated()));
    await admin(path, restore);
  }
  for (const [path, change, restore] of [
    ["channels/outgoing", { enabled: false }, { enabled: true }],
    ["members/destination", { enabled: false }, { enabled: true }],
    ["members/destination", { role: "professional" }, { role: "organization" }],
    [
      "members/destination",
      { keyId: "d".repeat(64) },
      { keyId: "c".repeat(64) },
    ],
  ] as [string, DocumentData, DocumentData][]) {
    await admin(path, change);
    await assertFails(setDoc(initiation("facility"), initiated()));
    await admin(path, restore);
  }
  await admin("clinicalCredentials/doctor", { status: "suspended" });
  await assertFails(getDoc(delivery("facility")));
});
