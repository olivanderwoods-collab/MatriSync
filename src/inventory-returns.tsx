import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useRecords } from "./records";
import {
  returnConditions,
  type ReturnInput,
  type BandReturn,
  type InspectionInput,
} from "./inventory-returns-model";

const blankReturn = (): ReturnInput => ({
  reference: "",
  bandId: "",
  facility: "",
  date: "",
  notes: "",
});
export function InventoryReturns() {
  const { vault, refresh } = useRecords();
  const entries = vault!.data!.inventoryReturns || [];
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState(blankReturn);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await vault!.saveBandReturn(input);
      refresh();
      setAdding(false);
      setInput(blankReturn());
      setStatus(
        "Return record saved on this device. Reuse clearance and any refund remain separate.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save return.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Return Band</h2>
          {!adding && (
            <button
              className="button secondary"
              onClick={() => {
                setAdding(true);
                setError("");
                setStatus("");
              }}
            >
              Record return
            </button>
          )}
        </div>
        <p>
          Record receipt using the printed Band Inventory ID. Inspect the
          condition separately. Saved encrypted on this device; not synced
          between facilities.
        </p>
        <p>
          No clinical NFC data is read. An inspection does not certify secure
          erasure, hygiene or reuse clearance. Returned bands are not added to
          available stock.
        </p>
        {adding && (
          <form className="record-form" onSubmit={save}>
            {(
              [
                ["reference", "Return reference", 80],
                ["bandId", "Printed Band Inventory ID", 120],
                ["facility", "Receiving facility", 120],
                ["date", "Return date", 10],
              ] as const
            ).map(([key, label, max]) => (
              <label key={key}>
                {label}
                <input
                  required
                  type={key === "date" ? "date" : "text"}
                  maxLength={max}
                  value={input[key]}
                  onChange={(e) =>
                    setInput({ ...input, [key]: e.target.value })
                  }
                />
              </label>
            ))}
            <label>
              Administrative notes (optional)
              <textarea
                maxLength={1000}
                value={input.notes}
                onChange={(e) => setInput({ ...input, notes: e.target.value })}
              />
            </label>
            <p className="small">
              No patient details. One active return intake per printed band ID
              on this device; later issue/return cycles are not connected yet.
              References remain reserved even after a correction.
            </p>
            <div className="action-row">
              <button className="button primary" disabled={busy}>
                Save return record
              </button>
              <button
                type="button"
                className="button cancel"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  setInput(blankReturn());
                  setError("");
                }}
              >
                Cancel
              </button>
            </div>
          </form>
        )}
        {error && <p role="alert">{error}</p>}
        {status && <p role="status">{status}</p>}
      </section>
      <section className="panel" aria-label="Saved band returns">
        <h2>Saved returns</h2>
        {!entries.length ? (
          <p>No returns recorded yet.</p>
        ) : (
          [...entries]
            .reverse()
            .map((item) => <ReturnCard key={item.id} item={item} />)
        )}
      </section>
    </>
  );
}
function ReturnCard({ item }: { item: BandReturn }) {
  const { vault, refresh } = useRecords();
  const [action, setAction] = useState<"" | "inspect" | "void">("");
  const [condition, setCondition] =
    useState<InspectionInput["condition"]>("unassessed");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const latest = item.inspections.at(-1);
  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      if (action === "inspect")
        await vault!.inspectBandReturn(item.id, { condition, notes });
      else await vault!.voidBandReturn(item.id, notes);
      refresh();
      setAction("");
      setNotes("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this change.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="ledger-record">
      <h3>{item.reference}</h3>
      <p>
        <strong>
          {item.voided
            ? "Voided return record"
            : "Return recorded · Reuse not cleared"}
        </strong>
      </p>
      <dl className="record-details">
        <div>
          <dt>Band Inventory ID</dt>
          <dd>{item.bandId}</dd>
        </div>
        <div>
          <dt>Receiving facility</dt>
          <dd>{item.facility}</dd>
        </div>
        <div>
          <dt>Return date</dt>
          <dd>{item.date}</dd>
        </div>
        <div>
          <dt>Latest recorded condition</dt>
          <dd>{returnConditions[latest?.condition || "unassessed"]}</dd>
        </div>
      </dl>
      {item.notes && <p className="preserve-lines">{item.notes}</p>}
      {(latest?.condition === "damaged" ||
        latest?.condition === "defective") && (
        <p>
          Keep out of reuse. Replacement or retirement must be decided
          separately.
        </p>
      )}
      <details>
        <summary>Return and inspection history</summary>
        <p>
          Created {new Date(item.createdAt).toLocaleString()} · This account
        </p>
        {item.inspections.map((i) => (
          <p className="preserve-lines" key={i.id}>
            {returnConditions[i.condition]} · {new Date(i.at).toLocaleString()}{" "}
            · This account
            <br />
            {i.notes}
          </p>
        ))}
        {item.voided && (
          <p className="preserve-lines">
            Voided {new Date(item.voided.at).toLocaleString()} · This account
            <br />
            {item.voided.reason}
          </p>
        )}
      </details>
      {item.voided ? (
        <p>
          Original history retained. This correction does not move stock or
          reverse a refund.
        </p>
      ) : action ? (
        <form className="record-form" onSubmit={save}>
          {action === "inspect" && (
            <label>
              Observed condition
              <select
                value={condition}
                onChange={(e) =>
                  setCondition(e.target.value as InspectionInput["condition"])
                }
              >
                {Object.entries(returnConditions).map(([value, label]) => (
                  <option value={value} key={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {action === "inspect" ? "Inspection notes" : "Correction reason"}
            <textarea
              required
              maxLength={action === "inspect" ? 1000 : 500}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </label>
          <div className="action-row">
            <button
              className={`button ${action === "inspect" ? "primary" : "cancel"}`}
              disabled={busy}
            >
              {action === "inspect" ? "Save inspection" : "Confirm void return"}
            </button>
            <button
              className="button cancel"
              type="button"
              disabled={busy}
              onClick={() => {
                setAction("");
                setNotes("");
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      ) : (
        <div className="action-row">
          <button
            className="button secondary"
            onClick={() => setAction("inspect")}
          >
            Record inspection
          </button>
          <button className="button cancel" onClick={() => setAction("void")}>
            Void return record
          </button>
          <Link
            className="button secondary"
            to="/organization/inventory/refunds"
          >
            Refunds / Settlements
          </Link>
        </div>
      )}
    </article>
  );
}
