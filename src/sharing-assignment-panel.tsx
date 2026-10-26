import { useState } from "react";
import { changeStaffAssignment, sharingAssignments } from "./sharing-client";
import type { SharingDevice } from "./sharing-crypto";

export function SharingAssignmentPanel({
  uid,
  role,
  device,
}: {
  uid: string;
  role: string;
  device: SharingDevice;
}) {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof sharingAssignments>>
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  async function refresh() {
    setItems(await sharingAssignments(uid, role, device));
  }
  async function act(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await work();
      await refresh();
      setStatus(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Assignment change was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel" aria-label="Staff assignments">
      <h2>Staff assignments</h2>
      <p>
        Only explicitly approved test relationships appear here. The facility
        offers an assignment; the named professional accepts before future
        sharing opens. This does not change Mother ownership.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void act(async () => {}, "Assignments refreshed.")}
      >
        Refresh assignments
      </button>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {items.map(({ route, assignment }) => (
        <article
          className="ledger-record"
          key={route.id}
          data-testid={`assignment-${route.id}`}
        >
          <h3>Patient assignment</h3>
          <p className="record-id">Profile identity: {route.profileId}</p>
          <p className="record-id">Facility: {route.facilityUid}</p>
          <p className="record-id">Professional: {route.staffUid}</p>
          <p>Assignment status: {assignment?.status || "Not offered"}</p>
          {!route.enabled && (
            <p>
              This approved relationship is disabled. Future sharing is blocked.
            </p>
          )}
          <div className="action-row">
            {route.enabled &&
              role === "organization" &&
              uid === route.facilityUid &&
              !assignment && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        changeStaffAssignment(
                          uid,
                          role,
                          device,
                          route.id,
                          "offer",
                        ),
                      "Assignment offered. Waiting for the named professional to accept.",
                    )
                  }
                >
                  Offer assignment
                </button>
              )}
            {route.enabled &&
              role === "professional" &&
              uid === route.staffUid &&
              assignment?.status === "pending" && (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        changeStaffAssignment(
                          uid,
                          role,
                          device,
                          route.id,
                          "accept",
                        ),
                      "Assignment accepted. Approved records can now be fetched.",
                    )
                  }
                >
                  Accept assignment
                </button>
              )}
            {route.enabled &&
              role === "organization" &&
              uid === route.facilityUid &&
              assignment &&
              assignment.status !== "revoked" && (
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() =>
                    void act(
                      () =>
                        changeStaffAssignment(
                          uid,
                          role,
                          device,
                          route.id,
                          "revoke",
                        ),
                      "Future sharing through this assignment is revoked. Previously saved copies remain readable.",
                    )
                  }
                >
                  Revoke assignment
                </button>
              )}
          </div>
          {assignment?.status === "revoked" && (
            <p>
              Reassignment requires a fresh approved relationship and fresh
              acceptance. Independent direct connections are unchanged.
            </p>
          )}
        </article>
      ))}
    </section>
  );
}
