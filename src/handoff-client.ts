import { receiveForwardedReferrals } from "./referral-forwarding";
import { publishQueuedReferral } from "./referral-outbox-client";
import {
  openReferralDelivery,
  readReferralInitiation,
} from "./referral-delivery";
import {
  savedReferralDeliveries,
  type SavedReferralDelivery,
} from "./referral-delivery-storage";
import { openQueuedReferral, queuedReferrals } from "./referral-outbox";
import { localSharingDevice } from "./sharing-storage";
import { sharingAccount } from "./sharing-client";
import { encodeHandoff, parseHandoff } from "./handoff-packet";

export async function createHandoff(uid: string, item: SavedReferralDelivery) {
  // Reuse the exact approved, recipient-bound encrypted envelope and its current
  // authority checks. No new cryptographic format or key escrow is introduced.
  const initiation = await readReferralInitiation(uid, item);
  const queued = (await queuedReferrals(uid, "organization")).find(
    (q) =>
      q.kind === "forwarded" &&
      q.id === item.id &&
      q.channelId === initiation?.destinationChannelId,
  );
  if (!queued?.acknowledgedAt)
    throw Error(
      "Confirm destination relay storage before preparing the handoff.",
    );
  await publishQueuedReferral(uid, "organization", queued);
  const p = await openQueuedReferral(
    queued,
    uid,
    "organization",
    await localSharingDevice(uid),
  );
  await sharingAccount(uid);
  return encodeHandoff({
    version: 1,
    channelId: p.context.channelId,
    approvalId: p.context.id,
    ciphertext: p.ciphertext,
  });
}
export async function receiveHandoff(
  uid: string,
  bytes: Uint8Array,
  fingerprint: string,
) {
  await sharingAccount(uid);
  const p = parseHandoff(bytes);
  const find = async () =>
    (await savedReferralDeliveries(uid)).find(
      (i) =>
        i.forwarded &&
        i.channelId === p.channelId &&
        i.id === p.approvalId &&
        i.ciphertext === p.ciphertext,
    );
  let item = await find();
  if (!item) {
    if (!navigator.onLine)
      throw Error(
        "This handoff has not been authorized and saved in this account. Connect online to verify it; unavailable history cannot be opened offline.",
      );
    await receiveForwardedReferrals(uid, p.channelId, fingerprint, {
      id: p.approvalId,
      ciphertext: p.ciphertext,
    });
    item = await find();
  }
  if (!item)
    throw Error(
      "The handoff was not saved. No patient or referral was substituted.",
    );
  const value = await openReferralDelivery(uid, item);
  await sharingAccount(uid);
  return { item, value };
}
