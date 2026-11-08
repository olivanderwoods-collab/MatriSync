import { referralFields, type ReferralFields } from "./referral-draft";

export type ReferralField = (typeof referralFields)[number];
export type SuppliedPassage = { text: string; suggested?: ReferralField };
const headings: Record<string, ReferralField> = {
  reason: "reason",
  "reason for referral": "reason",
  history: "history",
  "relevant history": "history",
  treatment: "treatment",
  "recorded treatment": "treatment",
  instructions: "instructions",
  "recorded instructions": "instructions",
};

// Placement uses explicit headings only, never interpretation of clinical words.
// Retain headings, negation, units and internal whitespace in every passage.
export function suppliedPassages(notes: string): SuppliedPassage[] {
  if (typeof notes !== "string" || !notes.trim() || notes.length > 16000)
    throw Error("Enter clinician-supplied text up to 16,000 characters.");
  const starts: { index: number; suggested?: ReferralField }[] = [];
  for (const match of notes.matchAll(/^[ \t]*([^\r\n:]{1,40}):/gm)) {
    const heading = match[1].trim().toLowerCase();
    const suggested = Object.hasOwn(headings, heading)
      ? headings[heading]
      : undefined;
    if (suggested) starts.push({ index: match.index, suggested });
  }
  if (!starts.length || starts[0].index > 0) starts.unshift({ index: 0 });
  const passages = starts
    .map((start, i) => ({
      text: notes
        .slice(start.index, starts[i + 1]?.index ?? notes.length)
        .trim(),
      ...(start.suggested ? { suggested: start.suggested } : {}),
    }))
    .filter((p) => p.text);
  if (passages.length > 32)
    throw Error("Organize up to 32 passages at a time.");
  if (
    passages.some(
      (p) => p.suggested && !p.text.slice(p.text.indexOf(":") + 1).trim(),
    )
  )
    throw Error(
      "A heading has no supplied text. Add the recorded facts or remove that empty heading.",
    );
  return passages;
}

export function placeSuppliedText(
  fields: ReferralFields,
  notes: string,
  source: string,
  date: string,
  placements: string[],
): ReferralFields {
  const passages = suppliedPassages(notes);
  if (
    typeof source !== "string" ||
    !source.trim() ||
    source.length > 200 ||
    Array.from(source).some((character) => character.charCodeAt(0) < 32)
  )
    throw Error("Enter a source label on one line, up to 200 characters.");
  if (
    date !== "" &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
      !Number.isFinite(Date.parse(date)) ||
      new Date(date).toISOString().slice(0, 10) !== date)
  )
    throw Error("Enter a valid source date or leave it unknown.");
  if (
    placements.length !== passages.length ||
    placements.some((field) => !referralFields.includes(field as ReferralField))
  )
    throw Error("Choose a field for every passage. Nothing has been added.");
  const next = { ...fields };
  for (const field of referralFields) {
    if (typeof next[field] !== "string" || next[field].length > 8000)
      throw Error("Each referral field supports up to 8,000 characters.");
  }
  for (const [index, passage] of passages.entries()) {
    const field = placements[index] as ReferralField;
    const attributed = `[Clinician-supplied source: ${source.trim()} · Date: ${date || "Not recorded"}]\n${passage.text}`;
    next[field] = next[field] ? `${next[field]}\n\n${attributed}` : attributed;
  }
  if (referralFields.some((field) => next[field].length > 8000))
    throw Error(
      "This would exceed an 8,000-character field. Nothing was truncated or added; revise the supplied text or its placement.",
    );
  return next;
}

export function documentationGaps(fields: ReferralFields): ReferralField[] {
  return referralFields.filter((field) => !fields[field].trim());
}
export function hasUnclearMarker(text: string) {
  return /\?|\b(?:unknown|unclear|not recorded)\b/i.test(text);
}
