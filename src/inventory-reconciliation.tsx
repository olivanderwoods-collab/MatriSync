import { useState } from "react";
import { useRecords } from "./records";
import type { LedgerEntry } from "./inventory-ledger-model";
import {
  bandKey,
  returnRevision,
  type ReviewInput,
} from "./inventory-returns-model";

export function LedgerReconciliation({ entry }: { entry: LedgerEntry }) {
  const { vault, refresh } = useRecords();
  const returns = vault!.data!.inventoryReturns || [];
  const candidates = returns.filter(
    (item) => !item.voided && bandKey(item.bandId) === bandKey(entry.bandId),
  );
  const related = (vault!.data!.inventoryLedger || []).filter(
    (other) =>
      other.id !== entry.id &&
      !other.voided &&
      other.kind === entry.kind &&
      bandKey(other.bandId) === bandKey(entry.bandId),
  );
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = entry.reviews?.at(-1);
  const currentReturn = returns.find((item) => item.id === latest?.returnId);
  const stale =
    latest &&
    (!currentReturn ||
      currentReturn.voided ||
      returnRevision(currentReturn) !== latest.returnRevision);
  return (
    <>
      {latest && (
        <p>
          <strong>
            {stale
              ? "Linked return changed or was voided. Review again."
              : latest.outcome === "consistent"
                ? "Local check: return details consistent"
                : "Local check: discrepancy recorded"}
          </strong>
          <br />
          Payment remains unconfirmed.
        </p>
      )}
      {!!entry.reviews?.length && (
        <details>
          <summary>Reconciliation note history</summary>
          {entry.reviews.map((review) => (
            <p className="preserve-lines" key={review.id}>
              {review.outcome === "consistent"
                ? "Return details consistent"
                : "Discrepancy recorded"}{" "}
              · {new Date(review.at).toLocaleString()} · This account
              <br />
              Return:{" "}
              {returns.find((item) => item.id === review.returnId)?.reference ||
                review.returnId}
              <br />
              Evidence reference: {review.evidence}
              <br />
              {review.notes}
            </p>
          ))}
        </details>
      )}
      {!entry.voided &&
        entry.kind !== "deposit" &&
        (open ? (
          <form
            className="record-form"
            onSubmit={async (e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              setBusy(true);
              setError("");
              try {
                await vault!.reviewLedgerEntry(entry.id, {
                  returnId: String(data.get("returnId")),
                  outcome: String(
                    data.get("outcome"),
                  ) as ReviewInput["outcome"],
                  evidence: String(data.get("evidence")),
                  notes: String(data.get("notes")),
                });
                refresh();
                setOpen(false);
              } catch (e) {
                setError(
                  e instanceof Error ? e.message : "Unable to record review.",
                );
              } finally {
                setBusy(false);
              }
            }}
          >
            <p>
              Compare the return and your administrative evidence. This local
              note neither approves a refund nor confirms payment, reimbursement
              or a verified facility.
            </p>
            {!!related.length && (
              <p role="note">
                Check possible duplicate entries for this band:{" "}
                {related.map((other) => other.reference).join(", ")}. Entries
                under different references are not automatically reconciled.
              </p>
            )}
            <label>
              Linked return
              <select name="returnId" required defaultValue="">
                <option value="">Select a return</option>
                {candidates.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.reference} · {item.facility} · {item.date}
                  </option>
                ))}
              </select>
            </label>
            {!candidates.length && (
              <p>
                No active return matches this printed band ID. Record the return
                first.
              </p>
            )}
            <label>
              Local review outcome
              <select name="outcome">
                <option value="discrepancy">Discrepancy recorded</option>
                <option value="consistent">Return details consistent</option>
              </select>
            </label>
            <label>
              Administrative evidence reference
              <input name="evidence" required maxLength={200} />
            </label>
            <label>
              Review notes
              <textarea name="notes" required maxLength={1000} />
            </label>
            <div className="action-row">
              <button
                className="button primary"
                disabled={busy || !candidates.length}
              >
                Save reconciliation note
              </button>
              <button
                type="button"
                className="button cancel"
                disabled={busy}
                onClick={() => {
                  setOpen(false);
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
            {error && <p role="alert">{error}</p>}
          </form>
        ) : (
          <button className="button secondary" onClick={() => setOpen(true)}>
            Review against return
          </button>
        ))}
    </>
  );
}
