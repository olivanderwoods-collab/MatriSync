// Append-only development codebook. These are structural labels, not clinical advice.
export type DictionaryEntry = Readonly<{
  id: number; code: string; term: string; category: "structure" | "terminology";
  subject: "mother" | "baby" | "both"; synonyms: readonly string[];
  introducedIn: number; status: "structural" | "reviewed" | "synthetic";
  standardId?: string; approvedAt: string | null; reviewReference?: string;
}>;
export type Codebook = Readonly<{ version: number; entries: readonly DictionaryEntry[] }>;
// NEVER reorder or reuse these numeric meanings. New fields get new IDs.
const names = [
  "patientId", "referralId", "subject", "patientName", "createdAt", "sendingFacilityId", "professionalId",
  "bloodGroup", "allergies", "diagnoses", "observations", "medications", "investigations", "reason",
  "contact", "pregnancyStage", "usg", "bloodSugar", "bloodPressure", "situation", "drugsGiven",
  "remarks", "history", "treatment", "instructions", "patientReference",
  "status", "name", "value", "unit", "route", "dose", "measuredAt", "recordedAt", "administeredAt",
  "prescribedAt", "source", "qualifier", "negation", "timing", "from", "until", "text",
  "tripStartedAt", "events", "eventType", "elapsedSeconds", "recordedElapsedSeconds", "clockQuality",
  "systolic", "diastolic", "heartRate", "oxygenSaturation", "temperature", "sequence",
] as const;
export const structuralNames: readonly string[] = Object.freeze([...names]);
export const codebookV1: Codebook = Object.freeze({ version: 1, entries: Object.freeze(names.map((term, i) => Object.freeze({
  id: i + 1, code: `F${i + 1}`, term, category: "structure" as const, subject: "both" as const,
  synonyms: Object.freeze([] as string[]), introducedIn: 1, status: "structural" as const, approvedAt: null,
}))) });

function fail(): never { throw Error("Invalid or conflicting dictionary record. No dictionary was activated."); }
export function validateCodebook(book: Codebook): void {
  if (!book || !Number.isInteger(book.version) || book.version < 1 || book.version > 65535 || !Array.isArray(book.entries) || book.entries.length > 4096) fail();
  const ids = new Set<number>(), codes = new Set<string>(), meanings = new Set<string>();
  for (const e of book.entries) {
    if (!e || !Number.isInteger(e.id) || e.id < 1 || e.id > 65535 || ids.has(e.id) ||
      typeof e.code !== "string" || !/^[A-Z][A-Z0-9_-]{0,31}$/.test(e.code) || codes.has(e.code) ||
      typeof e.term !== "string" || !e.term.trim() || e.term.length > 200 ||
      !["structure", "terminology"].includes(e.category) || !["mother", "baby", "both"].includes(e.subject) ||
      !["structural", "reviewed", "synthetic"].includes(e.status) || !Number.isInteger(e.introducedIn) || e.introducedIn < 1 || e.introducedIn > book.version ||
      !Array.isArray(e.synonyms) || e.synonyms.length > 20 || e.synonyms.some((s: unknown) => typeof s !== "string" || !s.trim() || s.length > 200) ||
      (e.category === "structure") !== (e.status === "structural") ||
      (e.status === "reviewed" && (typeof e.reviewReference !== "string" || !e.reviewReference.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(e.approvedAt || "") || !Number.isFinite(Date.parse(e.approvedAt!)) || new Date(e.approvedAt!).toISOString().slice(0, 10) !== e.approvedAt))) fail();
    for (const term of [e.term, ...e.synonyms]) {
      const k = `${e.category}:${term}`;
      if (meanings.has(k)) fail();
      meanings.add(k);
    }
    ids.add(e.id); codes.add(e.code);
  }
}
// This validates a proposed *build-time* import, not the truth of its review claim.
// A maintainer must authenticate the review evidence before bundling it. No UI import.
export function appendCodebook(previous: Codebook, next: Codebook): Codebook {
  validateCodebook(previous); validateCodebook(next);
  if (next.version !== previous.version + 1) fail();
  for (const old of previous.entries) {
    const found = next.entries.find(e => e.id === old.id);
    if (!found || JSON.stringify(found) !== JSON.stringify(old)) fail();
  }
  for (const e of next.entries) if (!previous.entries.some(old => old.id === e.id) && e.introducedIn !== next.version) fail();
  return Object.freeze({ version: next.version, entries: Object.freeze(next.entries.map(e => Object.freeze({ ...e, synonyms: Object.freeze([...e.synonyms]) }))) });
}
export function dictionary(version: number): Codebook {
  if (version !== 1) throw Error(`Unsupported NFC dictionary version ${version}; cannot decode reliably.`);
  return codebookV1;
}
export function fieldId(name: string, book = codebookV1): number {
  const e = book.entries.find(e => e.category === "structure" && e.term === name);
  if (!e) throw Error(`Unsupported NFC field: ${name}. Nothing was omitted automatically.`);
  return e.id;
}
export function entryFor(id: number, book = codebookV1): DictionaryEntry {
  const entry = book.entries.find(e => e.id === id);
  if (!entry) throw Error(`Unknown NFC dictionary identifier ${id}; cannot decode reliably.`);
  return entry;
}
export function reviewedTerm(text: string, book = codebookV1): DictionaryEntry | undefined {
  // Exact spelling only: no trimming, fuzzy matching, AI, case folding or interpretation.
  return book.entries.find(e => e.category === "terminology" && e.status === "reviewed" && e.term === text);
}
