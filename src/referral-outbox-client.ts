import {
  doc,
  getDocFromServer,
  runTransaction,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { checkedChannel, sharingAccount } from "./sharing-client";
import { localSharingDevice, verifyPeerPin } from "./sharing-storage";
import { approvalFields, initiationFields } from "./referral-forward-package";
import {
  acknowledgeQueuedReferral,
  openQueuedReferral,
  prepareQueuedReferral,
  queuedReferrals,
  saveQueuedReferral,
  type PreparedReferral,
  type QueuedReferral,
} from "./referral-outbox";
import type { SharingDevice } from "./sharing-crypto";

function dated(value: DocumentData) {
  return { ...value, createdAt: value.createdAt?.toDate()?.toISOString() };
}
function sameFields(a: DocumentData, b: object, keys: readonly string[]) {
  return keys.every((key) => a[key] === Reflect.get(b, key));
}
function sameDevice(
  a: DocumentData,
  b: NonNullable<PreparedReferral["authority"]>["doctor"],
) {
  return (
    a?.keyId === b.keyId &&
    ["encryption", "signing"].every(
      (k) =>
        a[k] &&
        sameFields(a[k], b[k as "encryption" | "signing"], [
          "kty",
          "crv",
          "x",
          "y",
        ]),
    )
  );
}
function exact(value: DocumentData, p: PreparedReferral) {
  const c = p.context;
  if (
    value.version !== 1 ||
    value.approvalId !== c.id ||
    value.contentHash !== p.approval.contentHash ||
    value.senderUid !== c.senderUid ||
    value.recipientUid !== c.recipientUid ||
    value.senderKeyId !== c.senderKeyId ||
    value.recipientKeyId !== c.recipientKeyId ||
    value.ciphertext !== p.ciphertext
  )
    throw Error(
      "A different referral envelope exists. Nothing was replaced or acknowledged.",
    );
  if (
    p.authority &&
    (value.sourceChannelId !== p.authority.source.channelId ||
      !sameDevice(value.doctor, p.authority.doctor) ||
      !sameFields(
        { ...dated(value.approval), id: c.id },
        p.approval,
        approvalFields,
      ) ||
      !sameFields(
        dated(value.initiation),
        p.authority.initiation,
        initiationFields,
      ))
  )
    throw Error(
      "Forwarded referral authority differs from the queued delivery.",
    );
}
export async function queueReferral(
  p: PreparedReferral,
  device: SharingDevice,
) {
  const role = p.kind === "approved" ? "professional" : "organization";
  const find = async () =>
    (await queuedReferrals(p.context.senderUid, role)).find(
      (i) =>
        i.id === p.context.id &&
        i.channelId === p.context.channelId &&
        i.kind === p.kind,
    );
  const old = await find();
  if (old) return old;
  const item = await prepareQueuedReferral(p, device);
  await sharingAccount(p.context.senderUid);
  try {
    await saveQueuedReferral(item);
  } catch (e) {
    // Two tabs may prepare concurrently. Only the first persisted envelope wins.
    const winner = await find();
    if (winner) return winner;
    throw e;
  }
  return item;
}
export async function publishQueuedReferral(
  uid: string,
  role: string,
  item: QueuedReferral,
) {
  if (!navigator.onLine)
    throw Error(
      "Offline. The encrypted referral is still queued; no relay acknowledgement was confirmed.",
    );
  await sharingAccount(uid);
  const device = await localSharingDevice(uid),
    p = await openQueuedReferral(item, uid, role, device),
    c = p.context;
  const { db, channel, scope } = await checkedChannel(
    uid,
    c.channelId,
    device,
    role,
  );
  if (
    scope ||
    channel.senderUid !== uid ||
    channel.sender.keyId !== c.senderKeyId ||
    channel.recipientUid !== c.recipientUid ||
    channel.recipient.keyId !== c.recipientKeyId
  )
    throw Error(
      "The queued referral recipient or device changed. Nothing was sent.",
    );
  await verifyPeerPin(uid, c.recipientUid, c.recipientKeyId, "");
  const path = p.kind === "approved" ? "referrals" : "forwardedReferrals";
  const ref = doc(db, "channels", c.channelId, path, c.id);
  const index =
    p.kind === "forwarded"
      ? doc(db, "channels", c.channelId, "forwardedReferralIndex", c.id)
      : undefined;
  await runTransaction(db, async (tx) => {
    await sharingAccount(uid);
    const old = await tx.get(ref),
      indexed = index ? await tx.get(index) : undefined;
    const receipt = await tx.get(
      doc(db, "referralApprovals", p.approval.doctorUid, "versions", c.id),
    );
    const started = p.authority
      ? await tx.get(
          doc(
            db,
            "channels",
            p.authority.source.channelId,
            "referralInitiations",
            c.id,
          ),
        )
      : undefined;
    if (
      !receipt.exists() ||
      !sameFields(
        { ...dated(receipt.data()), id: c.id },
        p.approval,
        approvalFields,
      )
    )
      throw Error("The queued referral approval cannot be confirmed.");
    if (
      p.authority &&
      (!started?.exists() ||
        !sameFields(
          dated(started.data()),
          p.authority.initiation,
          initiationFields,
        ))
    )
      throw Error("The queued destination initiation cannot be confirmed.");
    await sharingAccount(uid);
    if (old.exists()) {
      exact(old.data(), p);
      if (index && !indexed?.exists())
        tx.set(index, { approvalId: c.id, createdAt: old.data().createdAt });
    } else {
      tx.set(ref, {
        version: 1,
        approvalId: c.id,
        contentHash: p.approval.contentHash,
        senderUid: uid,
        recipientUid: c.recipientUid,
        senderKeyId: c.senderKeyId,
        recipientKeyId: c.recipientKeyId,
        ciphertext: p.ciphertext,
        createdAt: serverTimestamp(),
        ...(p.authority
          ? {
              sourceChannelId: p.authority.source.channelId,
              doctor: p.authority.doctor,
              approval: receipt.data(),
              initiation: started!.data(),
            }
          : {}),
      });
      if (index)
        tx.set(index, { approvalId: c.id, createdAt: serverTimestamp() });
    }
  });
  // An exact server read is required even after an idempotent transaction retry.
  const confirmed = await getDocFromServer(ref);
  if (!confirmed.exists())
    throw Error(
      "Referral storage was not confirmed. The encrypted delivery remains queued.",
    );
  exact(confirmed.data(), p);
  if (index) {
    const confirmedIndex = await getDocFromServer(index);
    if (
      !confirmedIndex.exists() ||
      confirmedIndex.data().approvalId !== c.id ||
      confirmedIndex.data().createdAt?.toMillis() !==
        confirmed.data().createdAt?.toMillis()
    )
      throw Error(
        "Referral discovery was not confirmed. The encrypted delivery remains queued.",
      );
  }
  const at = confirmed.data().createdAt?.toDate()?.toISOString();
  if (!at) throw Error("Referral relay acknowledgement is missing.");
  await sharingAccount(uid);
  await acknowledgeQueuedReferral(item, at);
}

// Legacy, already-published deliveries predate this outbox. Adopt their immutable
// ciphertext only after checking the same metadata/authority; never overwrite it.
export async function adoptPublishedReferral(
  p: PreparedReferral,
  role: string,
  device: SharingDevice,
) {
  const { db } = await checkedChannel(
    p.context.senderUid,
    p.context.channelId,
    device,
    role,
  );
  const old = await getDocFromServer(
    doc(
      db,
      "channels",
      p.context.channelId,
      p.kind === "approved" ? "referrals" : "forwardedReferrals",
      p.context.id,
    ),
  );
  if (!old.exists()) return p;
  const candidate = { ...p, ciphertext: old.data().ciphertext };
  exact(old.data(), candidate);
  return candidate;
}
