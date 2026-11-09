import {
  newSharingDevice,
  type SharingDevice,
  type PublicDevice,
  type TransferContext,
} from "./sharing-crypto";
export type SavedTransfer = TransferContext & {
  // Set only after the live approved receiving workspace has been checked.
  recipientRole?: string;
  kind?: "document" | "profile";
  ciphertext: string;
  sender: PublicDevice;
  savedAt: string;
};
const DB = "matrisync-sharing-pilot-v1";
async function openStorage() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      for (const name of ["devices", "pins", "inbox"])
        req.result.createObjectStore(name);
    };
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = req.onblocked = () =>
      reject(Error("Unable to open encrypted-sharing device storage."));
  });
}
async function access<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openStorage();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = action(tx.objectStore(store));
    tx.oncomplete = () => {
      db.close();
      resolve(req.result);
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error("Unable to save sharing state on this device."));
    };
  });
}
export function existingSharingDevice(uid: string) {
  return access<SharingDevice | undefined>(
    "devices",
    "readonly",
    (s) => s.get(uid),
  );
}
export async function localSharingDevice(uid: string) {
  const current = await existingSharingDevice(uid);
  if (current) return current;
  const fresh = await newSharingDevice();
  try {
    await access("devices", "readwrite", (s) => s.add(fresh, uid));
    return fresh;
  } catch {
    const winner = await access<SharingDevice | undefined>(
      "devices",
      "readonly",
      (s) => s.get(uid),
    );
    if (winner) return winner;
    throw Error("Unable to enroll this device.");
  }
}
export async function verifyPeerPin(
  uid: string,
  peer: string,
  actual: string,
  entered: string,
) {
  const existing = await access<string | undefined>("pins", "readonly", (s) =>
    s.get([uid, peer]),
  );
  if (existing && existing !== actual)
    throw Error(
      "The peer device key changed. A new approved enrollment is required.",
    );
  if (existing === actual) return;
  if (!/^[a-f0-9]{64}$/.test(entered) || actual !== entered)
    throw Error(
      "Enter the fingerprint shown on the other account's device through a separate trusted channel.",
    );
  // add, not put: a concurrent approval cannot silently replace a trusted pin.
  try {
    await access("pins", "readwrite", (s) => s.add(actual, [uid, peer]));
  } catch {
    if (
      (await access("pins", "readonly", (s) => s.get([uid, peer]))) !== actual
    )
      throw Error("The peer fingerprint changed in another tab.");
  }
}
export async function saveReceived(uid: string, item: SavedTransfer) {
  if (item.recipientUid !== uid) throw Error("Wrong receiving account.");
  const db = await openStorage();
  // Read/check/write in one transaction: concurrent tabs cannot replace a
  // received envelope or assign a legacy copy to different workspaces.
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("inbox", "readwrite");
    const store = tx.objectStore("inbox");
    const key = [uid, item.channelId, item.id];
    const request = store.get(key);
    let failure = "Unable to save sharing state on this device.";
    request.onsuccess = () => {
      const existing = request.result as SavedTransfer | undefined;
      if (!existing) {
        store.add(item, key);
        return;
      }
      if (existing.ciphertext !== item.ciphertext)
        failure = "A saved transfer cannot be replaced.";
      else if (
        existing.recipientRole &&
        item.recipientRole &&
        existing.recipientRole !== item.recipientRole
      )
        failure = "A saved transfer cannot move to another workspace.";
      else {
        // Authorized re-fetch annotates only the workspace. Preserve receipt,
        // provenance and ciphertext even when the caller supplies newer values.
        if (!existing.recipientRole && item.recipientRole)
          store.put({ ...existing, recipientRole: item.recipientRole }, key);
        return;
      }
      tx.abort();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error(failure));
    };
  });
}
export function transfersForWorkspace(
  items: SavedTransfer[],
  uid: string,
  role: string,
) {
  return items.filter(
    (item) => item.recipientUid === uid && item.recipientRole === role,
  );
}
export async function savedTransfers(uid: string) {
  return access<SavedTransfer[]>("inbox", "readonly", (s) =>
    s.getAll(IDBKeyRange.bound([uid], [uid, []])),
  );
}
