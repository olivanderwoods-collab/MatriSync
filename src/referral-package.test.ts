import { it, expect } from "vitest";
import "fake-indexeddb/auto";
import { newSharingDevice } from "./sharing-crypto";
import {
  referralPackage,
  encryptReferralPackage,
  decryptReferralPackage,
} from "./referral-package";
import { referralApprovalHash, referralApprovalId } from "./referral-approval";
import { emptyReferralFields, type ReferralDraft } from "./referral-draft";
import {
  saveReferralDelivery,
  savedReferralDeliveries,
} from "./referral-delivery-storage";
import { approvedReferralDocumentHtml } from "./referral-document";
it("delivers only the exact approved version, authenticates both endpoints, and preserves encrypted offline copies", async () => {
  const sender = await newSharingDevice(),
    recipient = await newSharingDevice(),
    other = await newSharingDevice(),
    date = new Date().toISOString();
  const draft: ReferralDraft = {
    id: crypto.randomUUID(),
    patientId: "mother",
    authorUid: "doctor",
    versions: [
      {
        id: crypto.randomUUID(),
        savedAt: date,
        patient: { name: "Fictional Mother", birthDate: "", updatedAt: date },
        fields: { ...emptyReferralFields(), reason: "Reviewed facts" },
        documents: [],
      },
    ],
  };
  const v = draft.versions[0];
  // Approve the second version: the compact package must retain its original
  // ordinal while excluding both earlier and later private draft versions.
  draft.versions.unshift({
    ...v,
    id: crypto.randomUUID(),
    fields: { ...v.fields, reason: "EARLIER PRIVATE EDIT" },
  });
  const approval = {
    id: referralApprovalId(draft, v.id),
    doctorUid: "doctor",
    doctorKeyId: sender.keyId,
    facilityUid: "facility",
    credentialEventId: crypto.randomUUID(),
    createdAt: date,
    contentHash: await referralApprovalHash(draft, v.id),
  };
  draft.versions.push({
    ...v,
    id: crypto.randomUUID(),
    fields: { ...v.fields, reason: "UNAPPROVED PRIVATE EDIT" },
  });
  const value = await referralPackage(draft, v.id, approval),
    context = {
      id: approval.id,
      channelId: "doctor-facility",
      senderUid: "doctor",
      recipientUid: "facility",
      senderKeyId: sender.keyId,
      recipientKeyId: recipient.keyId,
    };
  expect(value.draft.versions).toHaveLength(1);
  expect(value.versionNumber).toBe(2);
  expect(JSON.stringify(value)).not.toContain("PRIVATE EDIT");
  const ciphertext = await encryptReferralPackage(
    value,
    context,
    sender,
    recipient,
  );
  expect(ciphertext).not.toContain("Fictional Mother");
  expect(ciphertext).not.toContain("Reviewed facts");
  expect(
    await decryptReferralPackage(ciphertext, context, recipient, sender),
  ).toEqual(value);
  for (const changed of [
    { ...context, id: crypto.randomUUID() },
    { ...context, channelId: "wrong" },
    { ...context, recipientUid: "outsider" },
    { ...context, senderUid: "other" },
  ])
    await expect(
      decryptReferralPackage(ciphertext, changed, recipient, sender),
    ).rejects.toThrow();
  await expect(
    decryptReferralPackage(ciphertext, context, other, sender),
  ).rejects.toThrow();
  await expect(
    decryptReferralPackage(ciphertext, context, recipient, other),
  ).rejects.toThrow();
  await expect(
    decryptReferralPackage(
      ciphertext.slice(0, -5) + "AAAAA",
      context,
      recipient,
      sender,
    ),
  ).rejects.toThrow();
  const changed = structuredClone(value);
  changed.draft.versions[0].fields.reason = "Invented";
  await expect(
    encryptReferralPackage(changed, context, sender, recipient),
  ).rejects.toThrow();
  const item = {
    ...context,
    ciphertext,
    sender: {
      encryption: sender.encryption,
      signing: sender.signing,
      keyId: sender.keyId,
    },
    recipientRole: "organization" as const,
    savedAt: date,
    verifiedApprovalHash: approval.contentHash,
  };
  await saveReferralDelivery("facility", item);
  await saveReferralDelivery("facility", {
    ...item,
    savedAt: new Date(Date.now() + 1000).toISOString(),
  });
  const saved = await savedReferralDeliveries("facility");
  expect(saved).toEqual([item]);
  expect(await savedReferralDeliveries("outsider")).toEqual([]);
  await expect(saveReferralDelivery("other", item)).rejects.toThrow();
  await expect(
    saveReferralDelivery("facility", { ...item, ciphertext: "changed" }),
  ).rejects.toThrow();
  const reopened = await decryptReferralPackage(
    saved[0].ciphertext,
    saved[0],
    recipient,
    sender,
  );
  expect(
    await approvedReferralDocumentHtml(
      reopened.draft,
      v.id,
      reopened.approval,
      reopened.versionNumber,
    ),
  ).toBe(await approvedReferralDocumentHtml(draft, v.id, approval));
});
