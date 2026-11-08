import { beforeAll, beforeEach, afterAll, it, expect } from "vitest";
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
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  deleteField,
  query,
  where,
  limit,
  orderBy,
  writeBatch,
  serverTimestamp,
  Timestamp,
  type DocumentData,
} from "firebase/firestore";
let env: RulesTestEnvironment;
const db = (uid: string) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
const scope = {
  enabled: true,
  staffUid: "staff",
  facilityUid: "facility",
  staffKeyId: "a".repeat(64),
  facilityKeyId: "b".repeat(64),
  category: "doctor",
};
const approvalId =
  "11111111-1111-4111-a111-111111111111_22222222-2222-4222-a222-222222222222";
const target = (uid: string, author = "staff") =>
  doc(db(uid), "referralApprovals", author, "versions", approvalId);
async function admin(path: string, change: DocumentData) {
  await env.withSecurityRulesDisabled((c) =>
    updateDoc(doc(c.firestore(), path), change),
  );
}
async function current() {
  let data: DocumentData | undefined;
  await env.withSecurityRulesDisabled(async (c) => {
    data = (
      await getDoc(doc(c.firestore(), "clinicalCredentials", "staff"))
    ).data();
  });
  return data;
}
async function transition(
  actor: string,
  status: string,
  overrides: DocumentData = {},
  eventOverrides: DocumentData = {},
  omitEvent = false,
) {
  const store = db(actor),
    batch = writeBatch(store),
    old = await current(),
    eventId = crypto.randomUUID();
  const ref = doc(store, "clinicalCredentials", "staff");
  batch.set(ref, {
    status,
    createdAt: old?.createdAt || serverTimestamp(),
    updatedAt: serverTimestamp(),
    updatedBy: actor,
    lastEventId: eventId,
    ...overrides,
  });
  if (!omitEvent)
    batch.set(doc(ref, "events", eventId), {
      status,
      actorUid: actor,
      at: serverTimestamp(),
      previousEventId: old?.lastEventId || "",
      ...eventOverrides,
    });
  return batch.commit().catch((error) => {
    throw Object.assign(new Error(`${actor}/${status}: ${error.message}`), {
      code: error.code,
    });
  });
}
async function approved() {
  await transition("staff", "pending");
  await transition("facility", "approved");
}
async function approvalData() {
  return {
    doctorUid: "staff",
    doctorKeyId: scope.staffKeyId,
    facilityUid: "facility",
    credentialEventId: (await current())?.lastEventId || crypto.randomUUID(),
    contentHash: "c".repeat(64),
    createdAt: serverTimestamp(),
  };
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-matrisync-credential-rules",
    firestore: {
      host: "127.0.0.1",
      port: 8087,
      rules: readFileSync("firestore.sharing.rules", "utf8"),
    },
  });
});
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (c) => {
    for (const [uid, role, key] of [
      ["staff", "professional", "a"],
      ["facility", "organization", "b"],
      ["outsider", "organization", "d"],
    ])
      await setDoc(doc(c.firestore(), "members", uid), {
        enabled: true,
        role,
        keyId: key.repeat(64),
      });
    await setDoc(doc(c.firestore(), "facilityApprovers", "facility"), {
      enabled: true,
      keyId: scope.facilityKeyId,
    });
    await setDoc(doc(c.firestore(), "credentialScopes", "staff"), scope);
  });
});
afterAll(async () => {
  await env?.cleanup();
});

