import { useState } from "react";
import { VaultGate, useRecords } from "./records";
import {
  accountProfileFields,
  type AccountProfileKind,
} from "./account-profile-model";

export function AccountProfileEditor({
  kind,
  email,
}: {
  kind: AccountProfileKind;
  email: string;
}) {
  return (
    <VaultGate>
      <ProfileForm kind={kind} email={email} />
    </VaultGate>
  );
}
function ProfileForm({
  kind,
  email,
}: {
  kind: AccountProfileKind;
  email: string;
}) {
  const { vault, refresh } = useRecords();
  const saved = vault!.data!.accountProfiles?.[kind];
  const [fields, setFields] = useState<Record<string, string>>(
    saved?.fields || {},
  );
  const [file, setFile] = useState<File>();
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    setError("");
    try {
      const { bytes, credential } = await vault!.accountCredential(kind);
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = credential.name;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus("Downloaded copy is outside encrypted app storage.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not download.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <form
      className="panel record-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setStatus("");
        setError("");
        try {
          await vault!.saveAccountProfile(kind, fields, file);
          refresh();
          setFile(undefined);
          setStatus("Profile saved encrypted on this device.");
        } catch (e) {
          setError(
            e instanceof Error ? e.message : "Could not save the profile.",
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>
        {kind === "professional" ? "Professional details" : "Facility details"}
      </h2>
      <label>
        Account email
        <input value={email} readOnly />
      </label>
      {accountProfileFields[kind].map(([key, label]) => {
        const options =
          key === "profession"
            ? ["Doctor", "Nurse", "ANM", "GNM", "Other healthcare professional"]
            : key === "facilityType"
              ? ["Government", "Private", "NGO / charitable", "Other"]
              : undefined;
        return (
          <label key={key}>
            {label}
            {options ? (
              <select
                value={fields[key] || ""}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              >
                <option value="">Select</option>
                {options.map((option) => (
                  <option key={option}>{option}</option>
                ))}
              </select>
            ) : (
              <input
                required={key === "name"}
                type={
                  key === "birthDate" || key === "registrationValidUntil"
                    ? "date"
                    : key === "email"
                      ? "email"
                      : key === "experience"
                        ? "number"
                        : "text"
                }
                min={key === "experience" ? 0 : undefined}
                max={key === "experience" ? 99 : undefined}
                maxLength={key === "name" ? 120 : 1000}
                value={fields[key] || ""}
                onChange={(e) =>
                  setFields({ ...fields, [key]: e.target.value })
                }
              />
            )}
          </label>
        );
      })}
      <label>
        {kind === "professional"
          ? "Government ID / credential document (optional)"
          : "Facility registration document (optional)"}
        <input
          type="file"
          accept="application/pdf,image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => setFile(e.target.files?.[0])}
        />
      </label>
      <p className="small">
        PDF, JPG, PNG or WebP · Up to 10 MB. Stored encrypted on this device;
        not submitted for verification.
      </p>
      {saved?.credential && (
        <p>
          Saved document: {saved.credential.name}{" "}
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => void download()}
          >
            Download saved document
          </button>
        </p>
      )}
      <p className="small">
        Registration and affiliation: Not verified. Saving details does not
        grant clinical permissions or verify a facility relationship.
      </p>
      {saved && (
        <p className="small record-id">Local profile code: {saved.code}</p>
      )}
      <button className="button primary" disabled={busy}>
        {busy
          ? "Saving…"
          : kind === "professional"
            ? "Save professional profile"
            : "Save facility profile"}
      </button>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
