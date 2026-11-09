export type ManualRecord = { title: string; dose: string; route: string; administeredAt: string; notes: string };
export type RecordKind = "reports" | "prescriptions";
export type RecordInput = { source: string; date: string; manual?: ManualRecord; file?: File };
export type AddedRecord = { id: string; kind: RecordKind; title: string; source: string; date: string; addedAt: string; enteredBy: string; manual?: ManualRecord; fileName?: string; submittedByRole?: string; review?: {reviewer:string;at:string} };
export function checkManualRecord(value: ManualRecord): ManualRecord {
  if (!value || typeof value !== "object") throw Error("Enter the record details.");
  const result = {} as ManualRecord;
  for (const key of ["title", "dose", "route", "administeredAt", "notes"] as const) {
    if (typeof value[key] !== "string" || value[key].length > (key === "notes" ? 8000 : 200)) throw Error("Check the record field lengths.");
    result[key] = value[key].trim();
  }
  if (!result.title) throw Error("Enter a medicine or report name.");
  return result;
}
export function manualRecordText(value: ManualRecord) {
  const m = checkManualRecord(value);
  return `${m.title}\nDose: ${m.dose || "Not recorded"}\nRoute: ${m.route || "Not recorded"}\nAdministration time: ${m.administeredAt || "Not recorded"}\n${m.notes}`;
}
