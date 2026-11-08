import type { Patient, LocalDocument } from "./records-model";
const escape = (value: unknown) => String(value ?? "Not recorded").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
export function patientSummary(patient: Patient, documents: LocalDocument[], createdAt: string) {
  const p = patient.profile;
  const field = (label: string, value: unknown) => `<dt>${escape(label)}</dt><dd>${escape(value === "" || value === undefined ? "Not recorded" : value)}</dd>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>MatriSync personal care summary</title><style>
@page { size: A4; margin: 18mm; @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px Arial; } }
body { font: 14px/1.5 Arial,sans-serif; color: #173d31; max-width: 780px; margin: 28px auto; padding: 0 20px; }
header { border-bottom: 2px solid #168263; } h1 { font-size: 27px; } h2 { font-size: 18px; margin-top: 22px; break-after: avoid; }
dl { display:grid; grid-template-columns: 170px 1fr; gap: 5px 16px; } dt { font-weight:bold; } dd { margin:0; } p,dd,li { white-space:pre-wrap; overflow-wrap:anywhere; }
li { margin-bottom: 12px; break-inside:avoid; } footer { border-top:1px solid #adc7bc; margin-top:24px; padding-top:12px; font-size:12px; }
@media print { body { margin:0; padding:0; color:#000; } }
</style></head><body><header><p>MatriSync</p><h1>Personal care summary</h1><p>Patient-supplied information for review · Not a prescription or approved referral</p></header>
<main><h2>${escape(patient.name)}</h2><dl>${field("Date of birth", patient.birthDate)}${field("Recorded pregnancy week", p?.pregnancyWeeks)}${field("Stage recorded on", p?.recordedOn)}${field("Blood group (recorded)", p?.bloodGroup)}${field("Allergies (recorded)", p?.allergies)}${field("Emergency contact", p?.emergencyContact)}${field("Emergency phone", p?.emergencyPhone)}${field("Profile last updated", patient.updatedAt)}</dl>
<h2>Uploaded original documents</h2>${documents.length ? `<ol>${documents.filter(d => d.patientId === patient.id).map(d => `<li><strong>${escape(d.name)}</strong>\nType: ${escape(d.kind)} · Date: ${escape(d.reportDate || "Not recorded")}\nRecorded source: ${escape(d.source || "Not recorded")}\nUploaded: ${escape(d.addedAt)} · Unverified uploaded copy</li>`).join("")}</ol>` : "<p>No original documents recorded.</p>"}
<p>Original files are listed, not embedded. Refer to the original files and the separately approved referral for clinical details.</p></main>
<footer>Generated ${escape(createdAt)}. Unknown fields stay unknown. Recorded pregnancy stage is dated information, not a new assessment. This exported copy is outside encrypted app storage. Permanent access codes and private keys are excluded.</footer></body></html>`;
}
