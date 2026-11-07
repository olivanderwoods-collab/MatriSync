import { accountAuth } from "./auth";
import { localSharingDevice } from "./sharing-storage";
import { wrapCare, unwrapCare } from "./care-crypto";
import type { CareView } from "./care-model";
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
  return keys.filter(k => Array.isArray(k) && k[0] === uid && !String(k[1]).startsWith("receipt:")).map(k => (k as string[])[1]);
}
export async function saveCareReceipt(uid: string, value: CareView) {
  await careAccount(uid);
  const sealed = await wrapCare(value, await localSharingDevice(uid));
  await careAccount(uid); await storage("readwrite", s => s.put(sealed, [uid, `receipt:${value.id}:${value.handoffId}`]));
}
export async function careReceipts(uid: string, id: string): Promise<CareView[]> {
  await careAccount(uid);
  const keys = (await storage<IDBValidKey[]>("readonly", s => s.getAllKeys())).filter(k => Array.isArray(k) && k[0] === uid && String(k[1]).startsWith(`receipt:${id}:`));
  const results: CareView[] = [];
  for (const key of keys) results.push(await unwrapCare(uid, await storage<string>("readonly", s => s.get(key))));
  await careAccount(uid); return results;
}
