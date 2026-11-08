import {
  CompactEncrypt,
  CompactSign,
  compactDecrypt,
  compactVerify,
  importJWK,
} from "jose";
import type { SharingDevice, TransferContext } from "./sharing-crypto";
import type { ReferralApproval } from "./referral-approval";
import type { ForwardAuthority } from "./referral-forward-package";

export type PreparedReferral = {
  kind: "approved" | "forwarded";
  context: TransferContext;
  ciphertext: string;
  approval: ReferralApproval;
  authority?: ForwardAuthority;
};
export type QueuedReferral = {
  id: string;
  channelId: string;
  senderUid: string;
  senderKeyId: string;
  role: "professional" | "organization";
  kind: PreparedReferral["kind"];
  createdAt: string;
  sealed: string;
  acknowledgedAt: string | null;
};
const type = "matrisync-referral-outbox";
const databaseName = "matrisync-referral-outbox-v1";
function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const r = indexedDB.open(databaseName, 1);
    r.onupgradeneeded = () => r.result.createObjectStore("outbox");
    r.onsuccess = () => {
      r.result.onversionchange = () => r.result.close();
      resolve(r.result);
    };
    r.onerror = r.onblocked = () =>
      reject(Error("Unable to open the encrypted referral outbox."));
  });
}
export async function queuedReferrals(uid: string, role: string) {
  const db = await open();
  return new Promise<QueuedReferral[]>((resolve, reject) => {
    const tx = db.transaction("outbox", "readonly"),
      r = tx.objectStore("outbox").getAll(IDBKeyRange.bound([uid], [uid, []]));
    tx.oncomplete = () => {
      db.close();
      resolve(
        (r.result as QueuedReferral[]).filter(
          (i) => i.senderUid === uid && i.role === role,
        ),
      );
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error("Unable to read queued referrals."));
    };
  });
}
export function referralQueueKey(item: QueuedReferral) {
  return [item.senderUid, item.kind, item.channelId, item.id];
}
function validate(value: PreparedReferral, uid: string, keyId: string) {
  const c = value.context,
    a = value.approval;
  if (
    !["approved", "forwarded"].includes(value.kind) ||
    !c ||
    !a ||
    c.senderUid !== uid ||
    c.senderKeyId !== keyId ||
    c.id !== a.id ||
    !c.channelId ||
    !c.recipientUid ||
    !/^[a-f0-9]{64}$/.test(c.recipientKeyId) ||
    !/^[a-f0-9]{64}$/.test(a.contentHash) ||
    typeof value.ciphertext !== "string" ||
    !value.ciphertext ||
    value.ciphertext.length > 900000
  )
    throw Error("Invalid prepared referral delivery.");
  if (value.kind === "approved") {
    if (
      value.authority ||
      a.doctorUid !== uid ||
      a.doctorKeyId !== keyId ||
      a.facilityUid !== c.recipientUid
    )
      throw Error("The queued approval does not match its recipient.");
  } else {
    const f = value.authority;
    if (
      !f ||
      JSON.stringify(f.approval) !== JSON.stringify(a) ||
      f.source.id !== c.id ||
      f.source.recipientUid !== uid ||
      f.source.recipientKeyId !== keyId ||
      f.source.senderUid !== a.doctorUid ||
      f.source.senderKeyId !== a.doctorKeyId ||
      f.doctor.keyId !== a.doctorKeyId ||
      f.initiation.approvalId !== c.id ||
      f.initiation.contentHash !== a.contentHash ||
      f.initiation.initiatedBy !== uid ||
      f.initiation.destinationChannelId !== c.channelId ||
      f.initiation.destinationUid !== c.recipientUid ||
      f.initiation.destinationKeyId !== c.recipientKeyId
    )
      throw Error("The queued forwarding authority changed.");
  }
}
export async function prepareQueuedReferral(
  value: PreparedReferral,
  device: SharingDevice,
): Promise<QueuedReferral> {
  validate(value, value.context.senderUid, device.keyId);
  const role = value.kind === "approved" ? "professional" : "organization",
    createdAt = new Date().toISOString();
  const signed = await new CompactSign(
    new TextEncoder().encode(
      JSON.stringify({ version: 1, value, role, createdAt }),
    ),
  )
    .setProtectedHeader({ alg: "ES256", typ: `${type}+jws`, kid: device.keyId })
    .sign(device.signKey);
  const sealed = await new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({
      alg: "ECDH-ES",
      enc: "A256GCM",
      typ: `${type}+jwe`,
      kid: device.keyId,
    })
    .encrypt(await importJWK(device.encryption, "ECDH-ES"));
  return {
    id: value.context.id,
    channelId: value.context.channelId,
    senderUid: value.context.senderUid,
    senderKeyId: device.keyId,
    kind: value.kind,
    role,
    createdAt,
    sealed,
    acknowledgedAt: null,
  };
}
export async function openQueuedReferral(
  item: QueuedReferral,
  uid: string,
  role: string,
  device: SharingDevice,
): Promise<PreparedReferral> {
  if (
    item.senderUid !== uid ||
    item.role !== role ||
    item.senderKeyId !== device.keyId
  )
    throw Error(
      "This queued referral belongs to another account, workspace or device.",
    );
  const dec = await compactDecrypt(item.sealed, device.decryptKey, {
    keyManagementAlgorithms: ["ECDH-ES"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  if (
    dec.protectedHeader.typ !== `${type}+jwe` ||
    dec.protectedHeader.kid !== device.keyId
  )
    throw Error("Invalid referral outbox header.");
  const sig = await compactVerify(
    new TextDecoder().decode(dec.plaintext),
    await importJWK(device.signing, "ES256"),
    { algorithms: ["ES256"] },
  );
  if (
    sig.protectedHeader.typ !== `${type}+jws` ||
    sig.protectedHeader.kid !== device.keyId
  )
    throw Error("Invalid referral outbox signature.");
  const p = JSON.parse(new TextDecoder().decode(sig.payload));
  if (
    p.version !== 1 ||
    p.role !== role ||
    p.createdAt !== item.createdAt ||
    p.value?.kind !== item.kind ||
    p.value?.context?.id !== item.id ||
    p.value.context.channelId !== item.channelId ||
    role !== (item.kind === "approved" ? "professional" : "organization")
  )
    throw Error("Queued referral metadata changed.");
  validate(p.value, uid, device.keyId);
  return p.value;
}
export async function saveQueuedReferral(item: QueuedReferral) {
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite");
    tx.objectStore("outbox").add(item, referralQueueKey(item));
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        Error(
          "This referral is already queued or could not be saved. Refresh the outbox; nothing was replaced.",
        ),
      );
    };
  });
}
export async function acknowledgeQueuedReferral(
  item: QueuedReferral,
  at: string,
) {
  if (!Number.isFinite(Date.parse(at)) || new Date(at).toISOString() !== at)
    throw Error("Invalid referral relay acknowledgement.");
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("outbox", "readwrite"),
      s = tx.objectStore("outbox"),
      key = referralQueueKey(item),
      r = s.get(key);
    r.onsuccess = () => {
      const old = r.result as QueuedReferral | undefined;
      if (
        !old ||
        old.sealed !== item.sealed ||
        old.role !== item.role ||
        (old.acknowledgedAt && old.acknowledgedAt !== at)
      ) {
        tx.abort();
        return;
      }
      s.put({ ...old, acknowledgedAt: at }, key);
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        Error(
          "Referral relay acknowledgement could not be saved. Resume the encrypted queued delivery to check it.",
        ),
      );
    };
  });
}
