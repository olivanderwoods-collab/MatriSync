import { accountAuth } from "./auth";
import { localSharingDevice } from "./sharing-storage";
import { wrapCare, unwrapCare } from "./care-crypto";
import type { CareView } from "./care-model";
import { emptyReferralFields, referralInput, type ReferralFields } from "./referral-draft";
export type CareHandoffDraft = {
  version: 1; caseId: string; sourceUid: string; revision: string;
  fields: ReferralFields; destination: string; capacity: string; updatedAt: string; cleared?: boolean;
};
export type SavedCareHandoff = {
  version: 1; id: string; caseId: string; sourceUid: string; recipientUid: string;
  profile: CareView["profile"]; fields: ReferralFields; packet: string;
  actorName: string; recordedAt: string;
};
async function storage<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("matrisync-care-v1", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("copies");
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error);
  });
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction("copies", mode), request = work(tx.objectStore("copies"));
    tx.oncomplete = () => { db.close(); resolve(request.result); };
    tx.onabort = tx.onerror = () => { db.close(); reject(Error("The encrypted care copy could not be saved.")); };
  });
}
export async function careAccount(uid: string) {
  const auth = await accountAuth();
  if (!uid || auth.currentUser?.uid !== uid || auth.currentUser.isAnonymous) throw Error("Sign in to this care account.");
  return auth;
}
export async function saveCareCopy(uid: string, value: CareView) {
  await careAccount(uid);
  const sealed = await wrapCare(value, await localSharingDevice(uid));
  await careAccount(uid); await storage("readwrite", s => s.put(sealed, [uid, value.id]));
}
export async function readCareCopy(uid: string, id: string): Promise<CareView | undefined> {
  await careAccount(uid);
  const sealed = await storage<string | undefined>("readonly", s => s.get([uid, id]));
  if (!sealed) return;
  const value = await unwrapCare(uid, sealed) as CareView;
  await careAccount(uid); if (value.id !== id) throw Error("Saved profile identity differs.");
  return value;
}
export async function savedCareIds(uid: string) {
  await careAccount(uid);
  const keys = await storage<IDBValidKey[]>("readonly", s => s.getAllKeys());
  return keys.filter(k => Array.isArray(k) && k[0] === uid && !String(k[1]).includes(":")).map(k => (k as string[])[1]);
}
// Store only confirmed handoffs, separately from patient copies and receipts.
// Keep the original snapshot and encrypted recipient packet; never regenerate it.
export async function saveCareHandoff(uid: string, value: SavedCareHandoff) {
  await careAccount(uid);
  if (value.sourceUid !== uid || value.version !== 1) throw Error("Saved handoff account differs.");
  const sealed = await wrapCare(value, await localSharingDevice(uid));
  await careAccount(uid);
  await storage("readwrite", s => s.add(sealed, [uid, `outgoing:${value.caseId}:${value.id}`]));
}
export async function latestCareHandoff(uid: string, caseId: string): Promise<SavedCareHandoff | undefined> {
  await careAccount(uid);
  const keys = (await storage<IDBValidKey[]>("readonly", s => s.getAllKeys())).filter(k => Array.isArray(k) && k[0] === uid && String(k[1]).startsWith(`outgoing:${caseId}:`));
  const values: SavedCareHandoff[] = [];
  for (const key of keys) {
    const value = await unwrapCare(uid, await storage<string>("readonly", s => s.get(key))) as SavedCareHandoff;
    if (value.version !== 1 || value.sourceUid !== uid || value.caseId !== caseId || (key as string[])[1] !== `outgoing:${value.caseId}:${value.id}`) throw Error("Saved handoff identity differs.");
    values.push(value);
  }
  await careAccount(uid);
  return values.sort((a, b) => b.recordedAt.localeCompare(a.recordedAt) || b.id.localeCompare(a.id))[0];
}
export async function saveCareReceipt(uid: string, value: CareView) {
  await careAccount(uid);
  if (!value.handoffId) throw Error("A received handoff needs its original identity.");
  const key = [uid, `receipt:${value.id}:${value.handoffId}`];
  const identity = (v: CareView) => JSON.stringify([v.id, v.handoffId, v.profile, v.entries]);
  for (let attempt = 0; attempt < 3; attempt++) {
    const previous = await storage<string | undefined>("readonly", s => s.get(key));
    const old = previous ? await unwrapCare(uid, previous) as CareView : undefined;
    if (old && identity(old) !== identity(value)) throw Error("This handoff ID already has different saved details. The original receipt was preserved.");
    // A later scan may add online verification, but never rewrite the original
    // snapshot/first receipt time or downgrade an earlier successful check.
    const verifiedAt = old?.verifiedAt || (value.verified ? value.verifiedAt : undefined);
    const retained = old ? { ...old, verified: old.verified || value.verified, ...(verifiedAt ? { verifiedAt } : {}) } : value;
    const sealed = await wrapCare(retained, await localSharingDevice(uid));
    await careAccount(uid);
    // Compare and write in one transaction so concurrent scans cannot undo an
    // online check while encryption runs outside IndexedDB's transaction.
    const actual = await storage<string | undefined>("readwrite", s => {
      const request = s.get(key);
      request.onsuccess = () => { if (request.result === previous) s.put(sealed, key); };
      return request;
    });
    if (actual === previous) return retained;
  }
  throw Error("The receipt changed in another tab. Reopen its saved copy before scanning again.");
}
export async function careReceipts(uid: string, id: string): Promise<CareView[]> {
  await careAccount(uid);
  const keys = (await storage<IDBValidKey[]>("readonly", s => s.getAllKeys())).filter(k => Array.isArray(k) && k[0] === uid && String(k[1]).startsWith(`receipt:${id}:`));
  const results: CareView[] = [];
  for (const key of keys) results.push(await unwrapCare(uid, await storage<string>("readonly", s => s.get(key))));
  await careAccount(uid); return results;
}
function checkDraft(uid: string, caseId: string, value: CareHandoffDraft) {
  if (!value || value.version !== 1 || value.sourceUid !== uid || value.caseId !== caseId || !/^[a-f0-9-]{36}$/.test(value.revision) || typeof value.destination !== "string" || value.destination.length > 128 || typeof value.capacity !== "string" || value.capacity.length > 10 || !Number.isFinite(Date.parse(value.updatedAt))) throw Error("Saved referral draft identity or format differs.");
  referralInput(value.fields); // Validate without trimming unfinished input.
  return value;
}
export async function readCareDraft(uid: string, caseId: string): Promise<CareHandoffDraft | undefined> {
  await careAccount(uid);
  const sealed = await storage<string | undefined>("readonly", s => s.get([uid, `draft:${caseId}`]));
  if (!sealed) return;
  const value = checkDraft(uid, caseId, await unwrapCare(uid, sealed));
  await careAccount(uid); return value;
}
async function changeCareDraft(uid: string, caseId: string, expectedRevision: string | null, next: CareHandoffDraft) {
  await careAccount(uid);
  const key = [uid, `draft:${caseId}`];
  const previous = await storage<string | undefined>("readonly", s => s.get(key));
  const old = previous ? checkDraft(uid, caseId, await unwrapCare(uid, previous)) : undefined;
  if ((old?.revision || null) !== expectedRevision) throw Error("This referral draft changed in another tab. Your edits are still on this page; copy them before reloading the saved draft.");
  const sealed = await wrapCare(checkDraft(uid, caseId, next), await localSharingDevice(uid));
  await careAccount(uid);
  const actual = await storage<string | undefined>("readwrite", s => {
    const request = s.get(key);
    request.onsuccess = () => { if (request.result === previous) s.put(sealed, key); };
    return request;
  });
  if (actual !== previous) throw Error("This referral draft changed in another tab. Your edits are still on this page; copy them before reloading the saved draft.");
}
export async function saveCareDraft(uid: string, value: CareHandoffDraft, expectedRevision: string | null) {
  if (value.revision === expectedRevision) throw Error("A draft edit requires a new revision.");
  await changeCareDraft(uid, value.caseId, expectedRevision, value);
}
export async function clearCareDraft(uid: string, caseId: string, expectedRevision: string | null) {
  // Retain an encrypted revision marker so a stale empty tab cannot resurrect
  // an old draft after another tab completes the handoff.
  const cleared: CareHandoffDraft = { version: 1, caseId, sourceUid: uid, revision: crypto.randomUUID(), fields: emptyReferralFields(), destination: "", capacity: "32768", updatedAt: new Date().toISOString(), cleared: true };
  await changeCareDraft(uid, caseId, expectedRevision, cleared);
  return cleared;
}
