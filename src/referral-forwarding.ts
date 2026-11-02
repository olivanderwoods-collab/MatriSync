import { queuedReferrals } from "./referral-outbox";
import {
  queueReferral,
  publishQueuedReferral,
  adoptPublishedReferral,
} from "./referral-outbox-client";
import {
  collection,
  doc,
  getDocFromServer,
  getDocsFromServer,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type DocumentData,
  type Timestamp,
} from "firebase/firestore";
import { checkedChannel, database, sharingAccount } from "./sharing-client";
import { localSharingDevice, verifyPeerPin } from "./sharing-storage";
import {
  openReferralDelivery,
  readReferralInitiation,
  type ReferralInitiation,
} from "./referral-delivery";
import { originalReferralSignature } from "./referral-package";
import {
  decryptForwardedReferral,
  encryptForwardedReferral,
  type ForwardAuthority,
} from "./referral-forward-package";
import {
  saveReferralDelivery,
  type SavedReferralDelivery,
} from "./referral-delivery-storage";
import type { ReferralApproval } from "./referral-approval";
import type { PublicDevice } from "./sharing-crypto";

function online() {
  if (!navigator.onLine)
    throw Error(
      "Go online to confirm current referral permissions. No delivery or receiving event was confirmed offline.",
    );
}
function dated(d: DocumentData) {
  return { ...d, createdAt: (d.createdAt as Timestamp).toDate().toISOString() };
}
export async function forwardApprovedReferral(
  uid: string,
  item: SavedReferralDelivery,
  fingerprint: string,
) {
  online();
  if (item.forwarded)
    throw Error("This referral is already at its selected destination.");
  const value = await openReferralDelivery(uid, item),
    initiation = await readReferralInitiation(uid, item);
  if (!initiation)
    throw Error("Record the selected destination before sending.");
  const existingQueue = (await queuedReferrals(uid, "organization")).find(
    (i) =>
      i.id === item.id &&
      i.channelId === initiation.destinationChannelId &&
      i.kind === "forwarded",
  );
  if (existingQueue)
    return publishQueuedReferral(uid, "organization", existingQueue);
  const device = await localSharingDevice(uid),
    { channel, scope } = await checkedChannel(
      uid,
      initiation.destinationChannelId,
      device,
      "organization",
    );
  if (
    scope ||
    channel.senderUid !== uid ||
    channel.recipientUid !== initiation.destinationUid ||
    channel.recipient.keyId !== initiation.destinationKeyId
  )
    throw Error("The selected destination or its key changed.");
  await verifyPeerPin(
    uid,
    channel.recipientUid,
    channel.recipient.keyId,
    fingerprint.trim(),
  );
  const context = {
    id: item.id,
    channelId: channel.id,
    senderUid: uid,
    recipientUid: channel.recipientUid,
    senderKeyId: device.keyId,
    recipientKeyId: channel.recipient.keyId,
  };
  const authority: ForwardAuthority = {
    source: {
      id: item.id,
      channelId: item.channelId,
      senderUid: item.senderUid,
      recipientUid: uid,
      senderKeyId: item.senderKeyId,
      recipientKeyId: item.recipientKeyId,
    },
    doctor: item.sender,
    approval: value.approval,
    initiation,
  };
  const original = await originalReferralSignature(
    item.ciphertext,
    authority.source,
    device,
    item.sender,
  );
  const ciphertext = await encryptForwardedReferral(
    original,
    context,
    authority,
    device,
    channel.recipient,
  );
  const prepared = await adoptPublishedReferral(
    {
      kind: "forwarded",
      context,
      ciphertext,
      approval: value.approval,
      authority,
    },
    "organization",
    device,
  );
  const queued = await queueReferral(prepared, device);
  await publishQueuedReferral(uid, "organization", queued);
}
export async function receiveForwardedReferrals(
  uid: string,
  channelId: string,
  fingerprint: string,
) {
  online();
  const device = await localSharingDevice(uid),
    { db, channel, scope } = await checkedChannel(
      uid,
      channelId,
      device,
      "organization",
    );
  if (scope || channel.recipientUid !== uid)
    throw Error("Choose the incoming initiating Organization connection.");
  await verifyPeerPin(
    uid,
    channel.senderUid,
    channel.sender.keyId,
    fingerprint.trim(),
  );
  const result = await getDocsFromServer(
    query(
      collection(db, "channels", channelId, "forwardedReferralIndex"),
      orderBy("createdAt", "desc"),
      limit(20),
    ),
  );
  // Discover nonclinical IDs only; individually fetch each ciphertext under its
  // full current authority chain within Firestore's ten access-call limit.
  for (const entry of result.docs) {
    const snap = await getDocFromServer(
      doc(db, "channels", channelId, "forwardedReferrals", entry.id),
    );
    if (!snap.exists()) throw Error("The indexed referral is unavailable.");
    const d = snap.data();
    const approval = { ...dated(d.approval), id: snap.id } as ReferralApproval;
    const authority: ForwardAuthority = {
      source: {
        id: snap.id,
        channelId: d.sourceChannelId,
        senderUid: approval.doctorUid,
        recipientUid: channel.senderUid,
        senderKeyId: approval.doctorKeyId,
        recipientKeyId: channel.sender.keyId,
      },
      doctor: d.doctor as PublicDevice,
      approval,
      initiation: dated(d.initiation) as ReferralInitiation,
    };
    const item: SavedReferralDelivery = {
      id: snap.id,
      channelId,
      senderUid: channel.senderUid,
      recipientUid: uid,
      senderKeyId: channel.sender.keyId,
      recipientKeyId: device.keyId,
      ciphertext: d.ciphertext,
      sender: channel.sender,
      savedAt: new Date().toISOString(),
      recipientRole: "organization",
      verifiedApprovalHash: d.contentHash,
      forwarded: authority,
    };
    if (
      d.version !== 1 ||
      d.approvalId !== item.id ||
      d.senderUid !== item.senderUid ||
      d.recipientUid !== uid ||
      d.senderKeyId !== item.senderKeyId ||
      d.recipientKeyId !== item.recipientKeyId ||
      approval.contentHash !== item.verifiedApprovalHash
    )
      throw Error("Forwarded routing or approval metadata does not match.");
    await decryptForwardedReferral(
      item.ciphertext,
      item,
      authority,
      device,
      item.sender,
    );
    await sharingAccount(uid);
    await saveReferralDelivery(uid, item);
    // Receipt follows successful verification and local persistence, never send.
    await recordReceivingEvent(uid, item, "received");
  }
  await sharingAccount(uid);
  return result.size;
}
export const receivingEvents = [
  "received",
  "accepted",
  "arrived",
  "acknowledged",
  "closed",
] as const;
export type ReceivingEventKind = (typeof receivingEvents)[number];
export type ReceivingEvent = {
  kind: ReceivingEventKind;
  actorUid: string;
  contentHash: string;
  createdAt: string;
};
export async function readReceivingEvents(
  uid: string,
  channelId: string,
  approvalId: string,
) {
  online();
  const db = await database(uid);
  const indexed = await getDocFromServer(
    doc(db, "channels", channelId, "forwardedReferralIndex", approvalId),
  );
  if (!indexed.exists()) {
    await sharingAccount(uid);
    return [];
  }
  const result = await getDocsFromServer(
    query(
      collection(
        db,
        "channels",
        channelId,
        "forwardedReferrals",
        approvalId,
        "events",
      ),
      orderBy("createdAt", "asc"),
      limit(5),
    ),
  );
  await sharingAccount(uid);
  return result.docs
    .map((s) => dated(s.data()) as ReceivingEvent)
    .sort(
      (a, b) =>
        receivingEvents.indexOf(a.kind) - receivingEvents.indexOf(b.kind),
    );
}
export async function recordReceivingEvent(
  uid: string,
  item: SavedReferralDelivery,
  kind: ReceivingEventKind,
) {
  online();
  if (!item.forwarded || !receivingEvents.includes(kind))
    throw Error("Only the selected receiver can record receiving events.");
  await openReferralDelivery(uid, item);
  const device = await localSharingDevice(uid),
    { db, channel } = await checkedChannel(
      uid,
      item.channelId,
      device,
      "organization",
    );
  if (channel.recipientUid !== uid)
    throw Error("Only the receiving Organization can confirm this event.");
  const ref = doc(
    db,
    "channels",
    item.channelId,
    "forwardedReferrals",
    item.id,
    "events",
    kind,
  );
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    if (old.exists()) {
      if (
        old.data().actorUid !== uid ||
        old.data().contentHash !== item.verifiedApprovalHash
      )
        throw Error("A conflicting event exists.");
      return;
    }
    await sharingAccount(uid);
    tx.set(ref, {
      kind,
      actorUid: uid,
      contentHash: item.verifiedApprovalHash,
      createdAt: serverTimestamp(),
    });
  });
  await sharingAccount(uid);
}
