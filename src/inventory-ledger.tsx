import { useState, type FormEvent } from "react";
import { NavLink } from "react-router-dom";
import { useRecords, VaultGate } from "./records";
import { inventorySections } from "./workspace-spec";
import { InventoryReturns } from "./inventory-returns";
import { LedgerReconciliation } from "./inventory-reconciliation";
import {
  ledgerKinds,
  ledgerCurrencies,
  type LedgerInput,
  type LedgerEntry,
} from "./inventory-ledger-model";

export function InventoryLedger({
  showReturns = false,
}: {
  showReturns?: boolean;
}) {
  return (
    <>
      <h1>Inventory</h1>
      <nav className="tabs" aria-label="Inventory sections">
        {inventorySections.map((section) => (
          <NavLink
            key={section.id}
            to={`/organization/inventory/${section.id}`}
          >
            {section.title}
          </NavLink>
        ))}
      </nav>
      <VaultGate>
        {showReturns ? <InventoryReturns /> : <LedgerContent />}
      </VaultGate>
    </>
  );
}
const emptyInput = (): LedgerInput => ({
  kind: "refund",
  reference: "",
  bandId: "",
  facility: "",
  currency: "INR",
  amount: "",
  date: "",
  notes: "",
});
function LedgerContent() {
  const { vault, refresh } = useRecords();
  const entries = vault!.data!.inventoryLedger || [];
  const [adding, setAdding] = useState(false);
  const [input, setInput] = useState(emptyInput);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState("all");
  function update(key: keyof LedgerInput, value: string) {
    setInput({ ...input, [key]: value });
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await vault!.saveLedgerEntry(input);
      refresh();
      setInput(emptyInput());
      setAdding(false);
      setFilter("all");
      setStatus(
        "Pending record saved on this device. Payment has not been confirmed.",
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to save this record.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <section className="panel">
        <div className="panel-heading">
          <h2>Refunds / Settlements</h2>
          {!adding && (
            <button
              className="button secondary"
              onClick={() => {
                setAdding(true);
                setStatus("");
                setError("");
              }}
            >
              Add pending record
            </button>
          )}
        </div>
        <p>
          Record band deposits, refunds and settlement amounts for later
          reconciliation. Saving here does not transfer money or confirm
          payment.
        </p>
        <p className="small">
          Saved encrypted on this device. Records are not synced between
          facilities. Use the printed Band Inventory ID, never clinical NFC data
          or patient details.
        </p>
        {adding && (
          <form className="record-form" onSubmit={save}>
            <label>
              Record type
              <select
                value={input.kind}
                onChange={(e) => update("kind", e.target.value)}
              >
                {Object.entries(ledgerKinds).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Record reference
              <input
                required
                maxLength={80}
                value={input.reference}
                onChange={(e) => update("reference", e.target.value)}
              />
            </label>
            <p className="small">
              Use a unique reference for this entry. Duplicate references are
              blocked on this device, including voided entries.
            </p>
            <label>
              Printed Band Inventory ID
              <input
                required
                maxLength={120}
                value={input.bandId}
                onChange={(e) => update("bandId", e.target.value)}
              />
            </label>
            <label>
              Facility name / reference
              <input
                required
                maxLength={120}
                value={input.facility}
                onChange={(e) => update("facility", e.target.value)}
              />
            </label>
            <label>
              Currency
              <select
                value={input.currency}
                onChange={(e) => update("currency", e.target.value)}
              >
                {ledgerCurrencies.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                required
                inputMode="decimal"
                maxLength={12}
                value={input.amount}
                onChange={(e) => update("amount", e.target.value)}
              />
            </label>
            <label>
              Record date
              <input
                required
                type="date"
                value={input.date}
                onChange={(e) => update("date", e.target.value)}
              />
            </label>
            <label>
              Administrative notes (optional)
              <textarea
                rows={3}
                maxLength={1000}
                value={input.notes}
                onChange={(e) => update("notes", e.target.value)}
              />
            </label>
            <div className="action-row">
              <button className="button primary" disabled={busy}>
                {busy ? "Saving…" : "Save pending record"}
              </button>
              <button
                type="button"
                className="button cancel"
                disabled={busy}
                onClick={() => {
                  setAdding(false);
                  setInput(emptyInput());
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
      <section className="panel" aria-label="Saved inventory records">
        <h2>Saved records</h2>
        <label>
          Show records
          <select value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="all">All types</option>
            {Object.entries(ledgerKinds).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        {!entries.length ? (
          <p>No inventory records saved yet.</p>
        ) : (
          <>
            {!entries.some((e) => filter === "all" || e.kind === filter) && (
              <p>No records of this type.</p>
            )}
            {[...entries]
              .reverse()
              .filter((e) => filter === "all" || e.kind === filter)
              .map((entry) => (
                <LedgerRecord key={entry.id} entry={entry} />
              ))}
          </>
        )}
      </section>
    </>
  );
}
function LedgerRecord({ entry }: { entry: LedgerEntry }) {
  const { vault, refresh } = useRecords();
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return (
    <article className="ledger-record">
      <h3>
        {ledgerKinds[entry.kind]} · {entry.reference}
      </h3>
      <p>
        <strong>
          {entry.voided ? "Voided record" : "Pending reconciliation"}
        </strong>{" "}
        ·{" "}
        {new Intl.NumberFormat(undefined, {
          style: "currency",
          currency: entry.currency,
        }).format(entry.amountMinor / 100)}
      </p>
      <dl className="record-details">
        <div>
          <dt>Band Inventory ID</dt>
          <dd>{entry.bandId}</dd>
        </div>
        <div>
          <dt>Facility</dt>
          <dd>{entry.facility}</dd>
        </div>
        <div>
          <dt>Record date</dt>
          <dd>{entry.date}</dd>
        </div>
      </dl>
      {entry.notes && <p className="preserve-lines">{entry.notes}</p>}
      <LedgerReconciliation entry={entry} />
      <details>
        <summary>Record history</summary>
        <p>
          Created {new Date(entry.createdAt).toLocaleString()} · This account
        </p>
        {entry.voided && (
          <p className="preserve-lines">
            Voided {new Date(entry.voided.at).toLocaleString()} · This account
            <br />
            Reason: {entry.voided.reason}
          </p>
        )}
      </details>
      {entry.voided ? (
        <p className="small">
          Original entry retained. Voiding a record does not reverse a payment.
        </p>
      ) : !correcting ? (
        <button className="button cancel" onClick={() => setCorrecting(true)}>
          Void pending record
        </button>
      ) : (
        <form
          className="record-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await vault!.voidLedgerEntry(entry.id, reason);
              refresh();
              setCorrecting(false);
            } catch (e) {
              setError(
                e instanceof Error ? e.message : "Unable to void this record.",
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Keep the original entry and explain the correction. Add any
            replacement as a new record with a unique reference.
          </p>
          <label>
            Correction reason
            <textarea
              required
              maxLength={500}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <div className="action-row">
            <button className="button cancel" disabled={busy}>
              Confirm void
            </button>
            <button
              type="button"
              className="button cancel"
              disabled={busy}
              onClick={() => {
                setCorrecting(false);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
          {error && <p role="alert">{error}</p>}
        </form>
      )}
    </article>
  );
}
