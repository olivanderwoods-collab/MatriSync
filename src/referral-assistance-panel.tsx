import { useState } from "react";
import { referralFields, type ReferralFields } from "./referral-draft";
import { referralLabels } from "./referral-document";
import {
  suppliedPassages,
  placeSuppliedText,
  documentationGaps,
  hasUnclearMarker,
  type SuppliedPassage,
} from "./referral-assistance";

export function ReferralAssistance({
  fields,
  onApply,
  disabled,
}: {
  fields: ReferralFields;
  onApply: (fields: ReferralFields) => void;
  disabled: boolean;
}) {
  const [notes, setNotes] = useState(""),
    [source, setSource] = useState(""),
    [date, setDate] = useState("");
  const [prepared, setPrepared] = useState<{
    notes: string;
    source: string;
    date: string;
    fields: string;
    passages: SuppliedPassage[];
  }>();
  const [placements, setPlacements] = useState<string[]>([]),
    [reviewed, setReviewed] = useState(false);
  const [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const current =
    prepared &&
    prepared.notes === notes &&
    prepared.source === source &&
    prepared.date === date &&
    prepared.fields === JSON.stringify(fields);
  let preview: ReferralFields | undefined,
    placementError = "";
  if (current) {
    try {
      preview = placeSuppliedText(fields, notes, source, date, placements);
    } catch (e) {
      placementError =
        e instanceof Error ? e.message : "Review the supplied text.";
    }
  }
  return (
    <section
      className="notice referral-assistance"
      aria-label="Clinician documentation assistance"
    >
      <h3>Documentation assistance</h3>
      <p>
        Organize text supplied by the clinician. Placement follows explicit
        headings; wording is copied without interpretation. This is a local text
        organizer, not AI-generated clinical advice.
      </p>
      <p>
        Original files are not read here. Source labels and dates are supplied
        by you, not independently verified. Missing optional information does
        not block saving a referral.
      </p>
      <details>
        <summary>Organize supplied notes</summary>
        <label>
          Source label
          <input
            value={source}
            maxLength={200}
            disabled={disabled}
            onChange={(e) => {
              setSource(e.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <label>
          Source date (optional)
          <input
            type="date"
            value={date}
            disabled={disabled}
            onChange={(e) => {
              setDate(e.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <label>
          Clinician-supplied notes
          <textarea
            value={notes}
            rows={6}
            maxLength={16000}
            disabled={disabled}
            onChange={(e) => {
              setNotes(e.target.value);
              setReviewed(false);
            }}
          />
        </label>
        <p className="small">
          Optional headings: Reason, History, Treatment, Instructions. Text
          without these headings needs your choice of field. Uncertainty and
          units stay as supplied.
        </p>
        <button
          type="button"
          className="button secondary"
          disabled={disabled}
          onClick={() => {
            setError("");
            setNotice("");
            setReviewed(false);
            try {
              const passages = suppliedPassages(notes);
              setPrepared({
                notes,
                source,
                date,
                fields: JSON.stringify(fields),
                passages,
              });
              setPlacements(passages.map((p) => p.suggested || ""));
            } catch (e) {
              setPrepared(undefined);
              setError(
                e instanceof Error ? e.message : "Unable to organize text.",
              );
            }
          }}
        >
          Organize text for review
        </button>
        {prepared && !current && (
          <p role="status">
            The draft or source changed. Organize again before applying.
          </p>
        )}
        {current && (
          <>
            {prepared.passages.map((passage, i) => (
              <div key={i} className="local-document">
                <h4>Passage {i + 1}</h4>
                <p className="preserve-lines">{passage.text}</p>
                {hasUnclearMarker(passage.text) && (
                  <p>
                    Contains an explicit uncertainty marker. Confirm its
                    meaning; the organizer will not resolve it.
                  </p>
                )}
                <label>
                  Place passage {i + 1} in
                  <select
                    value={placements[i]}
                    disabled={disabled}
                    onChange={(e) => {
                      setPlacements((old) =>
                        old.map((field, index) =>
                          index === i ? e.target.value : field,
                        ),
                      );
                      setReviewed(false);
                    }}
                  >
                    <option value="">Choose a field</option>
                    {referralFields.map((field) => (
                      <option key={field} value={field}>
                        {referralLabels[field]}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ))}
            {placementError && <p role="status">{placementError}</p>}
            {preview && (
              <section aria-label="Proposed referral fields">
                <h4>Proposed fields · Not applied</h4>
                {referralFields.map((field) => (
                  <div key={field}>
                    <strong>{referralLabels[field]}</strong>
                    <p className="preserve-lines">
                      {preview[field] || "Not recorded"}
                    </p>
                  </div>
                ))}
                <label className="check-row">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    disabled={disabled}
                    onChange={(e) => setReviewed(e.target.checked)}
                  />
                  I reviewed every passage, its source and its placement.
                </label>
                <button
                  type="button"
                  className="button secondary"
                  disabled={disabled || !reviewed}
                  onClick={() => {
                    if (!current || !reviewed) return;
                    try {
                      onApply(
                        placeSuppliedText(
                          fields,
                          notes,
                          source,
                          date,
                          placements,
                        ),
                      );
                      setPrepared(undefined);
                      setReviewed(false);
                      setError("");
                      setNotice(
                        "Text added to the editable draft. Review and save a version separately; nothing was approved or sent.",
                      );
                    } catch (e) {
                      setError(
                        e instanceof Error ? e.message : "Nothing was added.",
                      );
                    }
                  }}
                >
                  Add reviewed text to draft
                </button>
              </section>
            )}
          </>
        )}
      </details>
      {documentationGaps(fields).length > 0 && (
        <p>
          Not recorded:{" "}
          {documentationGaps(fields)
            .map((field) => referralLabels[field])
            .join(", ")}
          . This checks empty fields only, not clinical completeness.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
