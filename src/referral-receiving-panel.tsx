import { useState } from "react";
import type { SavedReferralDelivery } from "./referral-delivery-storage";
import type { ReferralInitiation } from "./referral-delivery";
import {
  forwardApprovedReferral,
  readReceivingEvents,
  receivingEvents,
  recordReceivingEvent,
  type ReceivingEvent,
  type ReceivingEventKind,
} from "./referral-forwarding";

const labels: Record<ReceivingEventKind, string> = {
  received: "Received and verified",
  accepted: "Accepted",
  arrived: "Arrival verified",
  acknowledged: "Handoff acknowledged",
  closed: "Closed",
};
const confirmations: Record<Exclude<ReceivingEventKind, "received">, string> = {
  accepted: "I confirm that this Organization accepts the referral.",
  arrived: "I have verified this patient's arrival at this Organization.",
  acknowledged:
    "I confirm that the receiving team has acknowledged the handoff.",
  closed:
    "I confirm that this referral can be closed after the acknowledged handoff.",
};
export function ReferralReceivingPanel({
  uid,
  item,
  initiation,
}: {
  uid: string;
  item: SavedReferralDelivery;
  initiation?: ReferralInitiation;
}) {
  const [events, setEvents] = useState<ReceivingEvent[]>(),
    [confirmed, setConfirmed] = useState(false),
    [pin, setPin] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const channelId = item.forwarded
    ? item.channelId
    : initiation?.destinationChannelId;
  const next = events
    ? receivingEvents.find((k) => !events.some((e) => e.kind === k))
    : undefined;
  async function refresh() {
    if (!channelId) return;
    setEvents(await readReceivingEvents(uid, channelId, item.id));
    setConfirmed(false);
  }
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await work();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "The action was not confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      aria-label="Destination delivery and receiving events"
      className="panel"
    >
      <h3>Destination delivery and receiving events</h3>
      {!item.forwarded && initiation && (
        <>
          <p>
            Send the exact approved version to the selected destination. Sending
            does not confirm receipt or acceptance.
          </p>
          <label>
            Selected destination device fingerprint
            <input
              value={pin}
              autoComplete="off"
              onChange={(e) => setPin(e.target.value)}
            />
          </label>
          <button
            className="button secondary"
            disabled={busy || !pin}
            onClick={() =>
              void act(async () => {
                await forwardApprovedReferral(uid, item, pin);
                setNotice(
                  "Stored encrypted for the selected destination. Receipt and acceptance remain separate.",
                );
              })
            }
          >
            Send to selected destination
          </button>
        </>
      )}
      <p>
        {events
          ? events.length
            ? "Events confirmed at the last online check. Refresh for current progress."
            : "No receiving events recorded at the last online check."
          : "Receiving events have not been checked online. A saved referral does not establish current progress."}
      </p>
      {events && (
        <ol>
          {events.map((e) => (
            <li key={e.kind}>
              {labels[e.kind]} · {e.actorUid} ·{" "}
              {new Date(e.createdAt).toLocaleString()}
            </li>
          ))}
        </ol>
      )}
      <button
        className="button secondary"
        disabled={busy || !channelId}
        onClick={() => void act(refresh)}
      >
        Check receiving events
      </button>
      {item.forwarded && next && (
        <>
          {next !== "received" && (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={confirmed}
                onChange={(e) => setConfirmed(e.target.checked)}
              />
              {confirmations[next]}
            </label>
          )}
          <button
            className="button secondary"
            disabled={busy || (next !== "received" && !confirmed)}
            onClick={() =>
              void act(async () => {
                await recordReceivingEvent(uid, item, next);
                await refresh();
                setNotice(
                  `${labels[next]} recorded. No later event was inferred.`,
                );
              })
            }
          >
            {next === "received"
              ? "Confirm saved receipt"
              : `Record: ${labels[next]}`}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
