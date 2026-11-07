import { careFactQuestion, type CareView } from "./care-model";
import { referralLabels } from "./referral-document";
export function careFactAnswer(question: string, view?: CareView) {
  const field = careFactQuestion(question);
  if (!field) return undefined;
  if (!view || view.snapshotOnly) return "Load your linked care profile first so I can read the saved details. I won't guess missing information.";
  const latest = [...view.entries].reverse().find(entry => entry.kind === "referral");
  const value = latest?.fields?.[field];
  if (!value) return `${referralLabels[field]}: Not recorded in the latest saved handoff. I won't fill in missing details. Your care team can add an updated entry.`;
  return `${referralLabels[field]}: ${value}\n\nRecorded by ${latest.actorName} (${latest.role}) at ${latest.serverAt || latest.recordedAt}. This is an exact saved entry, not an assessment of your current condition.`;
}
