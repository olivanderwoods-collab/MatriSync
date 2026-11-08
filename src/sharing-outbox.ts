import { CompactEncrypt, CompactSign, compactDecrypt, compactVerify, importJWK } from "jose";
import type { SharedContent, SharingDevice, TransferContext } from "./sharing-crypto";

export type QueuedTransfer = {
  id: string;
  channelId: string;
  senderUid: string;
  senderRole: string;
  senderKeyId: string;
  kind: SharedContent["kind"];
  createdAt: string;
  sealed: string;
  acknowledgedAt: string | null;
};
type Prepared = {
  version: 1;
  context: TransferContext;
  role: string;
  createdAt: string;
  content: SharedContent;
  ciphertext: string;
};
const databaseName = "matrisync-sharing-outbox-v1";
const type = "matrisync-outbox";
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const req = indexedDB.open(databaseName, 1);
    req.onupgradeneeded = () => req.result.createObjectStore("outbox");
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
    req.onerror = req.onblocked = () => reject(Error("Unable to open the encrypted send outbox."));
  });
}
export async function queuedTransfers(uid: string, role: string) {
  const db = await open();
  return new Promise<QueuedTransfer[]>((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly");
    const req = tx.objectStore("outbox").getAll(IDBKeyRange.bound([uid], [uid, []]));
    tx.oncomplete = () => { db.close(); resolve((req.result as QueuedTransfer[]).filter(i => i.senderRole === role)); };
    tx.onerror = tx.onabort = () => { db.close(); reject(Error("Unable to read the send outbox.")); };
  });
}
export async function prepareQueuedTransfer(
  context: TransferContext, role: string, content: SharedContent, ciphertext: string, device: SharingDevice,
): Promise<QueuedTransfer> {
  if (device.keyId !== context.senderKeyId || !["mother", "professional", "organization"].includes(role))
    throw Error("Wrong sending device or workspace.");
  const createdAt = new Date().toISOString();
  const payload: Prepared = { version: 1, context, role, createdAt, content, ciphertext };
  const signed = await new CompactSign(new TextEncoder().encode(JSON.stringify(payload)))
    .setProtectedHeader({ alg: "ES256", typ: `${type}+jws`, kid: device.keyId }).sign(device.signKey);
  const sealed = await new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({ alg: "ECDH-ES", enc: "A256GCM", typ: `${type}+jwe`, kid: device.keyId })
    .encrypt(await importJWK(device.encryption, "ECDH-ES"));
  return { id: context.id, channelId: context.channelId, senderUid: context.senderUid,
    senderRole: role, senderKeyId: device.keyId, kind: content.kind, createdAt, sealed, acknowledgedAt: null };
}
export async function openQueuedTransfer(item: QueuedTransfer, uid: string, role: string, device: SharingDevice) {
  if (item.senderUid !== uid || item.senderRole !== role || item.senderKeyId !== device.keyId)
    throw Error("This queued delivery belongs to another account, workspace or device.");
  const decrypted = await compactDecrypt(item.sealed, device.decryptKey, { keyManagementAlgorithms: ["ECDH-ES"], contentEncryptionAlgorithms: ["A256GCM"] });
  if (decrypted.protectedHeader.typ !== `${type}+jwe` || decrypted.protectedHeader.kid !== device.keyId)
    throw Error("Invalid encrypted outbox header.");
  const verified = await compactVerify(new TextDecoder().decode(decrypted.plaintext), await importJWK(device.signing, "ES256"), { algorithms: ["ES256"] });
  if (verified.protectedHeader.typ !== `${type}+jws` || verified.protectedHeader.kid !== device.keyId)
    throw Error("Invalid outbox signature header.");
  const payload = JSON.parse(new TextDecoder().decode(verified.payload)) as Prepared;
  if (payload.version !== 1 || payload.role !== role || payload.context?.id !== item.id ||
      payload.context.channelId !== item.channelId || payload.context.senderUid !== uid ||
      payload.context.senderKeyId !== device.keyId || payload.content?.kind !== item.kind ||
      payload.createdAt !== item.createdAt || typeof payload.ciphertext !== "string" ||
      !payload.ciphertext || !["document", "profile"].includes(payload.content.kind))
    throw Error("The queued delivery does not match its signed source.");
  return payload;
}
export async function saveQueuedTransfer(item: QueuedTransfer) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    // Add only: concurrent tabs cannot silently replace the chosen original.
    tx.objectStore("outbox").add(item, [item.senderUid, item.channelId, item.id]);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(Error("This delivery is already queued or could not be saved. Resume the saved delivery instead of replacing it.")); };
  });
}
export async function acknowledgeQueuedTransfer(item: QueuedTransfer, at: string) {
  if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at) throw Error("Invalid relay acknowledgement.");
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite"), store = tx.objectStore("outbox");
    const key = [item.senderUid, item.channelId, item.id], req = store.get(key);
    req.onsuccess = () => {
      const old = req.result as QueuedTransfer | undefined;
      if (!old || old.sealed !== item.sealed || old.senderRole !== item.senderRole ||
          (old.acknowledgedAt && old.acknowledgedAt !== at)) { tx.abort(); return; }
      store.put({ ...old, acknowledgedAt: at }, key);
    };
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = tx.onabort = () => { db.close(); reject(Error("Relay acknowledgement could not be saved. The encrypted delivery remains available for checking.")); };
  });
}
