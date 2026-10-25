export const returnConditions = {
  unassessed: "Not assessed",
  functional: "Appears functional",
  damaged: "Damaged",
  defective: "Defective",
} as const;
export type ReturnInput = {
  reference: string;
  bandId: string;
  facility: string;
  date: string;
  notes: string;
};
export type InspectionInput = {
  condition: keyof typeof returnConditions;
  notes: string;
};
export type ReturnInspection = InspectionInput & {
  id: string;
  at: string;
  by: string;
};
export type BandReturn = ReturnInput & {
  id: string;
  createdAt: string;
  createdBy: string;
  inspections: ReturnInspection[];
  voided?: { at: string; by: string; reason: string };
};
export type ReviewInput = {
  returnId: string;
  outcome: "consistent" | "discrepancy";
  evidence: string;
  notes: string;
};
export type LedgerReview = ReviewInput & {
  id: string;
  returnRevision: number;
  at: string;
  by: string;
};
export function inventoryText(
  value: string,
  label: string,
  max: number,
  required = true,
) {
  if (
    typeof value !== "string" ||
    value.length > max ||
    (required && !value.trim())
  )
    throw Error(`Enter ${label} of up to ${max} characters.`);
  return value.trim();
}
export const bandKey = (id: string) => id.trim().toUpperCase();
export const returnRevision = (item: BandReturn) =>
  item.inspections.length + (item.voided ? 1 : 0);
export function returnInput(input: ReturnInput): ReturnInput {
  const reference = inventoryText(
    input.reference,
    "a return reference",
    80,
  ).toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{2,79}$/.test(reference))
    throw Error(
      "Use a return reference of 3–80 letters, numbers, dots, slashes, underscores or hyphens.",
    );
  const date = inventoryText(input.date, "a return date", 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date) ||
    !Number.isFinite(Date.parse(date)) ||
    new Date(date).toISOString().slice(0, 10) !== date
  )
    throw Error("Enter a valid return date.");
  return {
    reference,
    date,
    bandId: inventoryText(input.bandId, "a printed Band Inventory ID", 120),
    facility: inventoryText(input.facility, "a receiving facility", 120),
    notes: inventoryText(input.notes, "notes", 1000, false),
  };
}
export function inspectionInput(input: InspectionInput): InspectionInput {
  if (!Object.hasOwn(returnConditions, input.condition))
    throw Error("Select an inspection condition.");
  return {
    condition: input.condition,
    notes: inventoryText(input.notes, "inspection notes", 1000),
  };
}
export function reviewInput(input: ReviewInput): ReviewInput {
  if (!["consistent", "discrepancy"].includes(input.outcome))
    throw Error("Select a local review outcome.");
  return {
    returnId: inventoryText(input.returnId, "a return record", 80),
    outcome: input.outcome,
    evidence: inventoryText(
      input.evidence,
      "an administrative evidence reference",
      200,
    ),
    notes: inventoryText(input.notes, "review notes", 1000),
  };
}
export function validateReturns(items: BandReturn[]) {
  if (!Array.isArray(items)) throw Error("Invalid return records.");
  const ids = new Set<string>(),
    refs = new Set<string>(),
    activeBands = new Set<string>();
  for (const item of items) {
    const checked = returnInput(item);
    if (
      !item.id ||
      ids.has(item.id) ||
      refs.has(checked.reference) ||
      !item.createdBy ||
      !Number.isFinite(Date.parse(item.createdAt)) ||
      !Array.isArray(item.inspections)
    )
      throw Error("Invalid or duplicate return record.");
    if (!item.voided && activeBands.has(bandKey(item.bandId)))
      throw Error("This band already has an active return record.");
    const inspectionIds = new Set<string>();
    for (const inspection of item.inspections) {
      inspectionInput(inspection);
      if (
        !inspection.id ||
        inspectionIds.has(inspection.id) ||
        !inspection.by ||
        !Number.isFinite(Date.parse(inspection.at))
      )
        throw Error("Invalid inspection history.");
      inspectionIds.add(inspection.id);
    }
    if (
      item.voided &&
      (!item.voided.by ||
        !Number.isFinite(Date.parse(item.voided.at)) ||
        !inventoryText(item.voided.reason, "a correction reason", 500))
    )
      throw Error("Invalid return correction.");
    ids.add(item.id);
    refs.add(checked.reference);
    if (!item.voided) activeBands.add(bandKey(item.bandId));
  }
}
export function validateReviews(reviews: LedgerReview[]) {
  if (!Array.isArray(reviews)) throw Error("Invalid reconciliation history.");
  const ids = new Set<string>();
  for (const review of reviews) {
    reviewInput(review);
    if (
      !review.id ||
      ids.has(review.id) ||
      !review.by ||
      !Number.isFinite(Date.parse(review.at)) ||
      !Number.isSafeInteger(review.returnRevision) ||
      review.returnRevision < 0
    )
      throw Error("Invalid reconciliation history.");
    ids.add(review.id);
  }
}