it("allows named submission, facility rejection/resubmission/approval, immutable history and terminal suspension", async () => {
  await assertSucceeds(transition("staff", "pending"));
  await assertSucceeds(transition("facility", "rejected"));
  await assertSucceeds(transition("staff", "pending"));
  await assertSucceeds(transition("facility", "approved"));
  await assertSucceeds(setDoc(target("staff"), await approvalData()));
  const oldApproval = (await getDoc(target("staff"))).data();
  await assertSucceeds(transition("facility", "suspended"));
  await assertFails(transition("staff", "pending"));
  await assertFails(transition("facility", "approved"));
  expect((await getDoc(target("staff"))).data()).toEqual(oldApproval);
  const events = await assertSucceeds(
    getDocs(
      query(
        collection(db("staff"), "clinicalCredentials", "staff", "events"),
        orderBy("at", "desc"),
        limit(20),
      ),
    ),
  );
  expect(events.size).toBe(5);
  await assertFails(updateDoc(events.docs[0].ref, { status: "approved" }));
  await assertFails(deleteDoc(events.docs[0].ref));
  await assertFails(
    deleteDoc(doc(db("facility"), "clinicalCredentials", "staff")),
  );
});
it("rejects self-approval, wrong facilities, unsubmitted approvals and all client bootstrap/category writes", async () => {
  await assertFails(transition("staff", "approved"));
  await assertFails(transition("facility", "approved"));
  await assertFails(transition("outsider", "pending"));
  await transition("staff", "pending");
  await assertFails(transition("staff", "approved"));
  await assertFails(transition("outsider", "approved"));
  await assertFails(
    setDoc(doc(db("outsider"), "facilityApprovers", "outsider"), {
      enabled: true,
      keyId: "d".repeat(64),
    }),
  );
  await assertFails(
    updateDoc(doc(db("staff"), "credentialScopes", "staff"), {
      category: "doctor",
      facilityUid: "outsider",
    }),
  );
  await assertFails(
    setDoc(doc(db("staff"), "members", "staff"), {
      enabled: true,
      role: "organization",
      keyId: "a".repeat(64),
    }),
  );
});
it("denies public, unrelated, unbounded and orphan queries while allowing exact application queries", async () => {
  await transition("staff", "pending");
  await assertSucceeds(
    getDocs(
      query(
        collection(db("facility"), "credentialScopes"),
        where("facilityUid", "==", "facility"),
        limit(20),
      ),
    ),
  );
  await assertSucceeds(getDoc(doc(db("staff"), "credentialScopes", "staff")));
  await assertFails(getDocs(collection(db("facility"), "credentialScopes")));
  await assertFails(
    getDocs(
      query(
        collection(
          env.unauthenticatedContext().firestore(),
          "credentialScopes",
        ),
        limit(20),
      ),
    ),
  );
  await assertFails(
    getDoc(doc(db("outsider"), "clinicalCredentials", "staff")),
  );
  await assertFails(
    getDocs(
      query(
        collection(db("outsider"), "clinicalCredentials", "staff", "events"),
        limit(20),
      ),
    ),
  );
  await assertFails(
    getDocs(collection(db("staff"), "clinicalCredentials", "staff", "events")),
  );
  await assertFails(
    getDocs(
      query(
        collection(db("facility"), "clinicalCredentials", "missing", "events"),
        limit(20),
      ),
    ),
  );
  await assertFails(
    getDoc(
      doc(
        env.unauthenticatedContext().firestore(),
        "clinicalCredentials",
        "staff",
      ),
    ),
  );
});
it("validates both create/update schemas, types, timestamps and atomic decision history", async () => {
  for (const overrides of [
    { status: "other" },
    { updatedBy: "outsider" },
    { extra: true },
    { updatedBy: "a".repeat(1000) },
    { updatedAt: "today" },
    { createdAt: Timestamp.fromMillis(1) },
    { lastEventId: "bad" },
  ])
    await assertFails(transition("staff", "pending", overrides));
  await assertFails(transition("staff", "pending", {}, {}, true));
  await assertFails(
    setDoc(doc(db("staff"), "clinicalCredentials", "staff"), {
      status: "pending",
    }),
  );
  await assertFails(
    setDoc(
      doc(
        db("staff"),
        "clinicalCredentials",
        "staff",
        "events",
        crypto.randomUUID(),
      ),
      {
        status: "pending",
        actorUid: "staff",
        at: serverTimestamp(),
        previousEventId: "",
      },
    ),
  );
  await transition("staff", "pending");
  for (const field of [
    "status",
    "createdAt",
    "updatedAt",
    "updatedBy",
    "lastEventId",
  ])
    await assertFails(
      updateDoc(doc(db("facility"), "clinicalCredentials", "staff"), {
        [field]: deleteField(),
      }),
    );
  for (const overrides of [
    { status: 3 },
    { extra: "x" },
    { updatedBy: "staff" },
    { createdAt: Timestamp.fromMillis(1) },
    { updatedAt: Timestamp.fromMillis(1) },
    { lastEventId: "x".repeat(100000) },
  ])
    await assertFails(transition("facility", "approved", overrides));
  for (const event of [
    { extra: true },
    { actorUid: "staff" },
    { previousEventId: "" },
    { status: "suspended" },
    { at: "today" },
  ])
    await assertFails(transition("facility", "approved", {}, event));
  await assertFails(transition("facility", "approved", {}, {}, true));
  await transition("facility", "approved");
  await assertFails(transition("facility", "approved"));
});

