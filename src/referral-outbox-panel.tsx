import { useEffect, useState } from "react";
import { sharingAccount } from "./sharing-client";
import { localSharingDevice } from "./sharing-storage";
import {
  openQueuedReferral,
  queuedReferrals,
  type QueuedReferral,
} from "./referral-outbox";
import { publishQueuedReferral } from "./referral-outbox-client";

export function ReferralOutboxPanel({
  uid,
  role,
  revision = false,
}: {
  uid: string;
  role: string;
  revision?: boolean;
}) {
  const [items, setItems] = useState<QueuedReferral[]>([]),
    [refresh, setRefresh] = useState(0);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      await sharingAccount(uid);
      const device = await localSharingDevice(uid),
        saved = await queuedReferrals(uid, role);
      for (const item of saved)
        await openQueuedReferral(item, uid, role, device);
      await sharingAccount(uid);
      if (live) setItems(saved);
    })().catch((e) => {
      if (live)
        setError(
          e instanceof Error ? e.message : "Unable to read queued referrals.",
        );
    });
    return () => {
      live = false;
    };
  }, [uid, role, revision, refresh]);
  async function resume(item: QueuedReferral) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await publishQueuedReferral(uid, role, item);
      setNotice(
        "The exact referral envelope is confirmed stored by the relay. Receiving events remain separate.",
      );
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Referral delivery was not confirmed.",
      );
    } finally {
      setBusy(false);
      setRefresh((n) => n + 1);
    }
  }
  return (
    <section className="panel" aria-label="Encrypted referral outbox">
      <h3>Encrypted referral outbox</h3>
      <p>
        Prepared referrals stay encrypted on this device. Resume checks current
        authority and keeps the same approved version, recipient and encrypted
        package. Relay storage does not confirm receipt, acceptance or handoff.
      </p>
      <button
        className="button secondary"
        disabled={busy || revision}
        onClick={() => setRefresh((n) => n + 1)}
      >
        Refresh queued referrals
      </button>
      {!items.length && <p>No prepared referrals in this workspace.</p>}
      {items.map((item) => (
        <article
          className="ledger-record"
          key={`${item.kind}/${item.channelId}/${item.id}`}
        >
          <h4>
            {item.kind === "approved"
              ? "Doctor to Organization"
              : "Organization to selected destination"}
          </h4>
          <p className="record-id">Connection: {item.channelId}</p>
          <p className="record-id">Approval: {item.id}</p>
          <p>Prepared {new Date(item.createdAt).toLocaleString()}</p>
          {item.acknowledgedAt ? (
            <p>
              Relay storage confirmed{" "}
              {new Date(item.acknowledgedAt).toLocaleString()}. This is a saved
              confirmation, not a current permission check.
            </p>
          ) : (
            <>
              <p>
                Awaiting referral relay confirmation. The relay may already hold
                this package; resume checks the same delivery.
              </p>
              <button
                className="button secondary"
                disabled={busy || revision}
                onClick={() => void resume(item)}
              >
                Resume / Check referral
              </button>
            </>
          )}
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </section>
  );
}
