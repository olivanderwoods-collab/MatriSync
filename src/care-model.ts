import { allReferralFields, referralInput, type ReferralFields } from "./referral-draft";
import { motherProfileInput, type MotherProfile } from "./records-model";
export const careEnabled = import.meta.env.VITE_CARE_ENABLED === "1";
export type CareRole = "doctor" | "nurse" | "lab";
export const contributionKinds = {
  doctor: ["clinical-note", "prescription", "referral"],
  nurse: ["observation", "administration"],
  lab: ["laboratory"],
} as const;
export type ContributionKind = (typeof contributionKinds)[CareRole][number];
export type CareProfile = { name: string; birthDate: string; sourceLocalId: string; sourceUid: string; details?: MotherProfile; history?: string };
export type CareEntry = { id: string; kind: ContributionKind; actorUid: string; actorName: string; role: CareRole; recordedAt: string; serverAt: string; text: string; fields?: ReferralFields };
export type CareView = { id: string; key: string; profile: CareProfile; entries: CareEntry[]; verified: boolean; snapshotOnly: boolean; receivedAt: string; handoffId?: string; motherUid?: string };
export function checkCareProfile(p: CareProfile) {
  if (!p || typeof p.name !== "string" || !p.name.trim() || p.name.length > 120 || typeof p.birthDate !== "string" || p.birthDate.length > 10 || typeof p.sourceLocalId !== "string" || p.sourceLocalId.length > 200 || typeof p.sourceUid !== "string" || p.sourceUid.length > 128) throw Error("Invalid patient identity.");
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(p.sourceLocalId) || !/^[A-Za-z0-9_-]{1,128}$/.test(p.sourceUid) || (p.birthDate && (!/^\d{4}-\d{2}-\d{2}$/.test(p.birthDate) || !Number.isFinite(Date.parse(p.birthDate)) || new Date(p.birthDate).toISOString().slice(0,10) !== p.birthDate))) throw Error("Invalid patient identity or birth date.");
  if (p.history !== undefined && (typeof p.history !== "string" || p.history.length > 8000)) throw Error("Invalid profile notes.");
  return { name: p.name, birthDate: p.birthDate, sourceLocalId: p.sourceLocalId, sourceUid: p.sourceUid, ...(p.details ? { details: motherProfileInput(p.details) } : {}), ...(p.history !== undefined ? { history: p.history } : {}) };
}
export function checkContribution(role: CareRole, kind: string, text: string, fields?: ReferralFields) {
  if (!(contributionKinds[role] as readonly string[] | undefined)?.includes(kind)) throw Error("Your assigned role cannot make this type of contribution.");
  if (typeof text !== "string" || text.length > 8000 || (!text.trim() && kind !== "referral")) throw Error("Enter a contribution of up to 8,000 characters.");
  if (kind === "referral") referralInput(fields!);
}
export function careFactQuestion(input: string): (typeof allReferralFields)[number] | undefined {
  const q = input.trim().toLowerCase().replace(/[?.!]+$/, "");
  if (!/^(?:what (?:is|are|was|were)|show|read|tell me) (?:my |the |me my )?(?:recorded |saved )?/.test(q)) return;
  const labels: Record<string, (typeof allReferralFields)[number]> = { "blood group": "bloodGroup", "allergies": "allergies", "allergy details": "allergies", "blood pressure": "bloodPressure", "bp": "bloodPressure", "blood sugar": "bloodSugar", "usg results": "usg", "usg findings": "usg", "drugs given": "drugsGiven", "referral reason": "reason", "remarks": "remarks", "pregnancy stage": "pregnancyStage" };
  const tail = q.replace(/^(?:what (?:is|are|was|were)|show|read|tell me) (?:my |the |me my )?(?:recorded |saved )?/, "");
  return labels[tail];
}
