import { useState } from "react";
import { sharingAccount } from "./sharing-client";
import {
  decodeFile,
  type SharingDevice,
  type SharedDocument,
} from "./sharing-crypto";
import { groupProfileVersions, type ReceivedProfile } from "./sharing-profile";
import type { SavedTransfer } from "./sharing-storage";
import { readSharedInbox } from "./sharing-inbox";
import { SharedProfileView } from "./sharing-profile-view";

export function SharedProfilePanel({
  uid,
  role,
  device,
  saved,
}: {
  uid: string;
  role: string;
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
      const { profiles: nextProfiles, documents: nextDocuments } =
        await readSharedInbox(uid, role, saved, device);
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
      {selected && (
        <SharedProfileView
          selected={selected}
          documents={documents}
          download={download}
        />
      )}
    </section>
  );
}
