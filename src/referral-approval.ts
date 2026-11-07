import { handoffDetailFields, validateReferralDrafts, type ReferralDraft } from "./referral-draft";

export type ReferralApproval = {
  id: string;
  doctorUid: string;
  doctorKeyId: string;
  facilityUid: string;
  credentialEventId: string;
  contentHash: string;
  createdAt: string;
};
export function validateReferralApprovals(
  values: unknown,
  drafts: ReferralDraft[],
): asserts values is ReferralApproval[] {
  if (!Array.isArray(values) || values.length > 500)
    throw Error("Invalid saved referral approvals.");
  const ids = new Set<string>();
  for (const value of values) {
    const a = value as ReferralApproval;
    if (
      !a ||
      typeof a !== "object" ||
      typeof a.id !== "string" ||
      !/^[a-f0-9-]{36}_[a-f0-9-]{36}$/.test(a.id) ||
      ids.has(a.id) ||
      typeof a.doctorUid !== "string" ||
      !a.doctorUid ||
      a.doctorUid.length > 128 ||
      typeof a.facilityUid !== "string" ||
      !a.facilityUid ||
      a.facilityUid.length > 128 ||
      typeof a.doctorKeyId !== "string" ||
      !/^[a-f0-9]{64}$/.test(a.doctorKeyId) ||
      typeof a.contentHash !== "string" ||
      !/^[a-f0-9]{64}$/.test(a.contentHash) ||
      typeof a.credentialEventId !== "string" ||
      !/^[a-f0-9-]{36}$/.test(a.credentialEventId) ||
      typeof a.createdAt !== "string" ||
      !Number.isFinite(Date.parse(a.createdAt)) ||
      new Date(a.createdAt).toISOString() !== a.createdAt ||
      !drafts.some(
        (d) =>
          d.authorUid === a.doctorUid &&
          d.versions.some((v) => referralApprovalId(d, v.id) === a.id),
      )
    )
      throw Error("Invalid saved referral approval identity.");
    ids.add(a.id);
  }
}
export function referralApprovalId(draft: ReferralDraft, versionId: string) {
  return `${draft.id}_${versionId}`;
}
export async function referralApprovalHash(
  draft: ReferralDraft,
  versionId: string,
) {
  validateReferralDrafts([draft]);
  const version = draft.versions.find((v) => v.id === versionId);
  if (!version) throw Error("Choose a saved referral version first.");
  // Explicit field order; future versions and unselected originals cannot change
  // the approved version's digest. Arrays preserve the displayed source order.
  const origin = draft.receivedOrigin;
  const content = [
    "matrisync-referral-approval-v1",
    draft.id,
    draft.patientId,
    draft.authorUid,
    origin
      ? [
          origin.profileId,
          origin.sourceUid,
          origin.sourcePatientId,
          origin.profileRevision,
          origin.transferId,
          origin.receivedAt,
        ]
      : null,
    version.id,
    version.savedAt,
    [
      version.patient.name,
      version.patient.birthDate,
      version.patient.updatedAt,
    ],
    [
      version.fields.reason,
      version.fields.history,
      version.fields.treatment,
      version.fields.instructions,
    ],
    version.documents.map((d) => [
      d.id,
      d.name,
      d.source,
      d.reportDate,
      d.sha256 || null,
      d.type || null,
      d.size ?? null,
    ]),
  ];
  const digestInput = handoffDetailFields.some(key => version.fields[key] !== undefined)
    ? [...content, ["manual-handoff-v1", ...handoffDetailFields.map(key => [key, version.fields[key] ?? null])]]
    : content;
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(digestInput)),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}
export async function checkReferralApproval(
  draft: ReferralDraft,
  versionId: string,
  approval: ReferralApproval,
) {
  if (
    approval.id !== referralApprovalId(draft, versionId) ||
    approval.doctorUid !== draft.authorUid ||
    !/^[a-f0-9]{64}$/.test(approval.doctorKeyId) ||
    !/^[a-f0-9-]{36}$/.test(approval.credentialEventId) ||
    typeof approval.facilityUid !== "string" ||
    !approval.facilityUid ||
    approval.facilityUid.length > 128 ||
    typeof approval.createdAt !== "string" ||
    !Number.isFinite(Date.parse(approval.createdAt)) ||
    new Date(approval.createdAt).toISOString() !== approval.createdAt ||
    approval.contentHash !== (await referralApprovalHash(draft, versionId))
  )
    throw Error(
      "This approval does not match the selected saved referral version.",
    );
}
