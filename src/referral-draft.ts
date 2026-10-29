export const referralFields = [
  "reason",
  "history",
  "treatment",
  "instructions",
] as const;
export type ReferralFields = Record<(typeof referralFields)[number], string>;
export type ReceivedReferralOrigin = {
  profileId: string;
  sourceUid: string;
  sourcePatientId: string;
  profileRevision: string;
  transferId: string;
  receivedAt: string;
};
export type ReferralDraft = {
  id: string;
  patientId: string;
  authorUid: string;
  receivedOrigin?: ReceivedReferralOrigin;
  versions: {
    id: string;
    savedAt: string;
    fields: ReferralFields;
    patient: { name: string; birthDate: string; updatedAt: string };
    documents: {
      id: string;
      name: string;
      source: string;
      reportDate: string;
      sha256?: string;
      type?: string;
      size?: number;
    }[];
  }[];
};
export const emptyReferralFields = (): ReferralFields => ({
  reason: "",
  history: "",
  treatment: "",
  instructions: "",
});
export function referralInput(value: ReferralFields): ReferralFields {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw Error("Invalid referral fields.");
  const result = emptyReferralFields();
  for (const key of referralFields) {
    if (typeof value[key] !== "string" || value[key].length > 8000)
      throw Error(
        "Each referral field must contain no more than 8,000 characters.",
      );
    result[key] = value[key].trim();
  }
  if (!result.reason) throw Error("Enter the reason for referral.");
  return result;
}
export function validateReferralDrafts(
  value: unknown,
): asserts value is ReferralDraft[] {
  if (!Array.isArray(value) || value.length > 200)
    throw Error("Invalid referral drafts.");
  const ids = new Set<string>();
  const string = (v: unknown, max: number) =>
    typeof v === "string" && v.length > 0 && v.length <= max;
  const instant = (v: unknown) =>
    typeof v === "string" &&
    v.length <= 30 &&
    Number.isFinite(Date.parse(v)) &&
    new Date(v).toISOString() === v;
  const date = (v: unknown) =>
    typeof v === "string" &&
    (v === "" ||
      (/^\d{4}-\d{2}-\d{2}$/.test(v) &&
        Number.isFinite(Date.parse(v)) &&
        new Date(v).toISOString().slice(0, 10) === v));
  for (const draft of value) {
    if (
      !draft ||
      !string(draft.id, 200) ||
      ids.has(draft.id) ||
      !string(draft.patientId, 200) ||
      !string(draft.authorUid, 200) ||
      !Array.isArray(draft.versions) ||
      !draft.versions.length ||
      draft.versions.length > 100
    )
      throw Error("Invalid referral draft identity.");
    ids.add(draft.id);
    const origin = draft.receivedOrigin;
    const digest = (v: unknown) =>
      typeof v === "string" && /^[a-f0-9]{64}$/.test(v);
    if (
      origin !== undefined &&
      (!origin ||
        !digest(origin.profileId) ||
        !digest(origin.profileRevision) ||
        !string(origin.sourceUid, 128) ||
        !string(origin.sourcePatientId, 200) ||
        !string(origin.transferId, 200) ||
        !instant(origin.receivedAt) ||
        draft.patientId !== `shared-${origin.profileId}`)
    )
      throw Error("Invalid received referral source.");
    const revisions = new Set<string>();
    for (const version of draft.versions) {
      if (
        !version ||
        !string(version.id, 200) ||
        revisions.has(version.id) ||
        !instant(version.savedAt) ||
        !version.patient ||
        !string(version.patient.name, 120) ||
        !date(version.patient.birthDate) ||
        !instant(version.patient.updatedAt) ||
        !Array.isArray(version.documents) ||
        version.documents.length > 50
      )
        throw Error("Invalid referral version.");
      revisions.add(version.id);
      referralInput(version.fields);
      const documents = new Set<string>();
      for (const document of version.documents) {
        if (
          !document ||
          !string(document.id, 200) ||
          documents.has(document.id) ||
          !string(document.name, 200) ||
          typeof document.source !== "string" ||
          document.source.length > 500 ||
          !date(document.reportDate)
        )
          throw Error("Invalid referral document reference.");
        documents.add(document.id);
        if (
          origin &&
          (!digest(document.sha256) ||
            ![
              "application/pdf",
              "image/png",
              "image/jpeg",
              "image/webp",
            ].includes(document.type) ||
            !Number.isInteger(document.size) ||
            document.size < 1 ||
            document.size > 10 * 1024 * 1024)
        )
          throw Error("Invalid received original reference.");
      }
    }
  }
}
