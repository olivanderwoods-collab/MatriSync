import { lazy, Suspense, useState, type ReactNode } from "react";
import { sharingPilotEnabled } from "./sharing-config";
const PilotReview = sharingPilotEnabled
  ? lazy(() =>
      import("./referral-review").then((m) => ({ default: m.ReferralReview })),
    )
  : null;
import { useRecords } from "./records";
import { ReferralAssistance } from "./referral-assistance-panel";
import type { Patient } from "./records-model";
import {
  emptyReferralFields,
  allReferralFields as referralFields,
  missingReferralFields,
  handoffDetailFields,
  type ReferralDraft,
  type ReferralFields,
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
  return (
    <ReferralDraftEditor
      key={patient.id}
      drafts={drafts}
      originals={originals}
      review={
        PilotReview && vault
          ? (draft, versionId) => (
              <Suspense fallback={<p>Opening doctor review…</p>}>
                <PilotReview
                  key={`${draft.id}/${versionId}`}
                  uid={vault.uid}
                  draft={draft}
                  versionId={versionId}
                />
              </Suspense>
            )
          : undefined
      }
      save={async (fields, documents, id, version) => {
        if (!vault) throw Error("Open your records first.");
        const saved = await vault.saveReferralDraft(
          patient.id,
          fields,
          documents,
          id,
          version,
        );
        refresh();
        return vault.data!.referralDrafts!.find((d) => d.id === saved)!;
      }}
      getOriginal={async (reference) => {
        if (!vault) throw Error("Open your records first.");
        const { bytes, doc } = await vault.document(reference.id);
        if (doc.patientId !== patient.id)
          throw Error("This original is not available for this patient.");
        return { bytes, name: doc.name };
      }}
    />
  );
}
export type ReferralReference =
  ReferralDraft["versions"][number]["documents"][number];
export function ReferralDraftEditor({
  drafts,
  originals,
  save,
  getOriginal,
  available,
  sourceNotice,
  review,
}: {
  drafts: ReferralDraft[];
  originals: ReferralReference[];
  save: (
    fields: ReferralFields,
    documents: string[],
    id?: string,
    version?: string,
  ) => Promise<ReferralDraft>;
  getOriginal: (
    reference: ReferralReference,
  ) => Promise<{ bytes: Uint8Array<ArrayBuffer>; name: string }>;
  available?: (reference: ReferralReference) => boolean;
  sourceNotice?: ReactNode;
  review?: (draft: ReferralDraft, versionId: string) => ReactNode;
}) {
  const [draftId, setDraftId] = useState("");
  const [versionId, setVersionId] = useState("");
  const blankManual = () => ({ ...emptyReferralFields(), ...Object.fromEntries(handoffDetailFields.map(key => [key, ""])) });
  const [fields, setFields] = useState<ReferralFields>(blankManual);
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
    const reference = version?.documents.find((d) => d.id === id);
    if (busy || !reference) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      const { bytes, name } = await getOriginal(reference);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
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
    setFields({ ...blankManual(), ...latest?.fields });
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
        device.{" "}
        {review
          ? "Doctor review and sending to the Organization are separate actions."
          : "Approval and facility transfer are not connected yet."}
      </p>
      {sourceNotice}
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
            if (busy) return;
            setBusy(true);
            setError("");
            try {
              const saved = await save(
                fields,
                documentIds,
                draftId || undefined,
                versionId || undefined,
              );
              setDraftId(saved.id);
              setVersionId(saved.versions.at(-1)?.id || "");
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
          <aside className="notice" aria-label="Missing handoff details" aria-live="polite">
            {missingReferralFields(fields).length
              ? <><strong>Details not entered</strong><p>{missingReferralFields(fields).map(key => labels[key]).join("; ")}</p></>
              : <strong>Every listed field has an entry. This does not verify its clinical accuracy.</strong>}
            <p>Advisory only. You may save, approve and send with missing details. They remain “Not recorded”; the app will not fill them in.</p>
          </aside>
          {referralFields.map((key) => (
            <label key={key}>
              {labels[key]}{key === "reason" ? "" : " (optional)"}
              <textarea
                maxLength={8000}
                rows={3}
                value={fields[key] || ""}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            </label>
          ))}
          <p className="small">
            Enter recorded facts only, including units and measurement dates where known. All clinical fields are optional. Uploaded documents stay local; this handoff contains manually entered data and references only.
          </p>
          <ReferralAssistance fields={fields} onApply={setFields} disabled={busy} />
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
                {available &&
                  !available(d) &&
                  " · Original not received; reference only"}
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
              <h3>Referral document · {review ? "Saved version" : "DRAFT"}</h3>
              <p>
                {review
                  ? "Approval and delivery are recorded separately below"
                  : "Not approved · Not sent"}
              </p>
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
                <p>
                  {draft.receivedOrigin
                    ? "Shared profile ID"
                    : "Local patient ID"}
                  : {draft.patientId}
                </p>
                <p>Referral ID: {draft.id}</p>
                <p>Version ID: {version.id}</p>
                <p>Prepared by account: {draft.authorUid}</p>
                {draft.receivedOrigin && (
                  <>
                    <p>
                      Received profile version:{" "}
                      {draft.receivedOrigin.profileRevision}
                    </p>
                    <p>Source account: {draft.receivedOrigin.sourceUid}</p>
                    <p>
                      Source patient ID: {draft.receivedOrigin.sourcePatientId}
                    </p>
                    <p>
                      Received on:{" "}
                      {new Date(
                        draft.receivedOrigin.receivedAt,
                      ).toLocaleString()}
                    </p>
                  </>
                )}
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
                  {available && !available(d) ? (
                    <p>Original not received; reference only.</p>
                  ) : (
                    <button
                      className="button secondary"
                      disabled={busy}
                      onClick={() => void downloadOriginal(d.id)}
                      aria-label={`Download original ${d.name}`}
                    >
                      Download original
                    </button>
                  )}
                </div>
              ))}
              <p className="small">
                Document references do not embed or transmit the originals.
                Download an original to review it separately.
              </p>
            </article>
            {review?.(draft, version.id)}
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
