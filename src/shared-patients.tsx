import { useEffect, useState } from "react";
import { Link, NavLink, useSearchParams } from "react-router-dom";
import { sharingAccount } from "./sharing-client";
import {
  localSharingDevice,
  savedTransfers,
  transfersForWorkspace,
} from "./sharing-storage";
import { readSharedInbox, type OpenedSharedRecords } from "./sharing-inbox";
import { groupProfileVersions } from "./sharing-profile";
import { SharedProfileView } from "./sharing-profile-view";
import { decodeFile, type SharedDocument } from "./sharing-crypto";

export function SharedPatients({
  uid,
  role,
  path,
}: {
  uid: string;
  role: string;
  path: string;
}) {
  const [data, setData] = useState<OpenedSharedRecords>();
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useSearchParams();
  useEffect(() => {
    let live = true;
    void (async () => {
      await sharingAccount(uid);
      if (!["professional", "organization"].includes(role))
        throw Error("This workspace does not have a shared patient directory.");
      const saved = transfersForWorkspace(await savedTransfers(uid), uid, role);
      const opened = saved.length
        ? await readSharedInbox(uid, role, saved, await localSharingDevice(uid))
        : { profiles: [], documents: [] };
      await sharingAccount(uid);
      if (live) setData(opened);
    })().catch((e) => {
      if (live)
        setError(
          e instanceof Error ? e.message : "Unable to open shared records.",
        );
    });
    return () => {
      live = false;
    };
  }, [uid, role]);
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
      setError(
        "Sign in to this receiving account before opening the original.",
      );
    }
  }
  if (error)
    return (
      <section className="panel">
        <p role="alert">{error}</p>
      </section>
    );
  if (!data) return <p role="status">Opening saved shared records…</p>;
  const groups = groupProfileVersions(data.profiles);
  if (path === "patients") {
    const visible = groups.filter((g) =>
      `${g.versions.map((v) => v.snapshot.patient.name).join(" ")} ${g.profileId}`
        .toLowerCase()
        .includes(query.trim().toLowerCase()),
    );
    return (
      <section className="panel" aria-label="Shared patients">
        <h2>Shared patients</h2>
        <p>
          Profiles received by this workspace. Saved copies can be read offline;
          they do not confirm that sharing is still active.
        </p>
        <label>
          Search shared patients
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Name or shared profile ID"
          />
        </label>
        {!groups.length ? (
          <p>No shared profiles saved in this workspace yet.</p>
        ) : !visible.length ? (
          <p>No matching shared patients.</p>
        ) : (
          <div className="patient-directory-grid">
            {visible.map((g) => (
              <Link
                className="patient-directory-entry"
                key={g.profileId}
                to={`/${role}/patients/shared-${g.profileId}/overview`}
              >
                <strong>{g.versions[0].snapshot.patient.name}</strong>
                <span>
                  {g.versions[0].snapshot.patient.kind === "child"
                    ? "Child profile"
                    : "Patient profile"}{" "}
                  · {g.versions.length} saved version(s)
                </span>
                <span className="small record-id">
                  Shared profile ID: {g.profileId}
                </span>
              </Link>
            ))}
          </div>
        )}
      </section>
    );
  }
  const [, id, tab = "overview", extra] = path.split("/");
  const group = groups.find((g) => `shared-${g.profileId}` === id);
  if (
    !group ||
    extra ||
    !["overview", "prescriptions", "reports"].includes(tab)
  )
    return (
      <section className="panel">
        <h1>Shared profile unavailable</h1>
        <p>No matching shared profile is saved in this workspace.</p>
      </section>
    );
  const revision = search.get("version") || "";
  const selected = group.versions.find((v) => v.snapshot.revision === revision);
  return (
    <>
      <h1>
        {selected?.snapshot.patient.name ||
          group.versions[0].snapshot.patient.name}
      </h1>
      <p>Saved shared profile · Read-only</p>
      <nav className="tabs" aria-label="Patient sections">
        {(["overview", "prescriptions", "reports"] as const).map((t) => (
          <NavLink
            key={t}
            to={`/${role}/patients/${id}/${t}${revision ? `?version=${encodeURIComponent(revision)}` : ""}`}
          >
            {t[0].toUpperCase() + t.slice(1)}
          </NavLink>
        ))}
      </nav>
      <section className="panel">
        <label>
          Saved profile version
          <select
            aria-label="Saved profile version"
            value={selected ? revision : ""}
            onChange={(e) =>
              setSearch(e.target.value ? { version: e.target.value } : {}, {
                replace: true,
              })
            }
          >
            <option value="">Choose a version to review</option>
            {group.versions.map((v, i) => (
              <option key={v.snapshot.revision} value={v.snapshot.revision}>
                Version {i + 1} · Profile fields updated{" "}
                {new Date(v.snapshot.sourceUpdatedAt).toLocaleString()}
              </option>
            ))}
          </select>
        </label>
        {!selected && (
          <p>
            Select a saved version. Earlier versions and original files are
            preserved.
          </p>
        )}
        {selected && (
          <SharedProfileView
            selected={selected}
            documents={data.documents}
            download={download}
            tab={tab as "overview" | "prescriptions" | "reports"}
          />
        )}
      </section>
    </>
  );
}
