import {
  CompactEncrypt,
  CompactSign,
  compactDecrypt,
  compactVerify,
  importJWK,
} from "jose";
import {
  checkPublicDevice,
  type PublicDevice,
  type SharingDevice,
  type TransferContext,
} from "./sharing-crypto";
import { verifyOriginalReferral } from "./referral-package";
import type { ReferralApproval } from "./referral-approval";
import type { ReferralInitiation } from "./referral-delivery";

export type ForwardAuthority = {
  source: TransferContext;
  doctor: PublicDevice;
  approval: ReferralApproval;
  initiation: ReferralInitiation;
};
const routing = [
  "id",
  "channelId",
  "senderUid",
  "recipientUid",
  "senderKeyId",
  "recipientKeyId",
] as const;
export function sameFields<T extends object>(
  a: T,
  b: T,
  keys: readonly (keyof T)[],
) {
  return !!a && !!b && keys.every((k) => a[k] === b[k]);
}
export const approvalFields = [
  "id",
  "doctorUid",
  "doctorKeyId",
  "facilityUid",
  "credentialEventId",
  "contentHash",
  "createdAt",
] as const;
export const initiationFields = [
  "approvalId",
  "contentHash",
  "initiatedBy",
  "destinationChannelId",
  "destinationUid",
  "destinationKeyId",
  "createdAt",
] as const;

async function verifyForward(
  original: string,
  initiation: ReferralInitiation,
  context: TransferContext,
  authority: ForwardAuthority,
) {
  const value = await verifyOriginalReferral(
    original,
    authority.source,
    authority.doctor,
  );
  if (
    !sameFields(value.approval, authority.approval, approvalFields) ||
    !sameFields(initiation, authority.initiation, initiationFields) ||
    context.id !== value.approval.id ||
    initiation.approvalId !== context.id ||
    initiation.contentHash !== value.approval.contentHash ||
    initiation.initiatedBy !== context.senderUid ||
    initiation.destinationChannelId !== context.channelId ||
    initiation.destinationUid !== context.recipientUid ||
    initiation.destinationKeyId !== context.recipientKeyId ||
    authority.source.recipientUid !== context.senderUid ||
    authority.source.recipientKeyId !== context.senderKeyId
  )
    throw Error(
      "The forwarded referral does not match the original approval and selected destination.",
    );
  return value;
}
export async function encryptForwardedReferral(
  original: string,
  context: TransferContext,
  authority: ForwardAuthority,
  sender: SharingDevice,
  recipient: PublicDevice,
) {
  await checkPublicDevice(recipient);
  await verifyForward(original, authority.initiation, context, authority);
  if (
    sender.keyId !== context.senderKeyId ||
    recipient.keyId !== context.recipientKeyId
  )
    throw Error("Forwarding keys changed.");
  const signed = await new CompactSign(
    new TextEncoder().encode(
      JSON.stringify({
        version: 1,
        context,
        original,
        initiation: authority.initiation,
      }),
    ),
  )
    .setProtectedHeader({
      alg: "ES256",
      typ: "matrisync-referral-forward+jws",
      kid: sender.keyId,
    })
    .sign(sender.signKey);
  const ciphertext = await new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({
      alg: "ECDH-ES",
      enc: "A256GCM",
      typ: "matrisync-referral-forward+jwe",
      kid: recipient.keyId,
    })
    .encrypt(await importJWK(recipient.encryption, "ECDH-ES"));
  if (ciphertext.length > 700000)
    throw Error("The forwarded referral exceeds the transfer limit.");
  return ciphertext;
}
export async function decryptForwardedReferral(
  ciphertext: string,
  context: TransferContext,
  authority: ForwardAuthority,
  recipient: SharingDevice,
  sender: PublicDevice,
) {
  await checkPublicDevice(sender);
  if (
    typeof ciphertext !== "string" ||
    ciphertext.length > 700000 ||
    context.recipientKeyId !== recipient.keyId ||
    context.senderKeyId !== sender.keyId
  )
    throw Error("Wrong forwarding recipient or keys.");
  const opened = await compactDecrypt(ciphertext, recipient.decryptKey, {
    keyManagementAlgorithms: ["ECDH-ES"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  if (
    opened.protectedHeader.typ !== "matrisync-referral-forward+jwe" ||
    opened.protectedHeader.kid !== recipient.keyId
  )
    throw Error("Invalid forwarded envelope.");
  const signed = await compactVerify(
    new TextDecoder().decode(opened.plaintext),
    await importJWK(sender.signing, "ES256"),
    { algorithms: ["ES256"] },
  );
  if (
    signed.protectedHeader.typ !== "matrisync-referral-forward+jws" ||
    signed.protectedHeader.kid !== sender.keyId
  )
    throw Error("Invalid initiating Organization signature.");
  const payload = JSON.parse(new TextDecoder().decode(signed.payload));
  if (payload.version !== 1 || !sameFields(payload.context, context, routing))
    throw Error("Forwarding context mismatch.");
  return verifyForward(
    payload.original,
    payload.initiation,
    context,
    authority,
  );
}
