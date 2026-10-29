import {
  referralFields,
  validateReferralDrafts,
  type ReferralDraft,
} from "./referral-draft";

export const referralLabels = {
  reason: "Reason for referral",
  history: "Relevant history",
  treatment: "Recorded treatment",
  instructions: "Recorded instructions",
};

const escape = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character]!,
  );

// Standalone, inert document: only explicitly selected saved-version fields.
// No scripts, remote resources, full profile, credentials or attachment bytes.
export function referralDocumentHtml(draft: ReferralDraft, versionId: string) {
  validateReferralDrafts([draft]);
  const index = draft.versions.findIndex((version) => version.id === versionId);
  if (index < 0) throw Error("Choose a saved referral version first.");
  const version = draft.versions[index];
  const text = (value: string) => escape(value || "Not recorded");
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'">
<title>MatriSync referral draft</title>
<style>
@page { size: A4; margin: 18mm; @top-left { content: "MatriSync - Referral DRAFT"; font: 9px Arial, sans-serif; } @bottom-right { content: "Page " counter(page) " of " counter(pages); font: 9px Arial, sans-serif; } }
* { box-sizing: border-box; }
body { max-width: 800px; margin: 32px auto; padding: 0 24px; color: #142f29; background: white; font: 14px/1.45 Arial, sans-serif; }
header { border-bottom: 2px solid #16765e; padding-bottom: 12px; }
h1 { font-size: 26px; margin: 8px 0; }
h2 { font-size: 18px; margin: 20px 0 6px; break-after: avoid; }
p, li, dd { white-space: pre-wrap; overflow-wrap: anywhere; }
dt { font-weight: bold; } dd { margin: 0 0 6px; }
.identity { display: grid; grid-template-columns: 150px 1fr; gap: 0 12px; }
li { break-inside: avoid; margin-bottom: 10px; }
.status { font-weight: bold; color: #803f16; }
.identity, .sources, footer { font-size: 12px; }
footer { border-top: 1px solid #a9bdb6; margin-top: 24px; padding-top: 12px; break-inside: avoid; }
@media print {
  body { margin: 0; padding: 0; max-width: none; color: #000; }
  p { margin: 8px 0; }
  h2 { margin-top: 16px; }
  header { padding-bottom: 8px; }
  footer { margin-top: 16px; padding-top: 8px; }
}
</style></head><body>
<header><p>MatriSync</p><h1>Referral document · DRAFT</h1><p class="status">Not approved · Not sent</p><p>Version ${index + 1} · Saved ${text(version.savedAt)}</p></header>
<main><h2>${text(version.patient.name)}</h2><p>Date of birth: ${text(version.patient.birthDate)}</p>
<dl class="identity"><dt>${draft.receivedOrigin ? "Shared profile ID" : "Local patient ID"}</dt><dd>${text(draft.receivedOrigin?.profileId || draft.patientId)}</dd><dt>Referral ID</dt><dd>${text(draft.id)}</dd><dt>Version ID</dt><dd>${text(version.id)}</dd><dt>Prepared by account</dt><dd>${text(draft.authorUid)}</dd><dt>Patient details recorded</dt><dd>${text(version.patient.updatedAt)}</dd>
${draft.receivedOrigin ? `<dt>Source account</dt><dd>${text(draft.receivedOrigin.sourceUid)}</dd><dt>Source patient ID</dt><dd>${text(draft.receivedOrigin.sourcePatientId)}</dd><dt>Received profile revision</dt><dd>${text(draft.receivedOrigin.profileRevision)}</dd><dt>Received on device</dt><dd>${text(draft.receivedOrigin.receivedAt)}</dd>` : ""}</dl>
${referralFields.map((field) => `<section><h2>${referralLabels[field]}</h2><p>${text(version.fields[field])}</p></section>`).join("\n")}
<section class="sources"><h2>Original document references</h2>
${version.documents.length ? `<ol>${version.documents.map((document) => `<li>${text(document.name)}\nSource: ${text(document.source)}\nDocument date: ${text(document.reportDate)}\nDocument ID: ${text(document.id)}</li>`).join("\n")}</ol>` : "<p>None selected.</p>"}
<p>References only. Original files are not embedded or transmitted with this document.</p></section></main>
<footer>Draft for review. This copy is not clinical approval, facility initiation or proof of handoff. Blank optional fields remain unknown. This exported copy is outside the encrypted MatriSync vault.</footer>
</body></html>`;
}

export function printReferralDocument(html: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.title = "Referral print document";
    frame.setAttribute("aria-hidden", "true");
    frame.tabIndex = -1;
    frame.style.cssText =
      "position:fixed;left:-10000px;top:0;width:800px;height:1px;border:0";
    // The parent can invoke printing, but this document cannot run scripts.
    frame.setAttribute("sandbox", "allow-same-origin allow-modals");
    const loadTimeout = window.setTimeout(() => {
      frame.remove();
      reject(Error("The print document could not be opened. Try again."));
    }, 10000);
    frame.onload = () => {
      window.clearTimeout(loadTimeout);
      try {
        const target = frame.contentWindow;
        if (!target) throw Error("Printing is unavailable in this browser.");
        target.addEventListener("afterprint", () => frame.remove(), {
          once: true,
        });
        target.focus();
        target.print();
        // Browser print APIs do not confirm printing or whether a PDF was saved.
        resolve();
        window.setTimeout(() => frame.remove(), 60000);
      } catch (error) {
        frame.remove();
        reject(error);
      }
    };
    frame.srcdoc = html;
    document.body.append(frame);
  });
}

export function downloadReferralDocument(html: string) {
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = "MatriSync-referral-draft.html";
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
