import { useState } from "react";
import {
  changeClinicalCredential,
  sharingCredentials,
  type CredentialEntry,
} from "./sharing-credentials";
import type { SharingDevice } from "./sharing-crypto";

export function SharingCredentialPanel({
  uid,
  role,
  device,
}: {
  uid: string;
  role: string;
  device: SharingDevice;
}) {
  const [items, setItems] = useState<CredentialEntry[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  if (!["professional", "organization"].includes(role)) return null;
  async function act(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
      setItems(await sharingCredentials(uid, role, device));
      setStatus(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Credential review was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Clinical credentials">
      <h2>Clinical credentials</h2>
      <p>
        Approved test facilities review their named professionals. Doctor and
        caregiver categories are fixed by the approved test scope. A saved
        profile or workspace selection is not verification.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() =>
          void act(async () => {}, "Credential records refreshed.")
        }
      >
        Refresh credentials
      </button>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {status && !items.length && (
        <p>No approved credential scope is available.</p>
      )}
      {items.map(({ scope, credential, events }) => (
        <article
          className="ledger-record"
          key={scope.staffUid}
          data-testid={`credential-${scope.staffUid}`}
        >
          <h3>
            {scope.category === "doctor" ? "Doctor" : "Caregiver"} credential
          </h3>
          <p className="record-id">Professional account: {scope.staffUid}</p>
          <p className="record-id">Reviewing facility: {scope.facilityUid}</p>
          <p>Recorded status: {credential?.status || "Not submitted"}</p>
          {!scope.enabled && <p>This credential scope is disabled.</p>}
          <p>
            Decisions are checked online. Earlier decisions do not guarantee
            current authority. Suspension cannot be reversed here.
          </p>
          <div className="action-row">
            {scope.enabled &&
              (role === "professional"
                ? !credential || credential.status === "rejected"
                  ? (["submit"] as const)
                  : []
                : credential?.status === "pending"
                  ? (["approve", "reject"] as const)
                  : credential?.status === "approved"
                    ? (["suspend"] as const)
                    : []
              ).map((action) => (
                <button
                  key={action}
                  className={`button ${action === "reject" || action === "suspend" ? "cancel" : "secondary"}`}
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        changeClinicalCredential(
                          uid,
                          role,
                          device,
                          scope.staffUid,
                          action,
                          credential?.lastEventId || "",
                        ),
                      "Credential decision recorded.",
                    )
                  }
                >
                  {
                    {
                      submit: "Submit for facility review",
                      approve: "Approve credential",
                      reject: "Reject credential",
                      suspend: "Suspend credential",
                    }[action]
                  }
                </button>
              ))}
          </div>
          {events.length > 0 && (
            <details>
              <summary>Decision history ({events.length} most recent)</summary>
              <ol>
                {events.map((event, i) => (
                  <li key={i}>
                    {event.status} · {event.at.toDate().toLocaleString()}
                    <p className="record-id">Recorded by: {event.actorUid}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </article>
      ))}
    </section>
  );
}
