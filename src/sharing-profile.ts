import {
  motherProfileInput,
  patientInput,
  type MotherProfile,
  type Patient,
  type LocalDocument,
} from "./records-model";

// A source-scoped identity, never a lookup credential or an ownership claim.
export type SharedProfileSnapshot = {
  profileId: string;
  sourceUid: string;
  sourcePatientId: string;
  sourceUpdatedAt: string;
  revision: string;
  patient: {
    name: string;
    birthDate: string;
    history: string;
    kind: "mother" | "child" | "patient";
    parentProfileId?: string;
    details?: Omit<MotherProfile, "username" | "profileCode">;
    child?: { sex: string; bloodGroup: string; allergies: string };
  };
  documents: ProfileDocument[];
};
export type ProfileDocument = Pick<
  LocalDocument,
  "id" | "kind" | "name" | "type" | "size" | "source" | "reportDate" | "addedAt"
> & { sha256: string };
const hex = /^[a-f0-9]{64}$/;
export async function contentDigest(bytes: Uint8Array<ArrayBuffer>) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (b) => b.toString(16).padStart(2, "0"),
  ).join("");
}
async function hashJSON(value: unknown) {
  return contentDigest(new TextEncoder().encode(JSON.stringify(value)));
}
export function sourceProfileId(uid: string, patientId: string) {
  return hashJSON(["matrisync-source-profile-v1", uid, patientId]);
}
function object(value: unknown, fields: string[]): Record<string, unknown> {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !fields.includes(k))
  )
    throw Error("Unsupported shared profile fields.");
  return value as Record<string, unknown>;
}
function text(value: unknown, max: number, required = false): string {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw Error("Invalid shared profile text.");
  return value;
}
function stamp(value: unknown): string {
  const date = text(value, 30, true);
  if (
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString() !== date
  )
    throw Error("Invalid profile version date.");
  return date;
}
function digest(value: unknown): string {
  const result = text(value, 64, true);
  if (!hex.test(result)) throw Error("Invalid profile fingerprint.");
  return result;
}
function normalize(value: unknown): Omit<SharedProfileSnapshot, "revision"> {
  const item = object(value, [
    "profileId",
    "sourceUid",
    "sourcePatientId",
    "sourceUpdatedAt",
    "revision",
    "patient",
    "documents",
  ]);
  const raw = object(item.patient, [
    "name",
    "birthDate",
    "history",
    "kind",
    "parentProfileId",
    "details",
    "child",
  ]);
  const input = patientInput(
    text(raw.name, 120, true),
    text(raw.birthDate, 10),
    text(raw.history, 8000),
  );
  if (!["mother", "child", "patient"].includes(String(raw.kind)))
    throw Error("Invalid shared patient kind.");
  const patient: SharedProfileSnapshot["patient"] = {
    ...input,
    kind: raw.kind as SharedProfileSnapshot["patient"]["kind"],
  };
  if (raw.kind === "child") {
    patient.parentProfileId = digest(raw.parentProfileId);
    const child = object(raw.child, ["sex", "bloodGroup", "allergies"]);
    patient.child = {
      sex: text(child.sex, 1000),
      bloodGroup: text(child.bloodGroup, 1000),
      allergies: text(child.allergies, 1000),
    };
    if (raw.details !== undefined)
      throw Error("Child profile cannot carry Mother details.");
  } else if (raw.parentProfileId !== undefined || raw.child !== undefined)
    throw Error("Invalid family linkage.");
  if (raw.details !== undefined) {
    const details = object(raw.details, [
      "pregnancyWeeks",
      "recordedOn",
      "bloodGroup",
      "allergies",
      "emergencyContact",
      "emergencyPhone",
      "guardian",
      "guardianPhone",
      "residence",
    ]);
    const checked = motherProfileInput({
      ...details,
      username: "",
      profileCode: "",
    } as MotherProfile);
    // Explicit allowlist: access credentials never enter a shared snapshot.
    patient.details = {
      bloodGroup: checked.bloodGroup,
      allergies: checked.allergies,
      emergencyContact: checked.emergencyContact,
      emergencyPhone: checked.emergencyPhone,
      guardian: checked.guardian,
      guardianPhone: checked.guardianPhone,
      residence: checked.residence,
    };
    if (checked.pregnancyWeeks !== undefined) {
      patient.details.pregnancyWeeks = checked.pregnancyWeeks;
      patient.details.recordedOn = checked.recordedOn;
    }
  }
  if (!Array.isArray(item.documents) || item.documents.length > 200)
    throw Error("A snapshot supports up to 200 document references.");
  const seen = new Set<string>();
  const documents: ProfileDocument[] = item.documents
    .map((value): ProfileDocument => {
      const d = object(value, [
        "id",
        "kind",
        "name",
        "type",
        "size",
        "source",
        "reportDate",
        "addedAt",
        "sha256",
      ]);
      const id = text(d.id, 200, true);
      if (seen.has(id)) throw Error("Duplicate document reference.");
      seen.add(id);
      if (d.kind !== "reports" && d.kind !== "prescriptions")
        throw Error("Invalid document kind.");
      if (
        !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
          String(d.type),
        ) ||
        !Number.isSafeInteger(d.size) ||
        Number(d.size) <= 0 ||
        Number(d.size) > 50 * 1024 * 1024
      )
        throw Error("Invalid original document metadata.");
      const reportDate = text(d.reportDate, 10);
      if (
        reportDate &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(reportDate) ||
          !Number.isFinite(Date.parse(reportDate)) ||
          new Date(reportDate).toISOString().slice(0, 10) !== reportDate)
      )
        throw Error("Invalid report date.");
      return {
        id,
        kind: d.kind,
        name: text(d.name, 200, true),
        type: String(d.type),
        size: Number(d.size),
        source: text(d.source, 500),
        reportDate,
        addedAt: stamp(d.addedAt),
        sha256: digest(d.sha256),
      };
    })
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return {
    profileId: digest(item.profileId),
    sourceUid: text(item.sourceUid, 128, true),
    sourcePatientId: text(item.sourcePatientId, 200, true),
    sourceUpdatedAt: stamp(item.sourceUpdatedAt),
    patient,
    documents,
  };
}
export async function checkProfileSnapshot(
  value: unknown,
  senderUid: string,
): Promise<SharedProfileSnapshot> {
  const normalized = normalize(value);
  if (
    normalized.sourceUid !== senderUid ||
    normalized.profileId !==
      (await sourceProfileId(senderUid, normalized.sourcePatientId))
  )
    throw Error("Profile identity does not match the signed sender.");
  if (
    normalized.patient.kind === "child" &&
    normalized.patient.parentProfileId !==
      (await sourceProfileId(senderUid, "self"))
  )
    throw Error("Invalid parent profile identity.");
  const revision = await hashJSON(normalized);
  if (
    object(value, [
      "profileId",
      "sourceUid",
      "sourcePatientId",
      "sourceUpdatedAt",
      "revision",
      "patient",
      "documents",
    ]).revision !== revision
  )
    throw Error("The shared profile revision was changed.");
  return { ...normalized, revision };
}
export async function createProfileSnapshot(
  uid: string,
  source: Patient,
  documents: ProfileDocument[],
): Promise<SharedProfileSnapshot> {
  const patient: SharedProfileSnapshot["patient"] = {
    name: source.name,
    birthDate: source.birthDate,
    history: source.history,
    kind: source.kind || (source.id === "self" ? "mother" : "patient"),
  };
  if (patient.kind === "child") {
    if (source.parentId !== "self")
      throw Error("Invalid local child ownership.");
    patient.parentProfileId = await sourceProfileId(uid, "self");
    patient.child = source.child;
  }
  if (source.profile) {
    const p = source.profile;
    patient.details = {
      bloodGroup: p.bloodGroup,
      allergies: p.allergies,
      emergencyContact: p.emergencyContact,
      emergencyPhone: p.emergencyPhone,
      guardian: p.guardian,
      guardianPhone: p.guardianPhone,
      residence: p.residence,
    };
    if (p.pregnancyWeeks !== undefined) {
      patient.details.pregnancyWeeks = p.pregnancyWeeks;
      patient.details.recordedOn = p.recordedOn;
    }
  }
  const value = normalize({
    profileId: await sourceProfileId(uid, source.id),
    sourceUid: uid,
    sourcePatientId: source.id,
    sourceUpdatedAt: source.updatedAt,
    patient,
    documents,
  });
  return { ...value, revision: await hashJSON(value) };
}

