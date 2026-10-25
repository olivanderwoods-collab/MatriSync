import { useEffect, useState } from "react";
import { useRecords, VaultGate } from "./records";
import {
  sharingAccount,
  requestSharingDevice,
  sharingChannels,
  sendSharedDocument,
  receiveSharedDocuments,
  type SharingChannel,
} from "./sharing-client";
import {
  localSharingDevice,
  savedTransfers,
  type SavedTransfer,
} from "./sharing-storage";
import {
  decodeFile,
  encodeFile,
  decryptTransfer,
  type SharingDevice,
  type SharedDocument,
} from "./sharing-crypto";

export function SharingPage({ uid, role }: { uid: string; role: string }) {
  return (
    <VaultGate>
      <SharingContent key={`${uid}/${role}`} uid={uid} role={role} />
    </VaultGate>
  );
}
function SharingContent({ uid, role }: { uid: string; role: string }) {
  const { vault } = useRecords();
  const [device, setDevice] = useState<SharingDevice>();
  const [channels, setChannels] = useState<SharingChannel[]>([]);
  const [channelId, setChannelId] = useState("");
  const [fingerprint, setFingerprint] = useState("");
  const [saved, setSaved] = useState<SavedTransfer[]>([]);
  const [opened, setOpened] = useState<SharedDocument>();
  const [file, setFile] = useState<File>();
  const [documentId, setDocumentId] = useState("");
  const [transferId, setTransferId] = useState(() => crypto.randomUUID());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  useEffect(() => {
    let live = true;
    void (async () => {
      await sharingAccount(uid);
      const key = await localSharingDevice(uid),
        inbox = await savedTransfers(uid);
      await sharingAccount(uid);
      if (live) {
        setDevice(key);
        setSaved(inbox);
      }
    })().catch((e) => {
      if (live)
        setError(
          e instanceof Error ? e.message : "Unable to open sharing storage.",
        );
    });
    return () => {
      live = false;
    };
  }, [uid]);
  async function act(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await sharingAccount(uid);
      await work();
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Sharing failed. No success was confirmed.",
      );
    } finally {
      setBusy(false);
    }
  }
  const channel = channels.find((c) => c.id === channelId);
  return (
    <>
      <h1>Encrypted sharing pilot</h1>
      <section className="panel">
        <h2>Approved test accounts only</h2>
        <p>
          Local relay pilot · Real encrypted transfer between separate accounts.
          Use fictional test documents. Public sharing and full-profile syncing
          are not connected yet.
        </p>
        <p>
          One enrolled browser per account. Private device keys stay here;
          losing browser storage loses access to received copies. Do not clear
          your existing records.
        </p>
        <p className="record-id">
          Account ID: <span data-testid="sharing-uid">{uid}</span>
        </p>
        {device && (
          <p className="record-id">
            This device fingerprint:{" "}
            <span data-testid="sharing-fingerprint">{device.keyId}</span>
          </p>
        )}
        <button
          className="button primary"
          disabled={busy || !device}
          onClick={() =>
            void act(async () => {
              if (!navigator.onLine)
                throw Error(
                  "Go online to request approval or refresh connections.",
                );
              await requestSharingDevice(uid, device!);
              const approved = await sharingChannels(uid, role, device!);
              setChannels(approved);
              setStatus(
                "Approved connections refreshed. No document was sent.",
              );
            })
          }
        >
          Request approval / Refresh connections
        </button>
        <p className="small">
          Give the operator this account ID and fingerprint. Approval is
          performed outside the app; this button cannot approve an account.
        </p>
      </section>
      {channels.length > 0 && (
        <section className="panel">
          <h2>Share an original document</h2>
          <p>
            PDF or image · Pilot limit 256 KiB. Metadata and original bytes are
            encrypted. Larger documents and automatic profile merging are
            next-stage work.
          </p>
          <p className="small">
            This pilot lists up to 20 connections and fetches the newest 20
            transfers per connection.
          </p>
          <label>
            Approved connection
            <select
              value={channelId}
              onChange={(e) => {
                setChannelId(e.target.value);
                setFingerprint("");
                setOpened(undefined);
              }}
            >
              <option value="">Choose a connection</option>
              {channels.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.id}
                  {!c.enabled
                    ? " · Sharing revoked"
                    : c.senderUid === uid
                      ? " · Send"
                      : " · Receive"}
                </option>
              ))}
            </select>
          </label>
          {channel && (
            <>
              <p className="record-id">
                Other account:{" "}
                {channel.senderUid === uid
                  ? channel.recipientUid
                  : channel.senderUid}
              </p>
              <label>
                Other device fingerprint
                <input
                  value={fingerprint}
                  onChange={(e) => setFingerprint(e.target.value.trim())}
                  maxLength={64}
                  autoComplete="off"
                />
              </label>
              <p className="small">
                For the first transfer, obtain the fingerprint shown on the
                other person's own device through a separate trusted channel. It
                is pinned locally after verification. A changed key is blocked.
              </p>
              {!channel.enabled ? (
                <p>
                  Future sharing is blocked. Previously saved copies remain
                  readable below.
                </p>
              ) : channel.senderUid === uid ? (
                <form
                  className="record-form"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    void act(async () => {
                      if (!navigator.onLine)
                        throw Error(
                          "Offline. No new transfer was sent; your original remains saved locally.",
                        );
                      let document: SharedDocument;
                      if (documentId) {
                        const { doc, bytes } =
                          await vault!.document(documentId);
                        const patient = vault!.data!.patients.find(
                          (p) => p.id === doc.patientId,
                        );
                        document = {
                          name: doc.name,
                          type: doc.type,
                          bytes: encodeFile(bytes),
                          source: doc.source,
                          patientName: patient?.name || "",
                          sourcePatientId: doc.patientId,
                          sourceDocumentId: doc.id,
                        };
                      } else {
                        if (!file) throw Error("Choose an original document.");
                        document = {
                          name: file.name,
                          type: file.type,
                          bytes: encodeFile(
                            new Uint8Array(await file.arrayBuffer()),
                          ),
                          source: "",
                          patientName: "",
                          sourcePatientId: "",
                          sourceDocumentId: "",
                        };
                      }
                      await sendSharedDocument(
                        uid,
                        role,
                        device!,
                        channelId,
                        fingerprint,
                        document,
                        transferId,
                      );
                      setStatus(
                        "Encrypted document stored by the relay. Recipient download is a separate step.",
                      );
                      setTransferId(crypto.randomUUID());
                      setFile(undefined);
                      setDocumentId("");
                      form.reset();
                    });
                  }}
                >
                  <label>
                    Saved local document
                    <select
                      value={documentId}
                      onChange={(e) => {
                        setDocumentId(e.target.value);
                        setFile(undefined);
                      }}
                    >
                      <option value="">
                        Choose a file from this device instead
                      </option>
                      {vault!.data!.documents.map((d) => (
                        <option value={d.id} key={d.id}>
                          {d.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!documentId && (
                    <label>
                      Original test document
                      <input
                        type="file"
                        accept="application/pdf,image/png,image/jpeg,image/webp"
                        onChange={(e) => setFile(e.target.files?.[0])}
                      />
                    </label>
                  )}
                  <button className="button primary" disabled={busy}>
                    Encrypt and send document
                  </button>
                </form>
              ) : (
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() =>
                    void act(async () => {
                      if (!navigator.onLine)
                        throw Error(
                          "Offline. Open a previously saved copy below.",
                        );
                      const count = await receiveSharedDocuments(
                        uid,
                        role,
                        device!,
                        channelId,
                        fingerprint,
                      );
                      setSaved(await savedTransfers(uid));
                      setStatus(
                        `${count} encrypted transfer(s) checked and saved on this device.`,
                      );
                    })
                  }
                >
                  Fetch approved documents
                </button>
              )}
            </>
          )}
        </section>
      )}
      {busy && <p role="status">Working · Waiting for confirmation…</p>}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      <section className="panel">
        <h2>Previously saved documents</h2>
        <p>
          These encrypted copies can be reopened offline after sign-in,
          including after future sharing is revoked.
        </p>
        {!saved.length && <p>No shared documents saved on this device.</p>}
        {saved.map((item) => (
          <article
            className="ledger-record"
            key={`${item.channelId}/${item.id}`}
          >
            <p className="record-id">Transfer {item.id}</p>
            <p>Saved {new Date(item.savedAt).toLocaleString()}</p>
            <button
              className="button secondary"
              disabled={busy || !device}
              onClick={() =>
                void act(async () => {
                  const document = await decryptTransfer(
                    item.ciphertext,
                    item,
                    device!,
                    item.sender,
                  );
                  await sharingAccount(uid);
                  setOpened(document);
                })
              }
            >
              Open saved document
            </button>
          </article>
        ))}
        {opened && (
          <div className="notice">
            <div>
              <h3>{opened.name}</h3>
              {opened.patientName && (
                <p>Source patient: {opened.patientName}</p>
              )}
              {opened.source && <p>Source: {opened.source}</p>}
              <p>Original document · No AI interpretation</p>
              <button
                className="button secondary"
                onClick={() =>
                  void act(async () => {
                    const bytes = decodeFile(opened.bytes);
                    await sharingAccount(uid);
                    const url = URL.createObjectURL(
                      new Blob([bytes], { type: opened.type }),
                    );
                    const anchor = document.createElement("a");
                    anchor.href = url;
                    anchor.download = opened.name;
                    anchor.click();
                    setTimeout(() => URL.revokeObjectURL(url), 1000);
                  })
                }
              >
                Download original
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
