import {
  CompactEncrypt,
  CompactSign,
  compactDecrypt,
  compactVerify,
  importJWK,
} from "jose";
import {
  checkPublicDevice,
  type SharingDevice,
  type PublicDevice,
  type TransferContext,
} from "./sharing-crypto";
import { validateReferralDrafts, type ReferralDraft } from "./referral-draft";
import {
  checkReferralApproval,
  validateReferralApprovals,
  type ReferralApproval,
} from "./referral-approval";

export type ReferralPackage = {
  draft: ReferralDraft;
  approval: ReferralApproval;
  versionNumber: number;
};

// Explicit projection: never send other draft versions, private codes, full
// profiles or attachment bytes. The signed package contains one approved version.
export async function referralPackage(
  draft: ReferralDraft,
  versionId: string,
  approval: ReferralApproval,
): Promise<ReferralPackage> {
  await checkReferralApproval(draft, versionId, approval);
  const index = draft.versions.findIndex((v) => v.id === versionId),
    v = draft.versions[index];
  const o = draft.receivedOrigin;
  const selected: ReferralDraft = {
    id: draft.id,
    patientId: draft.patientId,
    authorUid: draft.authorUid,
    ...(o
      ? {
          receivedOrigin: {
            profileId: o.profileId,
            sourceUid: o.sourceUid,
            sourcePatientId: o.sourcePatientId,
            profileRevision: o.profileRevision,
            transferId: o.transferId,
            receivedAt: o.receivedAt,
          },
        }
      : {}),
    versions: [
      {
        id: v.id,
        savedAt: v.savedAt,
        patient: {
          name: v.patient.name,
          birthDate: v.patient.birthDate,
          updatedAt: v.patient.updatedAt,
        },
        fields: {
          reason: v.fields.reason,
          history: v.fields.history,
          treatment: v.fields.treatment,
          instructions: v.fields.instructions,
        },
        documents: v.documents.map((d) => ({
          id: d.id,
          name: d.name,
          source: d.source,
          reportDate: d.reportDate,
          ...(d.sha256 ? { sha256: d.sha256, type: d.type, size: d.size } : {}),
        })),
      },
    ],
  };
  return {
    draft: selected,
    versionNumber: index + 1,
    approval: {
      id: approval.id,
      doctorUid: approval.doctorUid,
      doctorKeyId: approval.doctorKeyId,
      facilityUid: approval.facilityUid,
      credentialEventId: approval.credentialEventId,
      contentHash: approval.contentHash,
      createdAt: approval.createdAt,
    },
  };
}
export async function checkReferralPackage(
  value: ReferralPackage,
  context: TransferContext,
) {
  validateReferralDrafts([value?.draft]);
  validateReferralApprovals([value.approval], [value.draft]);
  if (
    value.draft.versions.length !== 1 ||
    !Number.isInteger(value.versionNumber) ||
    value.versionNumber < 1 ||
    value.versionNumber > 100 ||
    value.approval.id !== context.id ||
    value.approval.doctorUid !== context.senderUid ||
    value.approval.doctorKeyId !== context.senderKeyId ||
    value.approval.facilityUid !== context.recipientUid
  )
    throw Error(
      "This approved referral does not match its receiving facility or sender.",
    );
  await checkReferralApproval(
    value.draft,
    value.draft.versions[0].id,
    value.approval,
  );
  return value;
}
export async function encryptReferralPackage(
  value: ReferralPackage,
  context: TransferContext,
  sender: SharingDevice,
  recipient: PublicDevice,
) {
  await checkReferralPackage(value, context);
  await checkPublicDevice(recipient);
  if (
    sender.keyId !== context.senderKeyId ||
    recipient.keyId !== context.recipientKeyId
  )
    throw Error("The approved device keys changed.");
  const signed = await new CompactSign(
    new TextEncoder().encode(
      JSON.stringify({ version: 1, context, referral: value }),
    ),
  )
    .setProtectedHeader({
      alg: "ES256",
      typ: "matrisync-referral+jws",
      kid: sender.keyId,
    })
    .sign(sender.signKey);
  const ciphertext = await new CompactEncrypt(new TextEncoder().encode(signed))
    .setProtectedHeader({
      alg: "ECDH-ES",
      enc: "A256GCM",
      typ: "matrisync-referral+jwe",
      kid: recipient.keyId,
    })
    .encrypt(await importJWK(recipient.encryption, "ECDH-ES"));
  if (ciphertext.length > 700000)
    throw Error("The encrypted referral exceeds the transfer limit.");
  return ciphertext;
}
export async function decryptReferralPackage(
  ciphertext: string,
  context: TransferContext,
  recipient: SharingDevice,
  sender: PublicDevice,
) {
  const signed = await originalReferralSignature(
    ciphertext,
    context,
    recipient,
    sender,
  );
  return verifyOriginalReferral(signed, context, sender);
}

// Keep the doctor's original JWS intact when forwarding. Its original receiving
// facility/context is verified, never rewritten to the destination.
export async function originalReferralSignature(
  ciphertext: string,
  context: TransferContext,
  recipient: SharingDevice,
  sender: PublicDevice,
) {
  if (
    typeof ciphertext !== "string" ||
    ciphertext.length > 700000 ||
    context.recipientKeyId !== recipient.keyId ||
    context.senderKeyId !== sender.keyId
  )
    throw Error("Wrong referral recipient or device key.");
  await checkPublicDevice(sender);
  const opened = await compactDecrypt(ciphertext, recipient.decryptKey, {
    keyManagementAlgorithms: ["ECDH-ES"],
    contentEncryptionAlgorithms: ["A256GCM"],
  });
  if (
    opened.protectedHeader.typ !== "matrisync-referral+jwe" ||
    opened.protectedHeader.kid !== recipient.keyId
  )
    throw Error("Invalid referral envelope.");
  const original = new TextDecoder().decode(opened.plaintext);
  await verifyOriginalReferral(original, context, sender);
  return original;
}
export async function verifyOriginalReferral(
  original: string,
  context: TransferContext,
  sender: PublicDevice,
) {
  await checkPublicDevice(sender);
  if (
    context.senderKeyId !== sender.keyId ||
    typeof original !== "string" ||
    original.length > 700000
  )
    throw Error("Invalid original referral signer.");
  const signed = await compactVerify(
    original,
    await importJWK(sender.signing, "ES256"),
    { algorithms: ["ES256"] },
  );
  if (
    signed.protectedHeader.typ !== "matrisync-referral+jws" ||
    signed.protectedHeader.kid !== sender.keyId
  )
    throw Error("Invalid referral signature.");
  const payload = JSON.parse(new TextDecoder().decode(signed.payload));
  const fields: (keyof TransferContext)[] = [
    "id",
    "channelId",
    "senderUid",
    "recipientUid",
    "senderKeyId",
    "recipientKeyId",
  ];
  if (
    payload.version !== 1 ||
    !payload.context ||
    fields.some((k) => payload.context[k] !== context[k])
  )
    throw Error("The referral does not match this delivery.");
  return checkReferralPackage(payload.referral, context);
}
