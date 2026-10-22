export type Patient = {
  id: string;
  name: string;
  birthDate: string;
  history: string;
  createdAt: string;
  updatedAt: string;
};
export type LocalDocument = {
  id: string;
  patientId: string;
  kind: "reports" | "prescriptions";
  name: string;
  type: string;
  size: number;
  addedAt: string;
  source: string;
  reportDate: string;
};
export type RecordData = {
  version: 1;
  patients: Patient[];
  documents: LocalDocument[];
};
export const emptyRecords = (): RecordData => ({
  version: 1,
  patients: [],
  documents: [],
});
export function patientInput(name: string, birthDate: string, history: string) {
  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  name = name.trim();
  history = history.trim();
  if (!name || name.length > 120)
    throw Error("Enter a name of up to 120 characters.");
  if (history.length > 8000)
    throw Error("History must be 8,000 characters or fewer.");
  if (
    birthDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate) ||
      !Number.isFinite(Date.parse(birthDate)) ||
      new Date(birthDate).toISOString().slice(0, 10) !== birthDate ||
      birthDate > today)
  )
    throw Error("Enter a valid birth date that is not in the future.");
  return { name, birthDate, history };
}
export function parseRecords(bytes: Uint8Array): RecordData {
  const value = JSON.parse(new TextDecoder().decode(bytes)) as RecordData;
  if (
    value.version !== 1 ||
    !Array.isArray(value.patients) ||
    !Array.isArray(value.documents)
  )
    throw Error("Unsupported record format.");
  const ids = new Set<string>();
  for (const p of value.patients) {
    if (
      typeof p.id !== "string" ||
      ids.has(p.id) ||
      typeof p.name !== "string" ||
      typeof p.birthDate !== "string" ||
      typeof p.history !== "string"
    )
      throw Error("Invalid patient record.");
    patientInput(p.name, p.birthDate, p.history);
    ids.add(p.id);
  }
  const files = new Set<string>();
  for (const d of value.documents) {
    if (
      !ids.has(d.patientId) ||
      typeof d.id !== "string" ||
      files.has(d.id) ||
      !["reports", "prescriptions"].includes(d.kind) ||
      typeof d.name !== "string" ||
      !["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(
        d.type,
      ) ||
      !Number.isInteger(d.size) ||
      d.size <= 0 ||
      d.size > 10 * 1024 * 1024
    )
      throw Error("Invalid document record.");
    files.add(d.id);
  }
  return value;
}
// Explicit allowlist: document bytes, filenames and document metadata cannot enter
// a structured-record cloud backup, even if RecordData gains additional fields.
export function cloudRecords(data: RecordData) {
  return {
    version: 1 as const,
    patients: data.patients.map((p) => ({
      id: p.id,
      name: p.name,
      birthDate: p.birthDate,
      history: p.history,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    })),
  };
}
export async function validatedDocument(file: File) {
  if (!file.size || file.size > 10 * 1024 * 1024)
    throw Error("Choose a PDF, JPG, PNG or WebP file up to 10 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const header = new TextDecoder("latin1").decode(bytes.subarray(0, 12));
  const actual = header.startsWith("%PDF-")
    ? "application/pdf"
    : bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
      ? "image/jpeg"
      : [137, 80, 78, 71, 13, 10, 26, 10].every((n, i) => bytes[i] === n)
        ? "image/png"
        : header.startsWith("RIFF") && header.slice(8, 12) === "WEBP"
          ? "image/webp"
          : "";
  if (!actual || actual !== file.type)
    throw Error("The file content must match its PDF, JPG, PNG or WebP type.");
  return bytes;
}
