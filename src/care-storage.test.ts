import "fake-indexeddb/auto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { careReceipts, latestCareHandoff, readCareCopy, savedCareIds, saveCareCopy, saveCareHandoff, saveCareReceipt, readCareDraft, saveCareDraft, clearCareDraft, type CareHandoffDraft, type SavedCareHandoff } from "./care-storage";
import { CareDraftSession } from "./care-draft-session";
import { emptyReferralFields } from "./referral-draft";
import { base64, unbase64 } from "./vault-crypto";
import { frameHandoff, unframeHandoff } from "./handoff-frame";
import { careHandoffDocument } from "./care-document";
import type { CareView } from "./care-model";

const auth = vi.hoisted(() => ({ currentUser: { uid: "", isAnonymous: false } }));
vi.mock("./auth", () => ({ accountAuth: async () => auth }));
beforeEach(() => { auth.currentUser = { uid: crypto.randomUUID(), isAnonymous: false }; });
function fixture() {
  const uid = auth.currentUser.uid, caseId = crypto.randomUUID();
  const profile = { name: "Private synthetic patient", birthDate: "1995-01-01", sourceLocalId: "local-patient", sourceUid: uid };
  const view: CareView = { id: caseId, key: "not-in-outgoing-copy", profile, entries: [], verified: true, snapshotOnly: false, receivedAt: "2026-11-08T01:00:00.000Z" };
  const packet = frameHandoff(new TextEncoder().encode("Exact recipient ciphertext · অপরিবর্তিত"), 32768);
  const saved: SavedCareHandoff = { version: 1, id: crypto.randomUUID(), caseId, sourceUid: uid, recipientUid: "receiving-facility", profile: { ...profile }, fields: { ...emptyReferralFields(), reason: "Original manually entered reason" }, packet: base64(packet), actorName: "Synthetic doctor", recordedAt: "2026-11-08T01:01:00.000Z" };
  return { uid, view, saved, packet };
}
async function raw<T>(mode: IDBTransactionMode, action: (s: IDBObjectStore) => IDBRequest<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open("matrisync-care-v1", 1);
    req.onsuccess = () => resolve(req.result); req.onerror = () => reject(req.error);
  });
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("copies", mode), req = action(tx.objectStore("copies"));
    tx.oncomplete = () => { db.close(); resolve(req.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
  });
}
describe("completed connected-care handoff recovery", () => {
  it("persists encrypted data and restores the original snapshot and exact framed packet", async () => {
    const f = fixture();
    await saveCareHandoff(f.uid, f.saved);
    const sealed = await raw<string>("readonly", s => s.get([f.uid, `outgoing:${f.view.id}:${f.saved.id}`]));
    for (const secret of [f.saved.profile.name, f.saved.fields.reason, f.saved.actorName, f.saved.packet]) expect(sealed).not.toContain(secret);
    const recovered = await latestCareHandoff(f.uid, f.view.id);
    expect(recovered).toEqual(f.saved);
    expect(unbase64(recovered!.packet)).toEqual(f.packet);
    expect(unframeHandoff(unbase64(recovered!.packet))).toEqual(unframeHandoff(f.packet));
    f.view.profile.name = "Changed later";
    await saveCareCopy(f.uid, f.view);
    const original = careHandoffDocument({ id: recovered!.caseId, profile: recovered!.profile }, recovered!.fields, recovered!.id, recovered!.actorName, recovered!.sourceUid, recovered!.recordedAt);
    expect(original).toContain("Private synthetic patient");
    expect(original).toContain(f.saved.recordedAt);
    expect(original).not.toContain("Changed later");
  });
  it("keeps outgoing records out of patient lists and received receipts", async () => {
    const f = fixture();
    await saveCareCopy(f.uid, f.view);
    await saveCareHandoff(f.uid, f.saved);
    const receipt = { ...f.view, handoffId: crypto.randomUUID() };
    await saveCareReceipt(f.uid, receipt);
    expect(await savedCareIds(f.uid)).toEqual([f.view.id]);
    expect(await readCareCopy(f.uid, f.view.id)).toEqual(f.view);
    expect(await careReceipts(f.uid, f.view.id)).toEqual([receipt]);
  });
  it("isolates patients, accounts and signed-out or anonymous sessions", async () => {
    const f = fixture(); await saveCareHandoff(f.uid, f.saved);
    expect(await latestCareHandoff(f.uid, crypto.randomUUID())).toBeUndefined();
    auth.currentUser.uid = "different-account";
    expect(await latestCareHandoff("different-account", f.view.id)).toBeUndefined();
    await expect(latestCareHandoff(f.uid, f.view.id)).rejects.toThrow("Sign in");
    await expect(saveCareHandoff("different-account", f.saved)).rejects.toThrow("account differs");
    auth.currentUser = { uid: f.uid, isAnonymous: true };
    await expect(latestCareHandoff(f.uid, f.view.id)).rejects.toThrow("Sign in");
  });
  it("never overwrites completed handoffs and selects the latest recorded version", async () => {
    const f = fixture(); await saveCareHandoff(f.uid, f.saved);
    await expect(saveCareHandoff(f.uid, { ...f.saved, actorName: "Changed" })).rejects.toThrow();
    expect(await latestCareHandoff(f.uid, f.view.id)).toEqual(f.saved);
    const later = { ...f.saved, id: crypto.randomUUID(), recordedAt: "2026-11-08T02:00:00.000Z" };
    await saveCareHandoff(f.uid, later);
    expect(await latestCareHandoff(f.uid, f.view.id)).toEqual(later);
    expect(await raw("readonly", s => s.get([f.uid, `outgoing:${f.view.id}:${f.saved.id}`]))).toBeTruthy();
  });
  it("rejects a valid encrypted record substituted under a different patient key", async () => {
    const f = fixture(); await saveCareHandoff(f.uid, f.saved);
    const sealed = await raw<string>("readonly", s => s.get([f.uid, `outgoing:${f.view.id}:${f.saved.id}`]));
    const otherCase = crypto.randomUUID();
    await raw("readwrite", s => s.put(sealed, [f.uid, `outgoing:${otherCase}:${f.saved.id}`]));
    await expect(latestCareHandoff(f.uid, otherCase)).rejects.toThrow("identity differs");
  });
  it("retains the first receipt and a later online check through concurrent offline rescans", async () => {
    const f = fixture(), first = { ...f.view, key: "", snapshotOnly: true, verified: false, handoffId: f.saved.id };
    await saveCareReceipt(f.uid, first);
    const verifiedAt = "2026-11-08T02:00:00.000Z";
    await Promise.all([
      saveCareReceipt(f.uid, { ...first, receivedAt: verifiedAt, verified: true, verifiedAt }),
      saveCareReceipt(f.uid, { ...first, receivedAt: "2026-11-08T03:00:00.000Z" }),
    ]);
    const laterOffline = await saveCareReceipt(f.uid, { ...first, receivedAt: "2026-11-08T04:00:00.000Z" });
    expect(laterOffline).toEqual({ ...first, verified: true, verifiedAt });
    expect(await careReceipts(f.uid, f.view.id)).toEqual([laterOffline]);
  });
  it("rejects changed patient details or clinical entries under an existing receipt identity", async () => {
    const f = fixture(), first = { ...f.view, handoffId: f.saved.id };
    await saveCareReceipt(f.uid, first);
    await expect(saveCareReceipt(f.uid, { ...first, profile: { ...first.profile, name: "Substituted patient" } })).rejects.toThrow("original receipt was preserved");
    await expect(saveCareReceipt(f.uid, { ...first, entries: [{ id: "changed", kind: "referral", actorUid: f.uid, actorName: "Different source", role: "doctor", recordedAt: first.receivedAt, serverAt: "", text: "Changed clinical information" }] })).rejects.toThrow("original receipt was preserved");
    expect(await careReceipts(f.uid, f.view.id)).toEqual([first]);
  });
  it("keeps legacy verification without inventing its missing timestamp", async () => {
    const f = fixture(), legacy = { ...f.view, handoffId: f.saved.id };
    await saveCareReceipt(f.uid, legacy);
    const rescanned = await saveCareReceipt(f.uid, { ...legacy, verified: false, receivedAt: "2026-11-09T01:00:00.000Z" });
    expect(rescanned.verified).toBe(true);
    expect(rescanned.verifiedAt).toBeUndefined();
    expect(rescanned.receivedAt).toBe(legacy.receivedAt);
  });
});

