import type { FormEvent } from "react";
import {
  actorNames,
  hasTestAccess,
  type Actor,
  type Command,
  type TestState,
} from "./workflow-test-model";

export function VerificationTests({
  state,
  actor,
  act,
}: {
  state: TestState;
  actor: Actor;
  act: (command: Command) => boolean;
}) {
  const reviewer = actor === "organization" || actor === "unverified-facility";
  const credentials = state.credentials.filter(
    (c) => reviewer || c.clinician === actor,
  );
  if (!credentials.length) return null;
  function submit(
    e: FormEvent<HTMLFormElement>,
    command: (data: FormData) => Command,
  ) {
    e.preventDefault();
    if (act(command(new FormData(e.currentTarget)))) e.currentTarget.reset();
  }
  return (
    <section className="panel" aria-label="Facility credential test">
      <h2>Facility credential review · Synthetic test</h2>
      <p>
        Test Facility is a pre-verified fictional approver. Test Doctor, Nurse
        and ANM start approved. The Unverified Test Clinician is a caregiver
        applicant. No real credentials are verified here.
      </p>
      <p>
        Facility verification, real credential evidence and reinstatement remain
        pending. Use fictional references only.
      </p>
      {credentials.map((c) => (
        <article
          className="ledger-record"
          key={c.clinician}
          aria-label={actorNames[c.clinician]}
        >
          <h3>{actorNames[c.clinician]}</h3>
          <p>
            Credential category:{" "}
            {c.category === "doctor"
              ? "Doctor"
              : "Caregiver · No digital prescriptions"}
          </p>
          <p>
            Credential status: <strong>{c.status}</strong>
          </p>
          {c.evidence && <p>Fictional evidence reference: {c.evidence}</p>}
          {!reviewer &&
            (c.status === "unsubmitted" || c.status === "rejected") && (
              <form
                className="record-form"
                onSubmit={(e) =>
                  submit(e, (d) => ({
                    type: "submit-credentials",
                    evidence: String(d.get("evidence")),
                  }))
                }
              >
                <label>
                  Fictional credential reference
                  <input name="evidence" required maxLength={200} />
                </label>
                <button className="button primary">
                  Submit test credentials
                </button>
              </form>
            )}
          {reviewer && (c.status === "pending" || c.status === "approved") && (
            <form
              className="record-form"
              onSubmit={(e) =>
                submit(e, (d) => ({
                  type: "review-credentials",
                  clinician: c.clinician,
                  decision: String(d.get("decision")) as
                    | "approved"
                    | "rejected"
                    | "suspended",
                  reason: String(d.get("reason")),
                }))
              }
            >
              <label>
                Review decision
                <select name="decision">
                  {c.status === "approved" ? (
                    <option value="suspended">Suspend verification</option>
                  ) : (
                    <>
                      <option value="approved">Approve credentials</option>
                      <option value="rejected">Reject credentials</option>
                    </>
                  )}
                </select>
              </label>
              <label>
                Review reason
                <textarea name="reason" required maxLength={500} />
              </label>
              <button className="button secondary">Record test decision</button>
            </form>
          )}
          <details>
            <summary>Credential decision history</summary>
            {c.history.length ? (
              c.history.map((h, i) => (
                <p key={i}>
                  {h.action} · {actorNames[h.actor as Actor]} · {h.at}
                  <br />
                  {h.reason}
                </p>
              ))
            ) : (
              <p>No decisions yet.</p>
            )}
          </details>
        </article>
      ))}
    </section>
  );
}

export function SavedTestCopies({
  state,
  actor,
  act,
}: {
  state: TestState;
  actor: Actor;
  act: (command: Command) => boolean;
}) {
  const copies = state.savedCopies.filter((c) => c.actor === actor);
  if (!copies.length) return null;
  return (
    <section className="panel" aria-label="Saved test copies">
      <h2>Previously saved test records</h2>
      <p>
        This memory-only snapshot simulates a downloaded copy. Reload clears it.
        Revocation does not erase an existing copy; future sharing requires
        current authorization.
      </p>
      {copies.map((c) => (
        <article className="ledger-record" key={c.patient}>
          <h3>{c.name}</h3>
          <p>Last successful test fetch: {c.savedAt}</p>
          <p>
            {hasTestAccess(state, actor, c.patient)
              ? "Future sharing authorized in this test."
              : "Future sharing blocked. Saved copy remains readable."}
          </p>
          {c.documents.length ? (
            c.documents.map((d) => (
              <p key={d.id}>
                {d.text} · {actorNames[d.author]}
              </p>
            ))
          ) : (
            <p>No documents saved in this copy.</p>
          )}
          <button
            className="button secondary"
            onClick={() => act({ type: "save-copy", patient: c.patient })}
          >
            Fetch latest test copy
          </button>
        </article>
      ))}
    </section>
  );
}
