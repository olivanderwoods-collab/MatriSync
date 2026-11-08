import { it, expect } from "vitest";
import {
  checkReferralApproval,
  referralApprovalHash,
  referralApprovalId,
  type ReferralApproval,
} from "./referral-approval";
import { approvedReferralDocumentHtml } from "./referral-document";
import { emptyReferralFields, type ReferralDraft } from "./referral-draft";
const date = "2026-10-29T00:00:00.000Z";
const draft = (): ReferralDraft => ({
  id: crypto.randomUUID(),
  patientId: "patient",
  authorUid: "doctor",
  versions: [
    {
      id: crypto.randomUUID(),
      savedAt: date,
      patient: { name: "Original Mother", birthDate: "", updatedAt: date },
      fields: { ...emptyReferralFields(), reason: "Recorded facts" },
      documents: [
        {
          id: "original",
          name: "report.pdf",
          source: "Recorded clinic",
          reportDate: "2026-10-20",
        },
      ],
    },
  ],
});
it("binds approval to the selected immutable version and every source field, not later edits", async () => {
  const d = draft(),
    v = d.versions[0];
  const approval: ReferralApproval = {
    id: referralApprovalId(d, v.id),
    doctorUid: "doctor",
    doctorKeyId: "a".repeat(64),
    facilityUid: "facility",
    credentialEventId: crypto.randomUUID(),
    contentHash: await referralApprovalHash(d, v.id),
    createdAt: date,
  };
  await expect(
    checkReferralApproval(d, v.id, approval),
  ).resolves.toBeUndefined();
  for (const mutate of [
    (x: ReferralDraft) => {
      x.versions[0].fields.reason = "Changed";
    },
    (x: ReferralDraft) => {
      x.versions[0].patient.name = "Another mother";
    },
    (x: ReferralDraft) => {
      x.versions[0].documents[0].source = "Changed source";
    },
    (x: ReferralDraft) => {
      x.authorUid = "another";
    },
    (x: ReferralDraft) => {
      x.patientId = "another-patient";
    },
  ]) {
    const changed = structuredClone(d);
    mutate(changed);
    await expect(
      checkReferralApproval(changed, v.id, approval),
    ).rejects.toThrow("does not match");
    await expect(
      approvedReferralDocumentHtml(changed, v.id, approval),
    ).rejects.toThrow("does not match");
  }
  d.versions.push({
    ...structuredClone(v),
    id: crypto.randomUUID(),
    fields: { ...v.fields, reason: "New draft" },
  });
  await expect(
    checkReferralApproval(d, v.id, approval),
  ).resolves.toBeUndefined();
  await expect(
    checkReferralApproval(d, d.versions[1].id, approval),
  ).rejects.toThrow();
  const html = await approvedReferralDocumentHtml(d, v.id, approval);
  expect(html).toContain("APPROVED VERSION");
  expect(html).toContain("Delivery status recorded separately");
  expect(html).not.toContain("New draft");
  expect(html).toContain(approval.contentHash);
});

it("binds received profile provenance and the byte digest of referenced originals", async () => {
  const d = draft(),
    v = d.versions[0];
  d.patientId = `shared-${"a".repeat(64)}`;
  d.receivedOrigin = {
    profileId: "a".repeat(64),
    sourceUid: "mother",
    sourcePatientId: "self",
    profileRevision: "b".repeat(64),
    transferId: "receipt",
    receivedAt: date,
  };
  Object.assign(v.documents[0], {
    sha256: "c".repeat(64),
    type: "application/pdf",
    size: 100,
  });
  const hash = await referralApprovalHash(d, v.id);
  for (const mutate of [
    (x: ReferralDraft) => {
      x.receivedOrigin!.sourceUid = "another-mother";
    },
    (x: ReferralDraft) => {
      x.receivedOrigin!.profileRevision = "d".repeat(64);
    },
    (x: ReferralDraft) => {
      x.versions[0].documents[0].sha256 = "e".repeat(64);
    },
    (x: ReferralDraft) => {
      x.versions[0].documents[0].size = 101;
    },
  ]) {
    const changed = structuredClone(d);
    mutate(changed);
    expect(await referralApprovalHash(changed, v.id)).not.toBe(hash);
  }
});
