import { ReferralOutboxPanel } from "./referral-outbox-panel";
import { BleHandoffPanel } from "./ble-handoff-panel";
import { receiveHandoff } from "./handoff-client";
import { useState } from "react";
import { Link } from "react-router-dom";
import { sharingChannels, type SharingChannel } from "./sharing-client";
import { localSharingDevice } from "./sharing-storage";
import {
  sendApprovedReferral,
  receiveApprovedReferrals,
  openReferralDelivery,
  readReferralInitiation,
  initiateReferral,
  type ReferralInitiation,
} from "./referral-delivery";
import {
  savedReferralDeliveries,
  type SavedReferralDelivery,
} from "./referral-delivery-storage";
import type { ReferralDraft } from "./referral-draft";
import type { ReferralPackage } from "./referral-package";
import {
  approvedReferralDocumentHtml,
  downloadReferralDocument,
  printReferralDocument,
  referralLabels,
} from "./referral-document";
import { referralFields } from "./referral-draft";
import { receiveForwardedReferrals } from "./referral-forwarding";
import { ReferralReceivingPanel } from "./referral-receiving-panel";

function useAction() {
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
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
  return {
    busy,
    act,
    setNotice,
    messages: (
      <>
        {error && <p role="alert">{error}</p>}
        {notice && <p role="status">{notice}</p>}
      </>
    ),
  };
}
function ConnectionSelect({
  label,
  channels,
  value,
  onChange,
}: {
  label: string;
  channels: SharingChannel[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label>
      {label}
      <select
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a connection</option>
        {channels.map((c) => (
          <option key={c.id} value={c.id}>
            {c.senderUid} → {c.recipientUid}
          </option>
        ))}
      </select>
    </label>
  );
}
export function SendApprovedReferral({
  uid,
  draft,
  versionId,
  facilityUid,
}: {
  uid: string;
  draft: ReferralDraft;
  versionId: string;
  facilityUid: string;
}) {
  const [channels, setChannels] = useState<SharingChannel[]>([]),
    [channel, setChannel] = useState(""),
    [fingerprint, setFingerprint] = useState("");
  const a = useAction();
  return (
    <section aria-label="Send approved referral" className="panel">
      <h4>Send this approved version to your Organization</h4>
      <p>
        The Organization receives only this approved referral and its source
        references. Full profiles and originals require their own authorized
        sharing.
      </p>
      <button
        className="button secondary"
        disabled={a.busy}
        onClick={() =>
          void a.act(async () => {
            setChannels(
              (
                await sharingChannels(
                  uid,
                  "professional",
                  await localSharingDevice(uid),
                )
              ).filter(
                (c) =>
                  c.enabled &&
                  !c.assignmentRouteId &&
                  c.senderUid === uid &&
                  c.recipientUid === facilityUid,
              ),
            );
          })
        }
      >
        Find approved facility connection
      </button>
      <ConnectionSelect
        label="Referral facility connection"
        channels={channels}
        value={channel}
        onChange={setChannel}
      />
      <label>
        Facility device fingerprint
        <input
          value={fingerprint}
          onChange={(e) => setFingerprint(e.target.value)}
          autoComplete="off"
        />
      </label>
      <button
        className="button secondary"
        disabled={a.busy || !channel}
        onClick={() =>
          void a.act(async () => {
            await sendApprovedReferral(
              uid,
              draft,
              versionId,
              channel,
              fingerprint,
            );
            a.setNotice(
              "Approved version stored encrypted for the Organization. This does not confirm receipt or initiation.",
            );
          })
        }
      >
        Send approved version
      </button>
      {a.messages}
      <ReferralOutboxPanel uid={uid} role="professional" revision={a.busy} />
    </section>
  );
}
export function OrganizationReferrals({ uid }: { uid: string }) {
  const [channels, setChannels] = useState<SharingChannel[]>([]),
    [incoming, setIncoming] = useState(""),
    [peer, setPeer] = useState("");
  const [saved, setSaved] = useState<SavedReferralDelivery[]>([]),
    [selected, setSelected] = useState<{
      item: SavedReferralDelivery;
      value: ReferralPackage;
    }>();
  const [destination, setDestination] = useState(""),
    [destinationPin, setDestinationPin] = useState(""),
    [reviewed, setReviewed] = useState(false);
  const [initiation, setInitiation] = useState<ReferralInitiation>(),
    [checked, setChecked] = useState(false);
  const a = useAction();
  async function reloadSaved() {
    setSaved(await savedReferralDeliveries(uid));
  }
  async function exportCopy(print: boolean) {
    if (!selected) return;
    const { value } = selected;
    const html = await approvedReferralDocumentHtml(
      value.draft,
      value.draft.versions[0].id,
      value.approval,
      value.versionNumber,
    );
    await openReferralDelivery(uid, selected.item);
    if (print) await printReferralDocument(html);
    else downloadReferralDocument(html, true);
    a.setNotice(
      "Approved copy requested. This copy records doctor approval; it does not certify later referral events.",
    );
  }
  return (
    <>
      <h1>Referrals</h1>
      <ReferralOutboxPanel uid={uid} role="organization" />
      <section className="panel">
        <h2>Receive doctor-approved referrals</h2>
        <p>
          Review the doctor's exact approved version. Sending, receipt,
          acceptance, arrival and handoff are recorded separately.
        </p>
        <button
          className="button secondary"
          disabled={a.busy}
          onClick={() =>
            void a.act(async () => {
              setChannels(
                await sharingChannels(
                  uid,
                  "organization",
                  await localSharingDevice(uid),
                ),
              );
              await reloadSaved();
            })
          }
        >
          Refresh referral connections
        </button>
        <ConnectionSelect
          label="Incoming referral connection"
          channels={channels.filter(
            (c) => c.enabled && !c.assignmentRouteId && c.recipientUid === uid,
          )}
          value={incoming}
          onChange={setIncoming}
        />
        <label>
          Sender device fingerprint
          <input
            value={peer}
            onChange={(e) => setPeer(e.target.value)}
            autoComplete="off"
          />
        </label>
        <div className="action-row">
          <button
            className="button secondary"
            disabled={a.busy || !incoming}
            onClick={() =>
              void a.act(async () => {
                const count = await receiveApprovedReferrals(
                  uid,
                  incoming,
                  peer,
                );
                await reloadSaved();
                a.setNotice(
                  `${count} approved referral(s) verified and saved encrypted.`,
                );
              })
            }
          >
            Receive approved referrals
          </button>
          <button
            className="button secondary"
            disabled={a.busy || !incoming}
            onClick={() =>
              void a.act(async () => {
                const count = await receiveForwardedReferrals(
                  uid,
                  incoming,
                  peer,
                );
                await reloadSaved();
                a.setNotice(
                  `${count} destination referral(s) verified and saved encrypted. Receipt recorded; acceptance is separate.`,
                );
              })
            }
          >
            Receive from initiating Organization
          </button>
          <button
            className="button secondary"
            disabled={a.busy}
            onClick={() => void a.act(reloadSaved)}
          >
            Open saved referrals
          </button>
        </div>
        {saved.map((item) => (
          <button
            className="button secondary"
            disabled={a.busy}
            key={`${item.channelId}/${item.id}`}
            onClick={() =>
              void a.act(async () => {
                const value = await openReferralDelivery(uid, item);
                setSelected({ item, value });
                setInitiation(undefined);
                setChecked(false);
                setReviewed(false);
                setDestination("");
                setDestinationPin("");
              })
            }
          >
            Open approved referral · {item.id.slice(0, 8)}
          </button>
        ))}
      </section>
      <BleHandoffPanel
        onRead={async (bytes) => {
          const opened = await receiveHandoff(uid, bytes, peer);
          setSelected(opened);
          setInitiation(undefined);
          setChecked(false);
          setReviewed(false);
          setDestination("");
          setDestinationPin("");
          await reloadSaved();
        }}
      />
      {selected && (
        <section className="panel" aria-label="Received approved referral">
          <h2>{selected.value.draft.versions[0].patient.name}</h2>
          <p>
            Doctor-approved version {selected.value.versionNumber} · Saved on
            this device
          </p>
          {referralFields.map((field) => (
            <div key={field}>
              <h3>{referralLabels[field]}</h3>
              <p style={{ whiteSpace: "pre-wrap" }}>
                {selected.value.draft.versions[0].fields[field] ||
                  "Not recorded"}
              </p>
            </div>
          ))}
          <h3>Original document references</h3>
          {selected.value.draft.versions[0].documents.length ? (
            <ul>
              {selected.value.draft.versions[0].documents.map((d) => (
                <li key={d.id}>
                  {d.name} · {d.source || "Source not recorded"} ·{" "}
                  {d.reportDate || "Date not recorded"}
                </li>
              ))}
            </ul>
          ) : (
            <p>No original documents referenced.</p>
          )}
          <p>
            References do not include original files or grant access to the full
            profile.
          </p>
          {selected.value.draft.receivedOrigin && (
            <Link
              className="button secondary"
              to={`/organization/patients/shared-${selected.value.draft.receivedOrigin.profileId}/overview?version=${encodeURIComponent(selected.value.draft.receivedOrigin.profileRevision)}`}
            >
              Find separately shared patient profile
            </Link>
          )}
          <div className="action-row">
            <button
              className="button secondary"
              disabled={a.busy}
              onClick={() => void a.act(() => exportCopy(false))}
            >
              Download received approved copy
            </button>
            <button
              className="button secondary"
              disabled={a.busy}
              onClick={() => void a.act(() => exportCopy(true))}
            >
              Print received approved copy
            </button>
          </div>
          {!selected.item.forwarded && (
            <>
              <h3>Organization initiation</h3>
              <p>
                {initiation
                  ? `Initiated on ${new Date(initiation.createdAt).toLocaleString()} for account ${initiation.destinationUid}. Destination delivery and receiving events are recorded separately below.`
                  : checked
                    ? "No initiation recorded for this version at the last check."
                    : "Initiation status has not been checked online. A saved copy does not show current progress."}
              </p>
              <button
                className="button secondary"
                disabled={a.busy}
                onClick={() =>
                  void a.act(async () => {
                    setInitiation(
                      await readReferralInitiation(uid, selected.item),
                    );
                    setChecked(true);
                  })
                }
              >
                Check initiation status
              </button>
              {!initiation && (
                <>
                  <ConnectionSelect
                    label="Referral destination connection"
                    channels={channels.filter(
                      (c) =>
                        c.enabled &&
                        !c.assignmentRouteId &&
                        c.senderUid === uid,
                    )}
                    value={destination}
                    onChange={(value) => {
                      setDestination(value);
                      setDestinationPin("");
                      setReviewed(false);
                    }}
                  />
                  <label>
                    Destination device fingerprint
                    <input
                      value={destinationPin}
                      onChange={(e) => {
                        setDestinationPin(e.target.value);
                        setReviewed(false);
                      }}
                      autoComplete="off"
                    />
                  </label>
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={reviewed}
                      onChange={(e) => setReviewed(e.target.checked)}
                    />
                    I have reviewed this approved version and the selected
                    destination.
                  </label>
                  <button
                    className="button secondary"
                    disabled={a.busy || !reviewed || !destination}
                    onClick={() =>
                      void a.act(async () => {
                        setInitiation(
                          await initiateReferral(
                            uid,
                            selected.item,
                            destination,
                            destinationPin,
                          ),
                        );
                        setChecked(true);
                        a.setNotice(
                          "Organization initiation recorded. Destination delivery and handoff have not occurred.",
                        );
                      })
                    }
                  >
                    Initiate approved referral
                  </button>
                </>
              )}
            </>
          )}
          {(selected.item.forwarded || initiation) && (
            <ReferralReceivingPanel
              key={`${selected.item.channelId}/${selected.item.id}`}
              uid={uid}
              item={selected.item}
              initiation={initiation}
            />
          )}
        </section>
      )}
      {a.messages}
    </>
  );
}
