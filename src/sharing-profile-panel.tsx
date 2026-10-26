import { useState } from "react";
import { sharingAccount } from "./sharing-client";
import {
  decodeFile,
  decryptSharedTransfer,
  type SharingDevice,
  type SharedDocument,
} from "./sharing-crypto";
import {
  contentDigest,
  groupProfileVersions,
  matchesProfileOriginal,
  type ReceivedProfile,
} from "./sharing-profile";
import type { SavedTransfer } from "./sharing-storage";

export function SharedProfilePanel({
  uid,
  device,
  saved,
}: {
  uid: string;
  device: SharingDevice;
  saved: SavedTransfer[];
}) {
  const [profiles, setProfiles] = useState<ReceivedProfile[]>([]);
  const [documents, setDocuments] = useState<
    { sourceUid: string; document: SharedDocument; sha256: string }[]
  >([]);
  const [profileId, setProfileId] = useState("");
  const [revision, setRevision] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const groups = groupProfileVersions(profiles);
  const versions =
    groups.find((g) => g.profileId === profileId)?.versions || [];
  const selected = versions.find((v) => v.snapshot.revision === revision);
  async function openSaved() {
    setBusy(true);
    setError("");
    try {
      await sharingAccount(uid);
      const nextProfiles: ReceivedProfile[] = [],
        nextDocuments: typeof documents = [];
      for (const item of saved) {
        if (item.recipientUid !== uid) throw Error("Wrong receiving account.");
        const content = await decryptSharedTransfer(
          item.ciphertext,
          item,
          device,
          item.sender,
        );
        if (content.kind === "profile")
          nextProfiles.push({
            snapshot: content.profile,
            savedAt: item.savedAt,
            transferId: item.id,
          });
        else
          nextDocuments.push({
            sourceUid: item.senderUid,
            document: content.document,
            sha256: await contentDigest(decodeFile(content.document.bytes)),
          });
      }
      await sharingAccount(uid);
      setProfiles(nextProfiles);
      setDocuments(nextDocuments);
      setLoaded(true);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Unable to open saved profiles.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function download(document: SharedDocument) {
    try {
      await sharingAccount(uid);
      const url = URL.createObjectURL(
        new Blob([decodeFile(document.bytes)], { type: document.type }),
      );
      const anchor = window.document.createElement("a");
      anchor.href = url;
      anchor.download = document.name;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch {
      setError("Sign in to this document's account before opening it.");
    }
  }
  const snapshot = selected?.snapshot;
  return (
    <section className="panel" aria-label="Saved shared profiles">
      <h2>Saved shared profiles</h2>
      <p>
        Read-only copies from an approved connection. Earlier versions are
        preserved; nothing here replaces your own records or claims ownership.
      </p>
      <p>
        Sharing preserves recorded information; it does not clinically verify
        it.
      </p>
      <button
        className="button secondary"
        disabled={busy}
        onClick={() => void openSaved()}
      >
        {busy ? "Opening saved profiles…" : "Open saved profiles"}
      </button>
      {error && <p role="alert">{error}</p>}
      {loaded && !groups.length && (
        <p>No profile snapshots saved on this device.</p>
      )}
      {groups.length > 0 && (
        <>
          <label>
            Shared patient
            <select
              aria-label="Shared patient"
              value={profileId}
              onChange={(e) => {
                setProfileId(e.target.value);
                setRevision("");
              }}
            >
              <option value="">Choose a patient</option>
              {groups.map((g) => (
                <option value={g.profileId} key={g.profileId}>
                  {g.versions[0].snapshot.patient.name} · {g.versions.length}{" "}
                  saved version(s) · {g.profileId.slice(0, 12)}
                </option>
              ))}
            </select>
          </label>
          {profileId && (
            <label>
              Saved profile version
              <select
                aria-label="Saved profile version"
                value={revision}
                onChange={(e) => setRevision(e.target.value)}
              >
                <option value="">Choose a version to review</option>
                {versions.map((v, i) => (
                  <option value={v.snapshot.revision} key={v.snapshot.revision}>
                    Version {i + 1} · Source updated{" "}
                    {new Date(v.snapshot.sourceUpdatedAt).toLocaleString()} ·{" "}
                    {v.snapshot.revision.slice(0, 10)}
                  </option>
                ))}
              </select>
            </label>
          )}
        </>
      )}
      {snapshot && (
        <article data-testid="shared-profile-view">
          <h3>{snapshot.patient.name}</h3>
          <p className="record-id">Shared profile ID: {snapshot.profileId}</p>
          <p>
            Profile fields updated:{" "}
            {new Date(snapshot.sourceUpdatedAt).toLocaleString()}
          </p>
          <p>
            Saved on this device: {new Date(selected.savedAt).toLocaleString()}
          </p>
          <p>
            Versions are ordered by receipt, not clinical authority. Review the
            recorded dates; a later arrival is not proof of newer clinical
            information.
          </p>
          <dl className="detail-list">
            <dt>Profile type</dt>
            <dd>{snapshot.patient.kind}</dd>
            <dt>Date of birth</dt>
            <dd>{snapshot.patient.birthDate || "Not recorded"}</dd>
            <dt>Recorded history</dt>
            <dd className="preserve-lines">
              {snapshot.patient.history || "Not recorded"}
            </dd>
            {snapshot.patient.details && (
              <>
                <dt>Recorded pregnancy week</dt>
                <dd>
                  {snapshot.patient.details.pregnancyWeeks ?? "Not recorded"}
                  {snapshot.patient.details.recordedOn
                    ? ` · Recorded ${snapshot.patient.details.recordedOn}`
                    : ""}
                </dd>
                <dt>Blood group</dt>
                <dd>{snapshot.patient.details.bloodGroup || "Not recorded"}</dd>
                <dt>Allergies</dt>
                <dd>{snapshot.patient.details.allergies || "Not recorded"}</dd>
                <dt>Emergency contact person</dt>
                <dd>
                  {snapshot.patient.details.emergencyContact || "Not recorded"}
                </dd>
                <dt>Emergency contact phone</dt>
                <dd>
                  {snapshot.patient.details.emergencyPhone || "Not recorded"}
                </dd>
                <dt>Guardian</dt>
                <dd>{snapshot.patient.details.guardian || "Not recorded"}</dd>
                <dt>Guardian phone</dt>
                <dd>
                  {snapshot.patient.details.guardianPhone || "Not recorded"}
                </dd>
                <dt>Residence</dt>
                <dd>{snapshot.patient.details.residence || "Not recorded"}</dd>
              </>
            )}
            {snapshot.patient.child && (
              <>
                <dt>Recorded sex</dt>
                <dd>{snapshot.patient.child.sex || "Not recorded"}</dd>
                <dt>Blood group</dt>
                <dd>{snapshot.patient.child.bloodGroup || "Not recorded"}</dd>
                <dt>Allergies</dt>
                <dd>{snapshot.patient.child.allergies || "Not recorded"}</dd>
              </>
            )}
          </dl>
          {snapshot.patient.parentProfileId && (
            <p>
              Linked parent identity recorded. Access to the parent's profile is
              a separate connection.
            </p>
          )}
          <h4>Original document references</h4>
          {!snapshot.documents.length && (
            <p>No document references in this version.</p>
          )}
          {snapshot.documents.map((ref) => {
            const match = documents.find((d) =>
              matchesProfileOriginal(snapshot, ref, {
                sourceUid: d.sourceUid,
                sourcePatientId: d.document.sourcePatientId,
                sourceDocumentId: d.document.sourceDocumentId,
                sha256: d.sha256,
                type: d.document.type,
                size: decodeFile(d.document.bytes).length,
              }),
            );
            return (
              <div className="ledger-record" key={ref.id}>
                <strong>{ref.name}</strong>
                <p>
                  {ref.kind} · {ref.reportDate || "Date not recorded"} ·{" "}
                  {ref.source || "Source not recorded"}
                </p>
                {match ? (
                  <button
                    className="button secondary"
                    onClick={() => void download(match.document)}
                  >
                    Download matched original
                  </button>
                ) : (
                  <p>
                    Original not received. This reference does not contain the
                    file.
                  </p>
                )}
              </div>
            );
          })}
        </article>
      )}
    </section>
  );
}