it("allows only one of competing facility decisions and records one immutable successor event", async () => {
  await transition("staff", "pending");
  const result = await Promise.allSettled([
    transition("facility", "approved"),
    transition("facility", "rejected"),
  ]);
  expect(result.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  const state = await current();
  expect(["approved", "rejected"]).toContain(state!.status);
  const history = await getDocs(
    query(
      collection(db("staff"), "clinicalCredentials", "staff", "events"),
      orderBy("at", "desc"),
      limit(20),
    ),
  );
  expect(history.size).toBe(2);
  expect(history.docs[0].id).toBe(state!.lastEventId);
});
it("blocks future decisions and approvals when any enrolled authority or key is revoked or mismatched", async () => {
  await approved();
  for (const [path, field, original, wrong] of [
    ["facilityApprovers/facility", "enabled", true, false],
    [
      "facilityApprovers/facility",
      "keyId",
      scope.facilityKeyId,
      "d".repeat(64),
    ],
    ["credentialScopes/staff", "enabled", true, false],
    ["credentialScopes/staff", "staffKeyId", scope.staffKeyId, "d".repeat(64)],
    ["members/staff", "enabled", true, false],
    ["members/staff", "role", "professional", "mother"],
    ["members/facility", "enabled", true, false],
    ["members/facility", "role", "organization", "professional"],
    ["members/facility", "keyId", scope.facilityKeyId, "d".repeat(64)],
  ] as const) {
    await admin(path, { [field]: wrong });
    await assertFails(setDoc(target("staff"), await approvalData()));
    await assertFails(transition("facility", "suspended"));
    await admin(path, { [field]: original });
  }
  await assertSucceeds(setDoc(target("staff"), await approvalData()));
});
it("never turns caregiver approval or generic professional membership into doctor approval", async () => {
  await assertFails(setDoc(target("staff"), await approvalData()));
  await admin("credentialScopes/staff", { category: "caregiver" });
  await approved();
  await assertFails(setDoc(target("staff"), await approvalData()));
});
it("keeps approval ownership, exact digest and credential event immutable and private", async () => {
  await approved();
  const data = await approvalData();
  for (const change of [
    { doctorUid: "outsider" },
    { facilityUid: "outsider" },
    { doctorKeyId: "d".repeat(64) },
    { credentialEventId: crypto.randomUUID() },
    { contentHash: "x".repeat(100000) },
    { contentHash: 4 },
    { extra: true },
    { createdAt: Timestamp.fromMillis(1) },
  ])
    await assertFails(setDoc(target("staff"), { ...data, ...change }));
  await assertFails(setDoc(target("staff", "outsider"), data));
  await assertFails(setDoc(target("facility"), data));
  await assertSucceeds(setDoc(target("staff"), data));
  await assertSucceeds(getDoc(target("facility")));
  await assertFails(getDoc(target("outsider")));
  await assertFails(
    getDocs(
      query(
        collection(db("staff"), "referralApprovals", "staff", "versions"),
        limit(20),
      ),
    ),
  );
  await assertFails(
    updateDoc(target("staff"), { contentHash: "d".repeat(64) }),
  );
  await assertFails(deleteDoc(target("staff")));
  await assertFails(setDoc(target("staff"), data));
});

it("gates future direct and assigned transfers on scoped credentials without erasing historical approvals", async () => {
  const point = {
    kty: "EC",
    crv: "P-256",
    x: "a".repeat(43),
    y: "b".repeat(43),
  };
  const key = (id: string) => ({
    encryption: point,
    signing: point,
    keyId: id.repeat(64),
  });
  const channel = {
    enabled: true,
    members: ["source", "staff"],
    senderUid: "source",
    recipientUid: "staff",
    sender: key("c"),
    recipient: key("a"),
  };
  await env.withSecurityRulesDisabled(async (c) => {
    await setDoc(doc(c.firestore(), "members", "source"), {
      enabled: true,
      role: "mother",
      keyId: "c".repeat(64),
    });
    await setDoc(doc(c.firestore(), "channels", "direct"), channel);
    await setDoc(doc(c.firestore(), "channels", "assigned"), {
      ...channel,
      assignmentRouteId: "patient-scope",
    });
    await setDoc(doc(c.firestore(), "assignmentRoutes", "patient-scope"), {
      enabled: true,
      participants: ["source", "facility", "staff"],
      sourceUid: "source",
      sourcePatientId: "self",
      profileId: "d".repeat(64),
      staffUid: "staff",
      facilityUid: "facility",
      sourceKeyId: "c".repeat(64),
      staffKeyId: scope.staffKeyId,
      facilityKeyId: scope.facilityKeyId,
    });
    await setDoc(doc(c.firestore(), "staffAssignments", "patient-scope"), {
      status: "accepted",
    });
  });
  const packet = () => ({
    version: 1,
    senderUid: "source",
    recipientUid: "staff",
    senderKeyId: "c".repeat(64),
    recipientKeyId: scope.staffKeyId,
    ciphertext: "a".repeat(220),
    createdAt: serverTimestamp(),
  });
  const transfer = (actor: string, channel: string) =>
    doc(
      db(actor),
      "channels",
      channel,
      "transfers",
      "11111111-1111-4111-a111-111111111111",
    );
  for (const name of ["direct", "assigned"])
    await assertFails(setDoc(transfer("source", name), packet()));
  await approved();
  await setDoc(target("staff"), await approvalData());
  for (const name of ["direct", "assigned"]) {
    await assertSucceeds(setDoc(transfer("source", name), packet()));
    await assertSucceeds(getDoc(transfer("staff", name)));
  }
  await transition("facility", "suspended");
  for (const name of ["direct", "assigned"]) {
    await assertFails(getDoc(transfer("staff", name)));
    await assertFails(
      getDocs(
        query(
          collection(db("staff"), "channels", name, "transfers"),
          orderBy("createdAt", "desc"),
          limit(20),
        ),
      ),
    );
  }
  await assertSucceeds(getDoc(target("staff")));
});
