import type { Sealed, VaultEnvelope } from "./vault-crypto";

export const VAULT_DB = "matrisync-encrypted-records-v1";
// Keys contain only account IDs and random document IDs. Names and clinical fields
// are inside authenticated ciphertext. No automatic network or service-worker writes.
function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(VAULT_DB, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("vaults");
      request.result.createObjectStore("files");
    };
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = () =>
      reject(Error("Local storage is unavailable. Nothing was saved."));
    request.onblocked = () =>
      reject(Error("Close other MatriSync tabs and try again."));
  });
}
export async function readVault(
  uid: string,
): Promise<VaultEnvelope | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("vaults", "readonly");
    const request = tx.objectStore("vaults").get(uid);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(Error("Unable to read local records."));
    };
  });
}
export async function commitVault(
  uid: string,
  previous: string | undefined,
  envelope: VaultEnvelope,
  file?: { id: string; sealed: Sealed },
) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(["vaults", "files"], "readwrite");
    let conflict = false;
    const store = tx.objectStore("vaults");
    const current = store.get(uid);
    current.onsuccess = () => {
      if (current.result?.revision !== previous) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put(envelope, uid);
      if (file) tx.objectStore("files").put(file.sealed, [uid, file.id]);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(
        Error(
          conflict
            ? "Records changed in another tab. Lock and unlock to load the latest version."
            : "Unable to save locally. Check available device storage and try again.",
        ),
      );
    };
  });
}
export async function readFile(uid: string, id: string): Promise<Sealed> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("files", "readonly");
    const request = tx.objectStore("files").get([uid, id]);
    tx.oncomplete = () => {
      db.close();
      if (request.result) resolve(request.result);
      else reject(Error("This document is not stored on this device."));
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      reject(Error("Unable to read this document."));
    };
  });
}
