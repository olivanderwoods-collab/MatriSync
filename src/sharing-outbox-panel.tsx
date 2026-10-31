import { useEffect, useState } from "react";
import { sharingAccount, publishQueuedTransfer } from "./sharing-client";
import { queuedTransfers, openQueuedTransfer, type QueuedTransfer } from "./sharing-outbox";
import type { SharingDevice } from "./sharing-crypto";

export function SharingOutboxPanel({ uid, role, device, revision, onConfirmed }: {
  uid: string; role: string; device: SharingDevice; revision: number; onConfirmed: (id: string) => void;
}) {
  const [items, setItems] = useState<QueuedTransfer[]>([]);
  const [refresh, setRefresh] = useState(0), [busy, setBusy] = useState(false);
  const [error, setError] = useState(""), [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      await sharingAccount(uid);
      const saved = await queuedTransfers(uid, role);
      for (const item of saved) await openQueuedTransfer(item, uid, role, device);
      await sharingAccount(uid);
      if (live) setItems(saved.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
    })().catch(e => { if (live) setError(e instanceof Error ? e.message : "Unable to open queued deliveries."); });
    return () => { live = false; };
  }, [uid, role, device, revision, refresh]);
  async function resume(item: QueuedTransfer) {
    setBusy(true); setError(""); setStatus("");
    try {
      await publishQueuedTransfer(uid, role, device, item);
      await sharingAccount(uid);
      onConfirmed(item.id);
      setStatus("The exact encrypted delivery is confirmed stored by the relay. Recipient download is a separate step.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delivery was not confirmed. The encrypted copy remains queued.");
    } finally { setBusy(false); setRefresh(n => n + 1); }
  }
  return <section className="panel" aria-label="Encrypted send outbox">
    <h2>Encrypted send outbox</h2>
    <p>Prepared deliveries stay encrypted on this device until relay storage is confirmed. Resume checks current permission and the original recipient; it does not send a changed version or a second copy.</p>
    <button className="button secondary" disabled={busy} onClick={() => setRefresh(n => n + 1)}>Refresh saved deliveries</button>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    {!items.length && <p>No prepared deliveries on this device.</p>}
    {items.map(item => <article className="ledger-record" key={`${item.channelId}/${item.id}`} data-testid={`queued-${item.id}`}>
      <h3>{item.kind === "profile" ? "Profile version" : "Original document"}</h3>
      <p className="record-id">Connection: {item.channelId}</p>
      <p className="record-id">Delivery: {item.id}</p>
      <p>Prepared {new Date(item.createdAt).toLocaleString()}</p>
      {item.acknowledgedAt ? <p>Relay storage confirmed {new Date(item.acknowledgedAt).toLocaleString()}. This does not confirm recipient download.</p>
        : <><p>Awaiting relay confirmation. This may already have reached the relay; resume checks the same delivery.</p>
          <button className="button primary" disabled={busy} onClick={() => void resume(item)}>Resume / Check delivery</button></>}
    </article>)}
  </section>;
}
