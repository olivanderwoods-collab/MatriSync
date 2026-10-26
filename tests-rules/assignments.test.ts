import { beforeAll, beforeEach, afterAll, describe, it, expect } from "vitest";
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
  deleteField,
  query,
  where,
  limit,
  serverTimestamp,
} from "firebase/firestore";
let env: RulesTestEnvironment;
const point = { kty: "EC", crv: "P-256", x: "a".repeat(43), y: "b".repeat(43) };
const device = (key: string) => ({
  encryption: point,
  signing: point,
  keyId: key.repeat(64),
});
const route = {
  enabled: true,
  participants: ["source", "facility", "staff"],
  sourceUid: "source",
  sourcePatientId: "self",
  profileId: "a".repeat(64),
  facilityUid: "facility",
  staffUid: "staff",
  sourceKeyId: "a".repeat(64),
  facilityKeyId: "c".repeat(64),
  staffKeyId: "b".repeat(64),
};
const channel = {
  enabled: true,
  members: ["source", "staff"],
  senderUid: "source",
  recipientUid: "staff",
  sender: device("a"),
  recipient: device("b"),
  assignmentRouteId: "scope",
};
const db = (uid: string) =>
  env
    .authenticatedContext(uid, { firebase: { sign_in_provider: "password" } })
    .firestore();
