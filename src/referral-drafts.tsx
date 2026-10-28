import { useState } from "react";
import { useRecords } from "./records";
import type { Patient } from "./records-model";
import {
  emptyReferralFields,
  referralFields,
  type ReferralDraft,
} from "./referral-draft";
import {
  referralLabels as labels,
  referralDocumentHtml,
  downloadReferralDocument,
  printReferralDocument,
} from "./referral-document";
export function ReferralDrafts({ patient }: { patient: Patient }) {
  const { vault, refresh } = useRecords();
  const drafts =
    vault?.data?.referralDrafts?.filter((d) => d.patientId === patient.id) ||
    [];
  const originals =
    vault?.data?.documents.filter((d) => d.patientId === patient.id) || [];
  const [draftId, setDraftId] = useState("");
  const [versionId, setVersionId] = useState("");
  const [fields, setFields] = useState(emptyReferralFields);
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const draft = drafts.find((d) => d.id === draftId);
  const version = draft?.versions.find((v) => v.id === versionId);
  async function exportDraft(print: boolean) {
    if (!draft || !version || busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const html = referralDocumentHtml(draft, version.id);
      if (print) await printReferralDocument(html);
      else downloadReferralDocument(html);
      setNotice(
        print
          ? "Print requested. Choose your printer or Save as PDF in the print dialog. The app cannot confirm whether you saved or printed it."
          : "Draft copy requested. Exported copies are outside the encrypted vault.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to export this draft.");
    } finally {
      setBusy(false);
    }
  }
  async function downloadOriginal(id: string) {
    if (!vault || busy || !version?.documents.some((d) => d.id === id)) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { bytes, doc } = await vault.document(id);
      if (doc.patientId !== patient.id)
        throw Error("This original is not available for this patient.");
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = doc.name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice(
        "Original copy requested. Downloaded copies are outside the encrypted vault.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to retrieve this original.",
      );
    } finally {
      setBusy(false);
    }
  }
  function edit(item?: ReferralDraft) {
    const latest = item?.versions.at(-1);
    setDraftId(item?.id || "");
    setVersionId(latest?.id || "");
    setFields(latest?.fields || emptyReferralFields());
    setDocumentIds(latest?.documents.map((d) => d.id) || []);
    setEditing(true);
    setNotice("");
    setError("");
  }
  return (
    <section className="panel referral-workspace">
      <h2>Referral drafts</h2>
      <p>
        Prepare the recorded facts for clinical review. Drafts stay on this
        device; approval and facility transfer are not connected yet.
      </p>
      {!editing && (
        <button
          className="button secondary"
          disabled={busy}
          onClick={() => edit()}
        >
          New referral draft
        </button>
      )}
      {!editing && drafts.length > 0 && (
        <label>
          Saved referral draft
          <select
            disabled={busy}
            value={draftId}
            onChange={(e) => {
              const d = drafts.find((item) => item.id === e.target.value);
              setDraftId(d?.id || "");
              setVersionId(d?.versions.at(-1)?.id || "");
              setError("");
              setNotice("");
            }}
          >
            <option value="">Choose a draft</option>
            {drafts.map((d, i) => (
              <option key={d.id} value={d.id}>
                Draft {i + 1} · {d.versions.length} version(s)
              </option>
            ))}
          </select>
        </label>
      )}
      {editing ? (
        <form
          className="record-form"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!vault || busy) return;
            setBusy(true);
            setError("");
            try {
              const id = await vault.saveReferralDraft(
                patient.id,
                fields,
                documentIds,
                draftId || undefined,
                versionId || undefined,
              );
              refresh();
              setDraftId(id);
              setVersionId(
                vault.data?.referralDrafts
                  ?.find((d) => d.id === id)
                  ?.versions.at(-1)?.id || "",
              );
              setEditing(false);
              setNotice(
                "Draft version saved encrypted on this device. Not approved or sent.",
              );
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to save draft.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          {referralFields.map((key) => (
            <label key={key}>
              {labels[key]}
              {key !== "reason" && " (optional)"}
              <textarea
                required={key === "reason"}
                maxLength={8000}
                rows={4}
                value={fields[key]}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <p className="small">
            Only enter facts already recorded by the clinician. Blank optional
            fields remain “Not recorded”.
          </p>
          <fieldset>
            <legend>Relevant original documents</legend>
            {!originals.length && (
              <p>No original documents saved for this patient.</p>
            )}
            {originals.map((d) => (
              <label className="check-row" key={d.id}>
                <input
                  type="checkbox"
                  checked={documentIds.includes(d.id)}
                  onChange={(e) =>
                    setDocumentIds(
                      e.target.checked
                        ? [...documentIds, d.id]
                        : documentIds.filter((id) => id !== d.id),
                    )
                  }
                />
                {d.name} · {d.source || "Source not recorded"}
              </label>
            ))}
          </fieldset>
          <div className="action-row">
            <button className="button" disabled={busy}>
              {busy ? "Saving…" : "Save draft version"}
            </button>
            <button
              type="button"
              className="button cancel"
              disabled={busy}
              onClick={() => setEditing(false)}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        version &&
        draft && (
          <>
            <label>
              Referral version
              <select
                disabled={busy}
                value={versionId}
                onChange={(e) => {
                  setVersionId(e.target.value);
                  setNotice("");
                  setError("");
                }}
              >
                {draft.versions.map((v, i) => (
                  <option key={v.id} value={v.id}>
                    Version {i + 1} · {new Date(v.savedAt).toLocaleString()}
                  </option>
                ))}
              </select>
            </label>
            <article
              className="referral-document"
              aria-label="Referral draft preview"
            >
              <h3>Referral document · DRAFT</h3>
              <p>Not approved · Not sent</p>
              <p className="small">
                Version{" "}
                {draft.versions.findIndex((v) => v.id === version.id) + 1} ·
                Saved {new Date(version.savedAt).toLocaleString()}
              </p>
              <h4>{version.patient.name}</h4>
              <p>
                Date of birth: {version.patient.birthDate || "Not recorded"}
              </p>
              <p className="small">
                Patient details recorded{" "}
                {new Date(version.patient.updatedAt).toLocaleString()}.
              </p>
              <details className="record-id">
                <summary>Document identifiers</summary>
                <p>Local patient ID: {draft.patientId}</p>
                <p>Referral ID: {draft.id}</p>
                <p>Version ID: {version.id}</p>
                <p>Prepared by account: {draft.authorUid}</p>
              </details>
              {referralFields.map((key) => (
                <div key={key}>
                  <h4>{labels[key]}</h4>
                  <p className="preserve-lines">
                    {version.fields[key] || "Not recorded"}
                  </p>
                </div>
              ))}
              <h4>Original document references</h4>
              {!version.documents.length && <p>None selected.</p>}
              {version.documents.map((d) => (
                <div key={d.id} className="local-document">
                  <p>
                    {d.name} · {d.source || "Source not recorded"} ·{" "}
                    {d.reportDate || "Date not recorded"}
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => void downloadOriginal(d.id)}
                    aria-label={`Download original ${d.name}`}
                  >
                    Download original
                  </button>
                </div>
              ))}
              <p className="small">
                Document references do not embed or transmit the originals.
                Download an original to review it separately.
              </p>
            </article>
            <div className="action-row">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => edit(draft)}
              >
                Edit latest draft
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void exportDraft(true)}
              >
                Print / Save as PDF
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() => void exportDraft(false)}
              >
                Download draft copy
              </button>
            </div>
            <p className="small">
              Print and downloaded copies contain private patient details and
              are outside the encrypted vault. They remain marked as drafts.
            </p>
          </>
        )
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
