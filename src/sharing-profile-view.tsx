import { decodeFile, type SharedDocument } from "./sharing-crypto";
import {
  matchesProfileOriginal,
  type ReceivedProfile,
} from "./sharing-profile";
import type { OpenedSharedRecords } from "./sharing-inbox";
export function SharedProfileView({
  selected,
  documents,
  download,
  tab = "overview",
}: {
  selected: ReceivedProfile;
  documents: OpenedSharedRecords["documents"];
  download: (document: SharedDocument) => Promise<void>;
  tab?: "overview" | "reports" | "prescriptions";
}) {
  const snapshot = selected.snapshot;
  const references = snapshot.documents.filter(
    (d) => tab === "overview" || d.kind === tab,
  );
  return (
    <article data-testid="shared-profile-view">
      <h3>{snapshot.patient.name}</h3>
      <p className="record-id">Shared profile ID: {snapshot.profileId}</p>
      <p>
        Profile fields updated:{" "}
        {new Date(snapshot.sourceUpdatedAt).toLocaleString()}
      </p>
      <p>Saved on this device: {new Date(selected.savedAt).toLocaleString()}</p>
      <p>
        Versions are ordered by receipt, not clinical authority. Review the
        recorded dates; a later arrival is not proof of newer clinical
        information.
      </p>
      {tab === "overview" && (
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
      )}
      {snapshot.patient.parentProfileId && (
        <p>
          Linked parent identity recorded. Access to the parent's profile is a
          separate connection.
        </p>
      )}
      <h4>
        {tab === "overview"
          ? "Original document references"
          : tab === "reports"
            ? "Reports"
            : "Prescriptions"}
      </h4>
      {!references.length && <p>No document references in this version.</p>}
      {references.map((ref) => {
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
                Original not received. This reference does not contain the file.
              </p>
            )}
          </div>
        );
      })}
    </article>
  );
}
