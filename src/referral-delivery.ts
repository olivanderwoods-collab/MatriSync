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
  type Timestamp,
} from "firebase/firestore";
import { checkedChannel, sharingAccount, database } from "./sharing-client";
import { localSharingDevice, verifyPeerPin } from "./sharing-storage";
import { readReferralApproval } from "./sharing-referral-approval";
import {
  referralPackage,
  encryptReferralPackage,
  decryptReferralPackage,
  type ReferralPackage,
} from "./referral-package";
import {
  saveReferralDelivery,
  type SavedReferralDelivery,
} from "./referral-delivery-storage";
import type { ReferralDraft } from "./referral-draft";
import type { ReferralApproval } from "./referral-approval";

function online() {
  if (!navigator.onLine)
    throw Error(
      "Go online to confirm current referral permissions. Nothing was sent or initiated offline.",
    );
}
export async function sendApprovedReferral(
  uid: string,
  draft: ReferralDraft,
  versionId: string,
  channelId: string,
  fingerprint: string,
) {
  online();
  const device = await localSharingDevice(uid),
    { db, channel, scope } = await checkedChannel(
      uid,
      channelId,
      device,
      "professional",
    );
  const approval = await readReferralApproval(uid, draft, versionId);
  if (
    !approval ||
    scope ||
    channel.senderUid !== uid ||
    channel.recipientUid !== approval.facilityUid
  )
    throw Error(
      "Choose the approved connection to this doctor's credential-review facility.",
    );
  await verifyPeerPin(
    uid,
    channel.recipientUid,
    channel.recipient.keyId,
    fingerprint.trim(),
  );
  const context = {
    id: approval.id,
    channelId,
    senderUid: uid,
    recipientUid: channel.recipientUid,
    senderKeyId: device.keyId,
    recipientKeyId: channel.recipient.keyId,
  };
  const value = await referralPackage(draft, versionId, approval),
    ciphertext = await encryptReferralPackage(
      value,
      context,
      device,
      channel.recipient,
    );
  const ref = doc(db, "channels", channelId, "referrals", approval.id);
  await runTransaction(db, async (tx) => {
    const existing = await tx.get(ref);
    if (existing.exists()) {
      if (
        existing.data().contentHash !== approval.contentHash ||
        existing.data().senderKeyId !== device.keyId ||
        existing.data().recipientKeyId !== channel.recipient.keyId
      )
        throw Error(
          "A different delivery already exists. Nothing was replaced.",
        );
      return;
    }
    await sharingAccount(uid);
    tx.set(ref, {
      version: 1,
      approvalId: approval.id,
      contentHash: approval.contentHash,
      senderUid: uid,
      recipientUid: channel.recipientUid,
      senderKeyId: device.keyId,
      recipientKeyId: channel.recipient.keyId,
      ciphertext,
      createdAt: serverTimestamp(),
    });
  });
  await sharingAccount(uid);
}
export async function receiveApprovedReferrals(
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
    throw Error("Choose an incoming doctor connection.");
  await verifyPeerPin(
    uid,
    channel.senderUid,
    channel.sender.keyId,
    fingerprint.trim(),
  );
  const result = await getDocsFromServer(
    query(
      collection(db, "channels", channelId, "referrals"),
      orderBy("createdAt", "desc"),
      limit(20),
    ),
  );
  for (const snap of result.docs) {
    const d = snap.data(),
      item: SavedReferralDelivery = {
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
      };
    if (
      d.approvalId !== item.id ||
      d.senderUid !== item.senderUid ||
      d.recipientUid !== uid ||
      d.senderKeyId !== item.senderKeyId ||
      d.recipientKeyId !== item.recipientKeyId
    )
      throw Error("Referral routing metadata does not match this connection.");
    const value = await decryptReferralPackage(
      item.ciphertext,
      item,
      device,
      item.sender,
    );
    const approved = await getDocFromServer(
      doc(db, "referralApprovals", item.senderUid, "versions", item.id),
    );
    if (!approved.exists())
      throw Error("The doctor's approval cannot be verified.");
    const a = approved.data();
    const receipt = {
      ...a,
      id: item.id,
      createdAt: (a.createdAt as Timestamp).toDate().toISOString(),
    } as ReferralApproval;
    for (const k of Object.keys(value.approval) as (keyof ReferralApproval)[])
      if (value.approval[k] !== receipt[k])
        throw Error(
          "The received referral differs from its recorded approval.",
        );
    if (value.approval.contentHash !== d.contentHash)
      throw Error("Referral digest mismatch.");
    await sharingAccount(uid);
    await saveReferralDelivery(uid, item);
  }
  await sharingAccount(uid);
  return result.size;
}
export async function openReferralDelivery(
  uid: string,
  item: SavedReferralDelivery,
): Promise<ReferralPackage> {
  await sharingAccount(uid);
  if (item.recipientUid !== uid || item.recipientRole !== "organization")
    throw Error("Wrong receiving account or workspace.");
  const value = await decryptReferralPackage(
    item.ciphertext,
    item,
    await localSharingDevice(uid),
    item.sender,
  );
  if (value.approval.contentHash !== item.verifiedApprovalHash)
    throw Error("The saved approval digest changed.");
  await sharingAccount(uid);
  return value;
}
export type ReferralInitiation = {
  approvalId: string;
  contentHash: string;
  initiatedBy: string;
  destinationChannelId: string;
  destinationUid: string;
  destinationKeyId: string;
  createdAt: string;
};
export async function readReferralInitiation(
  uid: string,
  item: SavedReferralDelivery,
) {
  online();
  const db = await database(uid),
    snap = await getDocFromServer(
      doc(db, "channels", item.channelId, "referralInitiations", item.id),
    );
  await sharingAccount(uid);
  if (!snap.exists()) return undefined;
  const d = snap.data();
  if (
    d.approvalId !== item.id ||
    d.contentHash !== item.verifiedApprovalHash ||
    d.initiatedBy !== uid
  )
    throw Error("Initiation does not match this received version.");
  return {
    ...d,
    createdAt: (d.createdAt as Timestamp).toDate().toISOString(),
  } as ReferralInitiation;
}
export async function initiateReferral(
  uid: string,
  item: SavedReferralDelivery,
  destinationChannelId: string,
  fingerprint: string,
) {
  online();
  await openReferralDelivery(uid, item);
  const device = await localSharingDevice(uid),
    { db, channel, scope } = await checkedChannel(
      uid,
      destinationChannelId,
      device,
      "organization",
    );
  if (scope || channel.senderUid !== uid || channel.recipientUid === uid)
    throw Error("Choose an approved outgoing destination connection.");
  await verifyPeerPin(
    uid,
    channel.recipientUid,
    channel.recipient.keyId,
    fingerprint.trim(),
  );
  const ref = doc(
    db,
    "channels",
    item.channelId,
    "referralInitiations",
    item.id,
  );
  await runTransaction(db, async (tx) => {
    const old = await tx.get(ref);
    if (old.exists()) {
      if (
        old.data().destinationChannelId !== destinationChannelId ||
        old.data().destinationUid !== channel.recipientUid ||
        old.data().destinationKeyId !== channel.recipient.keyId ||
        old.data().contentHash !== item.verifiedApprovalHash
      )
        throw Error(
          "This version was already initiated for a different destination. Nothing was changed.",
        );
      return;
    }
    await sharingAccount(uid);
    tx.set(ref, {
      approvalId: item.id,
      contentHash: item.verifiedApprovalHash,
      initiatedBy: uid,
      destinationChannelId,
      destinationUid: channel.recipientUid,
      destinationKeyId: channel.recipient.keyId,
      createdAt: serverTimestamp(),
    });
  });
  const result = await readReferralInitiation(uid, item);
  if (!result)
    throw Error(
      "Initiation was not confirmed. Check its status before retrying.",
    );
  return result;
}