const assignment = (uid: string) => doc(db(uid), "staffAssignments", "scope");
const pending = () => ({
  status: "pending",
  createdBy: "facility",
  updatedBy: "facility",
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  acceptedAt: null,
  revokedAt: null,
});
const accept = () => ({
  status: "accepted",
  updatedBy: "staff",
  updatedAt: serverTimestamp(),
  acceptedAt: serverTimestamp(),
});
const revoke = () => ({
  status: "revoked",
  updatedBy: "facility",
  updatedAt: serverTimestamp(),
  revokedAt: serverTimestamp(),
});
const transfer = () => ({
  version: 1,
  senderUid: "source",
  recipientUid: "staff",
  senderKeyId: "a".repeat(64),
  recipientKeyId: "b".repeat(64),
  ciphertext: "a".repeat(220),
  createdAt: serverTimestamp(),
});
const target = (
  uid: string,
  connection = "assigned",
  id = "11111111-1111-4111-a111-111111111111",
) => doc(db(uid), "channels", connection, "transfers", id);
async function admin(path: string, value: Record<string, unknown>) {
  await env.withSecurityRulesDisabled((ctx) =>
    updateDoc(doc(ctx.firestore(), path), value),
  );
}
async function accepted() {
  await assertSucceeds(setDoc(assignment("facility"), pending()));
  await assertSucceeds(updateDoc(assignment("staff"), accept()));
}
beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: "demo-matrisync-assignment-rules",
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
    for (const [uid, role, key] of [
      ["source", "mother", "a"],
      ["staff", "professional", "b"],
      ["facility", "organization", "c"],
      ["outsider", "professional", "d"],
    ])
      await setDoc(doc(store, "members", uid), {
        enabled: true,
        role,
        keyId: key.repeat(64),
      });
    await setDoc(doc(store, "assignmentRoutes", "scope"), route);
    await setDoc(doc(store, "channels", "assigned"), channel);
    const direct = { ...channel };
    delete (direct as Partial<typeof channel>).assignmentRouteId;
    await setDoc(doc(store, "channels", "direct"), direct);
  });
});
afterAll(async () => {
  await env?.cleanup();
});
describe("staff assignment authorization", () => {
  it("never lets a simultaneous acceptance resurrect a withdrawn assignment", async () => {
    await assertSucceeds(setDoc(assignment("facility"), pending()));
    const results = await Promise.allSettled([
      updateDoc(assignment("staff"), accept()),
      updateDoc(assignment("facility"), revoke()),
    ]);
    expect(results[1].status).toBe("fulfilled");
    expect((await getDoc(assignment("staff"))).data()?.status).toBe("revoked");
    await assertFails(updateDoc(assignment("staff"), accept()));
    await assertFails(setDoc(target("source"), transfer()));
  });
  it("requires an offer and named staff acceptance before any transfer read or write", async () => {
    await assertFails(setDoc(target("source"), transfer()));
    await assertFails(getDoc(target("staff")));
    await assertSucceeds(setDoc(assignment("facility"), pending()));
    await assertFails(setDoc(target("source"), transfer()));
    await assertFails(
      getDocs(
        query(
          collection(db("staff"), "channels", "assigned", "transfers"),
          limit(20),
        ),
      ),
    );
    await assertFails(updateDoc(assignment("facility"), accept()));
    await assertFails(updateDoc(assignment("source"), accept()));
    await assertFails(updateDoc(assignment("outsider"), accept()));
    await assertSucceeds(updateDoc(assignment("staff"), accept()));
    await assertSucceeds(setDoc(target("source"), transfer()));
    await assertSucceeds(getDoc(target("staff")));
  });
  it("denies self-approval, foreign routes, forged initial status and unauthorized queries", async () => {
    for (const uid of ["source", "staff", "outsider"])
      await assertFails(setDoc(assignment(uid), pending()));
    await assertFails(
      setDoc(doc(db("facility"), "assignmentRoutes", "forged"), route),
    );
    await assertFails(
      updateDoc(doc(db("staff"), "assignmentRoutes", "scope"), {
        staffUid: "outsider",
      }),
    );
    await assertFails(
      setDoc(assignment("facility"), {
        ...pending(),
        status: "accepted",
        acceptedAt: serverTimestamp(),
      }),
    );
    await assertFails(
      setDoc(doc(db("facility"), "staffAssignments", "missing"), pending()),
    );
    await assertFails(getDoc(doc(db("outsider"), "assignmentRoutes", "scope")));
    await assertFails(getDoc(assignment("outsider")));
    await assertFails(
      getDocs(
        collection(
          env.unauthenticatedContext().firestore(),
          "assignmentRoutes",
        ),
      ),
    );
    await assertFails(
      getDocs(
        query(
          collection(db("staff"), "assignmentRoutes"),
          where("participants", "array-contains", "staff"),
        ),
      ),
    );
    await assertSucceeds(
      getDocs(
        query(
          collection(db("staff"), "assignmentRoutes"),
          where("participants", "array-contains", "staff"),
          limit(20),
        ),
      ),
    );
    await assertFails(getDocs(collection(db("staff"), "staffAssignments")));
  });
  it("validates create and update schemas, actors, immutable dates and required fields", async () => {
    for (const change of [
      { patientName: "private" },
      { createdBy: "staff" },
      { createdAt: new Date(0) },
      { status: 4 },
      { status: "x".repeat(10000) },
      { acceptedAt: "yesterday" },
      { updatedBy: "outsider" },
    ])
      await assertFails(
        setDoc(assignment("facility"), { ...pending(), ...change }),
      );
    const omitted = { ...pending() } as Record<string, unknown>;
    delete omitted.revokedAt;
    await assertFails(setDoc(assignment("facility"), omitted));
    await assertSucceeds(setDoc(assignment("facility"), pending()));
    for (const change of [
      { createdAt: new Date(0) },
      { createdBy: "staff" },
      { extra: "x" },
      { updatedBy: "facility" },
      { acceptedAt: new Date(0) },
      { revokedAt: serverTimestamp() },
      { createdBy: deleteField() },
      { status: "x".repeat(10000) },
      { updatedAt: "now" },
    ])
      await assertFails(
        updateDoc(assignment("staff"), { ...accept(), ...change }),
      );
    await assertSucceeds(updateDoc(assignment("staff"), accept()));
    await assertFails(updateDoc(assignment("staff"), accept()));
    await assertFails(deleteDoc(assignment("facility")));
  });
  it("makes revocation terminal, blocks later deliveries and preserves independent direct authorization", async () => {
    await accepted();
    await assertSucceeds(setDoc(target("source"), transfer()));
    await assertFails(updateDoc(assignment("staff"), revoke()));
    await assertSucceeds(updateDoc(assignment("facility"), revoke()));
    await assertFails(getDoc(target("staff")));
    await assertFails(
      setDoc(
        target("source", "assigned", "22222222-2222-4222-a222-222222222222"),
        transfer(),
      ),
    );
    await assertFails(updateDoc(assignment("staff"), accept()));
    await assertFails(setDoc(assignment("facility"), pending()));
    await assertSucceeds(setDoc(target("source", "direct"), transfer()));
    await assertSucceeds(getDoc(target("staff", "direct")));
  });
  it("lets a facility withdraw a pending offer but never accepts after withdrawal", async () => {
    await assertSucceeds(setDoc(assignment("facility"), pending()));
    await assertSucceeds(updateDoc(assignment("facility"), revoke()));
    await assertFails(updateDoc(assignment("staff"), accept()));
    await assertFails(getDoc(target("staff")));
  });
  it("checks all three approvals and fingerprints on future access", async () => {
    await accepted();
    await assertSucceeds(setDoc(target("source"), transfer()));
    for (const [uid, key] of [
      ["source", "a"],
      ["staff", "b"],
      ["facility", "c"],
    ]) {
      await admin(`members/${uid}`, { enabled: false });
      await assertFails(getDoc(target("staff")));
      await admin(`members/${uid}`, { enabled: true, keyId: "f".repeat(64) });
      await assertFails(getDoc(target("staff")));
      await admin(`members/${uid}`, { keyId: key.repeat(64) });
    }
    await admin("members/facility", { role: "professional" });
    await assertFails(getDoc(target("staff")));
    await admin("members/facility", { role: "organization" });
    await admin("assignmentRoutes/scope", { enabled: false });
    await assertFails(getDoc(target("staff")));
  });
  it("rejects channel substitution and orphaned or suspended scopes", async () => {
    await accepted();
    await assertSucceeds(setDoc(target("source"), transfer()));
    await admin("assignmentRoutes/scope", { staffUid: "outsider" });
    await assertFails(getDoc(target("staff")));
    await admin("assignmentRoutes/scope", {
      staffUid: "staff",
      sourceUid: "outsider",
    });
    await assertFails(getDoc(target("staff")));
    await admin("channels/assigned", { assignmentRouteId: "missing" });
    await assertFails(getDoc(target("staff")));
    await assertFails(
      updateDoc(doc(db("staff"), "channels", "assigned"), {
        assignmentRouteId: deleteField(),
      }),
    );
  });
});
