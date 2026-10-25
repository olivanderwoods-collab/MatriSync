import {
  newSharingDevice,
  type SharingDevice,
  type PublicDevice,
  type TransferContext,
} from "./sharing-crypto";
export type SavedTransfer = TransferContext & {
  ciphertext: string;
  sender: PublicDevice;
  savedAt: string;
};
const DB = "matrisync-sharing-pilot-v1";
async function access<T>(
  store: string,
  mode: IDBTransactionMode,
  action: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
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
export async function localSharingDevice(uid: string) {
  const current = await access<SharingDevice | undefined>(
    "devices",
    "readonly",
    (s) => s.get(uid),
  );
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
  const existing = await access<SavedTransfer | undefined>(
    "inbox",
    "readonly",
    (s) => s.get([uid, item.channelId, item.id]),
  );
  if (existing) {
    if (existing.ciphertext !== item.ciphertext)
      throw Error("A saved transfer cannot be replaced.");
    return;
  }
  await access("inbox", "readwrite", (s) =>
    s.add(item, [uid, item.channelId, item.id]),
  );
}
export async function savedTransfers(uid: string) {
  return access<SavedTransfer[]>("inbox", "readonly", (s) =>
    s.getAll(IDBKeyRange.bound([uid], [uid, []])),
  );
}
