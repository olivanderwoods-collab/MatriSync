import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  changeStaffAssignment,
  sharingAssignments,
  sharingChannels,
  receiveSharedDocuments,
  sharingAccount,
} from "./sharing-client";
import type { SharingDevice } from "./sharing-crypto";
import { savedTransfers } from "./sharing-storage";
import { readSharedInbox } from "./sharing-inbox";

export type AssignmentView =
  | "pilot"
  | "pending"
  | "patients"
  | "facility"
  | "source";

export function SharingAssignmentPanel({
  uid,
  role,
  device,
  view = "pilot",
  profileId,
}: {
  uid: string;
  role: string;
  device: SharingDevice;
  view?: AssignmentView;
  profileId?: string;
}) {
  const [items, setItems] = useState<
    Awaited<ReturnType<typeof sharingAssignments>>
  >([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState("");
  const [loaded, setLoaded] = useState(false),
    [checkedAt, setCheckedAt] = useState("");
  const [savedProfiles, setSavedProfiles] = useState<string[]>([]);
  const [pins, setPins] = useState<Record<string, string>>({});
  const refresh = useCallback(async () => {
    if (!navigator.onLine)
      throw Error(
        "Go online to check current staff access. Previously saved records remain available in Patients.",
      );
    const next = await sharingAssignments(uid, role, device);
    const records =
      view !== "pilot" && role === "professional"
        ? await readSharedInbox(uid, role, await savedTransfers(uid), device)
        : undefined;
    await sharingAccount(uid);
    return {
      next,
      profiles: records?.profiles.map((p) => p.snapshot.profileId) || [],
    };
  }, [uid, role, device, view]);
  const show = useCallback((result: Awaited<ReturnType<typeof refresh>>) => {
    setItems(result.next);
    setSavedProfiles(result.profiles);
    setLoaded(true);
    setCheckedAt(new Date().toISOString());
  }, []);
  useEffect(() => {
    if (view === "pilot") return;
    let live = true;
    setBusy(true);
    void refresh()
      .then((result) => {
        if (live) show(result);
      })
      .catch((e) => {
        if (live)
          setError(
            e instanceof Error
              ? e.message
              : "Staff access could not be checked.",
          );
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [refresh, view, show]);
  async function act(work: () => Promise<void>, message: string) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      if (!navigator.onLine)
        throw Error(
          "Go online to change staff access or receive records. No new action was confirmed offline.",
        );
      await work();
      show(await refresh());
      setStatus(message);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Assignment change was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const visible = items.filter(
    ({ route, assignment }) =>
      (!profileId || route.profileId === profileId) &&
      (view === "pending"
        ? route.staffUid === uid &&
          route.enabled &&
          assignment?.status === "pending"
        : view === "patients"
          ? route.staffUid === uid &&
            ["accepted", "revoked"].includes(assignment?.status || "")
          : view === "facility"
            ? route.facilityUid === uid
            : view === "source"
              ? route.sourceUid === uid
              : true),
  );
  const title =
    view === "pending"
      ? "Pending patient assignments"
      : view === "patients"
        ? "Assigned patients"
        : view === "source"
          ? "Organization staff access"
          : profileId
            ? "Staff access for this patient"
            : "Staff assignments";
  return (
    <section className="panel" aria-label={title}>
      <h2>{title}</h2>
      <p>
        Only explicitly approved test relationships appear here. The facility
        offers an assignment; the named professional accepts before future
        sharing opens. This does not change Mother ownership.
      </p>
      {checkedAt && (
        <p className="small">
          Access checked {new Date(checkedAt).toLocaleString()}. Refresh for
          current status.
        </p>
      )}
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void act(async () => {}, "Assignments refreshed.")}
      >
        Refresh assignments
      </button>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {loaded && !visible.length && (
        <p>
          {view === "pending"
            ? "No pending patient assignments."
            : "No matching staff assignments."}
        </p>
      )}
      {visible.map(({ route, assignment }) => (
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
          {view === "pending" && (
            <p>
              Accepting opens permission to receive this patient's records. It
              does not mean records have arrived.
            </p>
          )}
          {view === "patients" && (
            <>
              {savedProfiles.includes(route.profileId) ? (
                <Link
                  className="button secondary"
                  to={`/professional/patients/shared-${route.profileId}/overview`}
                >
                  Open saved patient profile
                </Link>
              ) : (
                <p>
                  No profile has been received for this patient. Acceptance
                  alone does not create a patient record.
                </p>
              )}
              {route.enabled && assignment?.status === "accepted" && (
                <>
                  <label>
                    Patient source device fingerprint
                    <input
                      autoComplete="off"
                      value={pins[route.id] || ""}
                      onChange={(e) =>
                        setPins((old) => ({
                          ...old,
                          [route.id]: e.target.value,
                        }))
                      }
                    />
                  </label>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() =>
                      void act(async () => {
                        const connections = (
                          await sharingChannels(uid, role, device)
                        ).filter(
                          (c) =>
                            c.enabled &&
                            c.assignmentRouteId === route.id &&
                            c.senderUid === route.sourceUid &&
                            c.recipientUid === uid,
                        );
                        if (connections.length !== 1)
                          throw Error(
                            "A single approved delivery connection is required for this assignment. No records were fetched.",
                          );
                        const count = await receiveSharedDocuments(
                          uid,
                          role,
                          device,
                          connections[0].id,
                          pins[route.id] || "",
                        );
                        if (!count)
                          throw Error(
                            "No encrypted records have been sent for this assignment yet. Nothing was received.",
                          );
                      }, "Assigned records verified and saved encrypted on this device.")
                    }
                  >
                    Receive assigned records
                  </button>
                </>
              )}
            </>
          )}
        </article>
      ))}
    </section>
  );
}