export type ReceivedProfile = {
  snapshot: SharedProfileSnapshot;
  savedAt: string;
  transferId: string;
};
export type ReceivedOriginal = {
  sourceUid: string;
  sourcePatientId: string;
  sourceDocumentId: string;
  sha256: string;
  type: string;
  size: number;
};
// A matching name or digest alone never links another patient's original.
export function matchesProfileOriginal(
  snapshot: SharedProfileSnapshot,
  reference: ProfileDocument,
  original: ReceivedOriginal,
) {
  return (
    original.sourceUid === snapshot.sourceUid &&
    original.sourcePatientId === snapshot.sourcePatientId &&
    original.sourceDocumentId === reference.id &&
    original.sha256 === reference.sha256 &&
    original.type === reference.type &&
    original.size === reference.size
  );
}
export function groupProfileVersions(profiles: ReceivedProfile[]) {
  const groups = new Map<string, ReceivedProfile[]>();
  for (const item of profiles) {
    const list = groups.get(item.snapshot.profileId) || [];
    const duplicate = list.findIndex(
      (other) => other.snapshot.revision === item.snapshot.revision,
    );
    if (duplicate === -1) list.push(item);
    else if (
      item.savedAt < list[duplicate].savedAt ||
      (item.savedAt === list[duplicate].savedAt &&
        item.transferId < list[duplicate].transferId)
    )
      list[duplicate] = item;
    groups.set(item.snapshot.profileId, list);
  }
  return [...groups.entries()].map(([profileId, versions]) => ({
    profileId,
    versions: versions.sort(
      (a, b) =>
        a.savedAt.localeCompare(b.savedAt) ||
        a.transferId.localeCompare(b.transferId),
    ),
  }));
}
