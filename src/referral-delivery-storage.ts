import type { SavedTransfer } from "./sharing-storage";
import type { ForwardAuthority } from "./referral-forward-package";
export type SavedReferralDelivery = SavedTransfer & {
  recipientRole: "organization";
  verifiedApprovalHash: string;
  forwarded?: ForwardAuthority;
};
async function open() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("matrisync-referral-deliveries-v1", 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("deliveries");
    request.onsuccess = () => {
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
    request.onerror = request.onblocked = () =>
      reject(Error("Unable to open saved referrals."));
  });
}
export async function saveReferralDelivery(
  uid: string,
  item: SavedReferralDelivery,
) {
  if (item.recipientUid !== uid || item.recipientRole !== "organization")
    throw Error("Wrong referral receiving account.");
  const db = await open();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction("deliveries", "readwrite"),
      s = tx.objectStore("deliveries"),
      key = [uid, item.channelId, item.id],
      r = s.get(key);
    r.onsuccess = () => {
      const old = r.result as SavedReferralDelivery | undefined;
      if (!old) s.add(item, key);
      else if (
        old.ciphertext !== item.ciphertext ||
        old.verifiedApprovalHash !== item.verifiedApprovalHash ||
        old.recipientRole !== item.recipientRole ||
        JSON.stringify(old.forwarded) !== JSON.stringify(item.forwarded)
      )
        tx.abort();
    };
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(
        Error(
          "The saved referral could not be stored or would replace an existing copy.",
        ),
      );
    };
  });
}
export async function savedReferralDeliveries(uid: string) {
  const db = await open();
  return new Promise<SavedReferralDelivery[]>((resolve, reject) => {
    const tx = db.transaction("deliveries", "readonly"),
      r = tx
        .objectStore("deliveries")
        .getAll(IDBKeyRange.bound([uid], [uid, []]));
    tx.oncomplete = () => {
      db.close();
      resolve(
        r.result.filter(
          (i: SavedReferralDelivery) =>
            i.recipientUid === uid && i.recipientRole === "organization",
        ),
      );
    };
    tx.onerror = tx.onabort = () => {
      db.close();
      reject(Error("Unable to read saved referrals."));
    };
  });
}