function draftFixture() {
  const f = fixture();
  const draft: CareHandoffDraft = { version: 1, caseId: f.view.id, sourceUid: f.uid, revision: crypto.randomUUID(), fields: { ...emptyReferralFields(), reason: "  Unfinished synthetic reason\nSecond line  " }, destination: "synthetic-facility", capacity: "", updatedAt: "2026-11-08T12:00:00.000Z" };
  return { ...f, draft };
}
describe("encrypted unfinished care drafts", () => {
  it("restores exact unfinished input without publishing a handoff or exposing plaintext", async () => {
    const f = draftFixture(); await saveCareCopy(f.uid, f.view);
    await saveCareDraft(f.uid, f.draft, null);
    expect(await readCareDraft(f.uid, f.view.id)).toEqual(f.draft);
    const sealed = await raw<string>("readonly", s => s.get([f.uid, `draft:${f.view.id}`]));
    for (const secret of [f.draft.fields.reason, f.draft.destination, f.uid]) expect(sealed).not.toContain(secret);
    expect(await savedCareIds(f.uid)).toEqual([f.view.id]);
    expect(await latestCareHandoff(f.uid, f.view.id)).toBeUndefined();
    expect(await careReceipts(f.uid, f.view.id)).toEqual([]);
  });
  it("isolates accounts/patients and rejects a substituted encrypted draft", async () => {
    const f = draftFixture(); await saveCareDraft(f.uid, f.draft, null);
    const other = crypto.randomUUID(); expect(await readCareDraft(f.uid, other)).toBeUndefined();
    const sealed = await raw<string>("readonly", s => s.get([f.uid, `draft:${f.view.id}`]));
    await raw("readwrite", s => s.put(sealed, [f.uid, `draft:${other}`]));
    await expect(readCareDraft(f.uid, other)).rejects.toThrow("identity");
    auth.currentUser.uid = "another-account";
    expect(await readCareDraft(auth.currentUser.uid, f.view.id)).toBeUndefined();
    await expect(readCareDraft(f.uid, f.view.id)).rejects.toThrow("Sign in");
  });
  it("allows only one competing update and preserves the winning revision", async () => {
    const f = draftFixture(); await saveCareDraft(f.uid, f.draft, null);
    const edits = ["First tab", "Second tab"].map(reason => ({ ...f.draft, revision: crypto.randomUUID(), fields: { ...f.draft.fields, reason } }));
    const results = await Promise.allSettled(edits.map(draft => saveCareDraft(f.uid, draft, f.draft.revision)));
    expect(results.filter(r => r.status === "fulfilled")).toHaveLength(1);
    expect(await readCareDraft(f.uid, f.view.id)).toEqual(edits[results.findIndex(r => r.status === "fulfilled")]);
  });
  it("clears only the approved revision and prevents stale-tab resurrection", async () => {
    const f = draftFixture(); await saveCareDraft(f.uid, f.draft, null);
    const newer = { ...f.draft, revision: crypto.randomUUID(), fields: { ...f.draft.fields, reason: "Newer unapproved draft" } };
    await saveCareDraft(f.uid, newer, f.draft.revision);
    await expect(clearCareDraft(f.uid, f.view.id, f.draft.revision)).rejects.toThrow("another tab");
    expect(await readCareDraft(f.uid, f.view.id)).toEqual(newer);
    const cleared = await clearCareDraft(f.uid, f.view.id, newer.revision);
    expect(cleared.cleared).toBe(true); expect(cleared.fields.reason).toBe("");
    await expect(saveCareDraft(f.uid, { ...f.draft, revision: crypto.randomUUID() }, null)).rejects.toThrow("another tab");
    await expect(saveCareDraft(f.uid, { ...f.draft, revision: crypto.randomUUID() }, newer.revision)).rejects.toThrow("another tab");
    const next = new CareDraftSession(f.uid, f.view.id, await readCareDraft(f.uid, f.view.id));
    expect(next.latest).toBeUndefined();
    await next.save({ fields: { ...f.draft.fields, reason: "Next intentional draft" }, destination: "", capacity: "32768" });
    expect((await readCareDraft(f.uid, f.view.id))?.fields.reason).toBe("Next intentional draft");
  });
  it("serializes fast edits and completes only after the latest input is durable", async () => {
    const f = draftFixture(), session = new CareDraftSession(f.uid, f.view.id);
    await Promise.all(["a", "ab", "abc"].map(reason => session.save({ fields: { ...f.draft.fields, reason }, destination: f.draft.destination, capacity: "32768" })));
    expect(session.pending).toBe(0); expect(session.error).toBe("");
    expect((await readCareDraft(f.uid, f.view.id))?.fields.reason).toBe("abc");
    await session.complete();
    expect((await readCareDraft(f.uid, f.view.id))?.cleared).toBe(true);
    expect(session.latest).toBeUndefined();
  });
  it("keeps unsaved edits available after a conflict and refuses to clear the other tab's draft", async () => {
    const f = draftFixture(), session = new CareDraftSession(f.uid, f.view.id);
    await saveCareDraft(f.uid, f.draft, null);
    await expect(session.save({ fields: { ...f.draft.fields, reason: "Unsaved local work" }, destination: "", capacity: "32768" })).rejects.toThrow("another tab");
    expect(session.latest?.fields.reason).toBe("Unsaved local work");
    expect(session.pending).toBe(0); expect(session.error).toContain("another tab");
    await expect(session.complete()).rejects.toThrow("another tab");
    expect(await readCareDraft(f.uid, f.view.id)).toEqual(f.draft);
  });
});
