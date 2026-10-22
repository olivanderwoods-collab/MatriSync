import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";
import { accountAuth } from "./auth";
import { RecordVault } from "./record-vault";
import type { LocalDocument, Patient } from "./records-model";
import { professionalSections, maternalSections } from "./workspace-spec";

type RecordsContext = {
  vault?: RecordVault;
  refresh: () => void;
  lock: () => void;
};
const Context = createContext<RecordsContext>({ refresh() {}, lock() {} });
export function RecordsProvider({
  uid,
  children,
}: {
  uid?: string;
  children: ReactNode;
}) {
  const [vault] = useState(() =>
    uid
      ? new RecordVault(uid, async () => {
          if ((await accountAuth()).currentUser?.uid !== uid)
            throw Error("Sign in to the account that owns these records.");
        })
      : undefined,
  );
  const [, update] = useState(0);
  const refresh = () => update((n) => n + 1);
  const lock = () => {
    vault?.lock();
    refresh();
  };
  useEffect(() => {
    if (!vault) return;
    let lastActivity = Date.now();
    const activity = () => {
      lastActivity = Date.now();
    };
    const clear = () => {
      vault.lock();
      update((n) => n + 1);
    };
    const timer = window.setInterval(() => {
      if (vault.data && Date.now() - lastActivity >= 5 * 60_000) clear();
    }, 10_000);
    window.addEventListener("pointerdown", activity);
    window.addEventListener("keydown", activity);
    window.addEventListener("pagehide", clear);
    return () => {
      vault.lock();
      clearInterval(timer);
      window.removeEventListener("pointerdown", activity);
      window.removeEventListener("keydown", activity);
      window.removeEventListener("pagehide", clear);
    };
  }, [vault]);
  return (
    <Context.Provider value={{ vault, refresh, lock }}>
      {children}
    </Context.Provider>
  );
}
function message(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Unable to complete this action.";
}
function VaultGate({ children }: { children: ReactNode }) {
  const { vault, refresh } = useContext(Context);
  const [exists, setExists] = useState<boolean>();
  const [passphrase, setPassphrase] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    vault
      ?.exists()
      .then((value) => {
        if (live) setExists(value);
      })
      .catch((error) => {
        if (live) setError(message(error));
      });
    return () => {
      live = false;
    };
  }, [vault]);
  if (!vault) return null;
  if (vault.data) return children;
  async function unlock(event: FormEvent) {
    event.preventDefault();
    setError("");
    if (exists === false && passphrase !== confirm) {
      setError("The passphrases do not match.");
      return;
    }
    setBusy(true);
    try {
      await vault!.unlock(passphrase, !exists);
      setExists(true);
      refresh();
    } catch (error) {
      setError(message(error));
    } finally {
      setPassphrase("");
      setConfirm("");
      setBusy(false);
    }
  }
  return (
    <section className="panel vault-gate">
      <h2>
        {exists === false ? "Set up encrypted records" : "Unlock records"}
      </h2>
      <p>
        Your records and documents stay on this device. The vault locks after
        five minutes without activity, on reload and when you leave your
        account.
      </p>
      <p className="small">
        Keep this separate passphrase safe. It cannot be recovered. Clearing
        browser data or losing this device can permanently remove local records
        and documents. Firebase backup is not connected yet.
      </p>
      <form onSubmit={unlock}>
        <label>
          Vault passphrase
          <input
            type="password"
            autoComplete={exists ? "current-password" : "new-password"}
            required
            minLength={12}
            maxLength={512}
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
          />
        </label>
        {exists === false && (
          <label>
            Confirm vault passphrase
            <input
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </label>
        )}
        {error && <p role="alert">{error}</p>}
        <button className="button" disabled={busy || exists === undefined}>
          {busy ? "Opening…" : exists === false ? "Create vault" : "Unlock"}
        </button>
      </form>
    </section>
  );
}
function PatientForm({
  patient,
  self = false,
}: {
  patient?: Patient;
  self?: boolean;
}) {
  const { vault, refresh } = useContext(Context);
  const navigate = useNavigate();
  const [name, setName] = useState(patient?.name ?? "");
  const [birthDate, setBirthDate] = useState(patient?.birthDate ?? "");
  const [history, setHistory] = useState(patient?.history ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const id = await vault!.savePatient(
        { name, birthDate, history },
        self ? "self" : patient?.id,
      );
      refresh();
      if (!self)
        navigate(`/professional/patients/${id}/overview`, { replace: true });
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className="panel record-form" onSubmit={save}>
      <h2>
        {patient
          ? "Edit profile"
          : self
            ? "Your record profile"
            : "Patient details"}
      </h2>
      <label>
        Full name
        <input
          required
          maxLength={120}
          autoComplete="off"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Date of birth (optional)
        <input
          type="date"
          value={birthDate}
          onChange={(e) => setBirthDate(e.target.value)}
        />
      </label>
      <label>
        Medical history / profile notes (optional)
        <textarea
          rows={4}
          maxLength={8000}
          value={history}
          onChange={(e) => setHistory(e.target.value)}
        />
      </label>
      {error && <p role="alert">{error}</p>}
      <div className="action-row">
        <button className="button" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        {!self && (
          <Link
            className="button secondary"
            to={
              patient
                ? `/professional/patients/${patient.id}/overview`
                : "/professional/patients"
            }
          >
            Cancel
          </Link>
        )}
      </div>
    </form>
  );
}
function Documents({
  patient,
  kind,
}: {
  patient: Patient;
  kind: LocalDocument["kind"];
}) {
  const { vault, refresh } = useContext(Context);
  const [adding, setAdding] = useState(false);
  const [file, setFile] = useState<File>();
  const [source, setSource] = useState("");
  const [date, setDate] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const files = vault!.data!.documents.filter(
    (d) => d.patientId === patient.id && d.kind === kind,
  );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (!file) return;
    setBusy(true);
    setError("");
    setStatus("");
    try {
      await vault!.addDocument(patient.id, kind, file, source, date);
      refresh();
      setFile(undefined);
      setSource("");
      setDate("");
      setAdding(false);
      setStatus("Saved encrypted on this device.");
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  async function download(id: string) {
    setError("");
    setBusy(true);
    try {
      const { bytes, doc } = await vault!.document(id);
      // Download only: do not execute/render potentially active user PDFs in the app.
      const url = URL.createObjectURL(
        new Blob([bytes], { type: "application/octet-stream" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setStatus(
        "Downloaded copy is no longer protected by the MatriSync vault.",
      );
    } catch (error) {
      setError(message(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="panel">
      <div className="panel-heading">
        <h2>{kind === "reports" ? "Reports" : "Prescriptions"}</h2>
        {!adding && (
          <button className="button secondary" onClick={() => setAdding(true)}>
            {kind === "reports" ? "Add Report" : "Upload prescription"}
          </button>
        )}
      </div>
      <p className="small muted">
        Encrypted on this device · Cloud uploads disabled
      </p>
      {adding && (
        <form className="record-form document-form" onSubmit={save}>
          <label>
            Document
            <input
              type="file"
              accept="application/pdf,image/jpeg,image/png,image/webp"
              required
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          <p className="small">PDF, JPG, PNG or WebP · Up to 10 MB</p>
          <label>
            Issuing facility / source (optional)
            <input
              maxLength={200}
              value={source}
              onChange={(e) => setSource(e.target.value)}
            />
          </label>
          <label>
            Document date (optional)
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </label>
          <div className="action-row">
            <button className="button" disabled={busy || !file}>
              {busy ? "Saving…" : "Save document"}
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setFile(undefined);
                setError("");
              }}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!files.length && !adding && <p>No documents saved.</p>}
      <div className="document-list">
        {files.map((d) => (
          <article className="local-document" key={d.id}>
            <div>
              <h3>{d.name}</h3>
              <p>
                {d.reportDate || "Date not supplied"} ·{" "}
                {d.source || "Source not supplied"}
              </p>
              <p className="small">
                Uploaded copy · Source not verified ·{" "}
                {(d.size / 1024).toFixed(1)} KB
              </p>
            </div>
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => void download(d.id)}
            >
              Download Document
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}
function RecordContent({ path, self }: { path: string; self: boolean }) {
  const { vault, lock } = useContext(Context);
  const [query, setQuery] = useState("");
  const [, id, tab = "overview", extra] = path.split("/");
  const data = vault!.data!;
  const patient = data.patients.find((p) => p.id === (self ? "self" : id));
  const title = self
    ? id === "prescriptions"
      ? "Prescriptions"
      : "Reports"
    : !id
      ? "Patients"
      : id === "add"
        ? "Add patient"
        : (patient?.name ?? "Patient not found");
  return (
    <>
      <div className="page-title">
        <div>
          <h1>{title}</h1>
          <p className="small muted">Private records · This device</p>
        </div>
        <button className="button secondary" onClick={lock}>
          Lock records
        </button>
      </div>
      {self && (
        <nav className="tabs" aria-label="Section tabs">
          {maternalSections.map((section) => (
            <NavLink key={section.id} to={`/mother/health/${section.id}`}>
              {section.title}
            </NavLink>
          ))}
        </nav>
      )}
      {self ? (
        patient ? (
          <Documents
            key={id}
            patient={patient}
            kind={id as LocalDocument["kind"]}
          />
        ) : (
          <PatientForm self />
        )
      ) : !id ? (
        <>
          <div className="patient-tools">
            <label>
              Search Patient
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Name or patient ID"
              />
            </label>
            <Link className="button secondary" to="/professional/patients/add">
              Add patient
            </Link>
          </div>
          <section className="panel">
            <div className="patient-directory-grid">
              {data.patients
                .filter(
                  (p) =>
                    p.id !== "self" &&
                    `${p.name} ${p.id}`
                      .toLowerCase()
                      .includes(query.trim().toLowerCase()),
                )
                .map((p) => (
                  <Link
                    className="patient-directory-entry"
                    key={p.id}
                    to={`/professional/patients/${p.id}/overview`}
                  >
                    <strong>{p.name}</strong>
                    <span className="small record-id">Patient ID: {p.id}</span>
                  </Link>
                ))}
            </div>
            {!data.patients.some((p) => p.id !== "self") ? (
              <p>No patients added yet.</p>
            ) : (
              query &&
              !data.patients.some(
                (p) =>
                  p.id !== "self" &&
                  `${p.name} ${p.id}`
                    .toLowerCase()
                    .includes(query.trim().toLowerCase()),
              ) && <p>No matching patients.</p>
            )}
          </section>
        </>
      ) : id === "register" || id === "consultation" ? (
        <Navigate
          to={
            id === "register"
              ? "/professional/patients/add"
              : "/professional/patients"
          }
          replace
        />
      ) : id === "add" &&
        !extra &&
        (tab === "overview" || tab === "profile") ? (
        <PatientForm />
      ) : !patient || extra ? (
        <p>No record is available at this address.</p>
      ) : ["vitals", "visits", "history", "medications"].includes(tab) ? (
        <Navigate
          to={`/professional/patients/${id}/${tab === "medications" ? "prescriptions" : "overview"}`}
          replace
        />
      ) : (
        <>
          <nav className="tabs" aria-label="Section tabs">
            {professionalSections.map((s) => (
              <NavLink key={s.id} to={`/professional/patients/${id}/${s.id}`}>
                {s.title}
              </NavLink>
            ))}
          </nav>
          {tab === "edit" ? (
            <PatientForm key={id} patient={patient} />
          ) : tab === "overview" ? (
            <section className="panel">
              <div className="panel-heading">
                <h2>Profile</h2>
                <Link
                  className="text-link"
                  to={`/professional/patients/${id}/edit`}
                >
                  Edit profile
                </Link>
              </div>
              <dl className="record-details">
                <div>
                  <dt>Full name</dt>
                  <dd>{patient.name}</dd>
                </div>
                <div>
                  <dt>Date of birth</dt>
                  <dd>{patient.birthDate || "Not supplied"}</dd>
                </div>
                <div>
                  <dt>Medical history / profile notes</dt>
                  <dd className="preserve-lines">
                    {patient.history || "Not supplied"}
                  </dd>
                </div>
              </dl>
              <p className="small muted">
                Entered in this account · Updated{" "}
                {new Date(patient.updatedAt).toLocaleString()}
              </p>
            </section>
          ) : tab === "reports" || tab === "prescriptions" ? (
            <Documents key={`${id}/${tab}`} patient={patient} kind={tab} />
          ) : (
            <section className="panel">
              <h2>
                {professionalSections.find((s) => s.id === tab)?.title ??
                  "Unavailable section"}
              </h2>
              <p>
                Clinical scheduling, referral approval and facility sharing are
                not connected yet.
              </p>
            </section>
          )}
        </>
      )}
    </>
  );
}
export function LocalRecords({
  path,
  self = false,
}: {
  path: string;
  self?: boolean;
}) {
  return (
    <VaultGate>
      <RecordContent key={path} path={path} self={self} />
    </VaultGate>
  );
}
export function RecordsHome() {
  const { vault } = useContext(Context);
  return (
    <>
      <div className="page-title">
        <h1>Welcome back.</h1>
      </div>
      <section className="panel">
        <h2>Patients</h2>
        <p>
          {vault?.data
            ? `${vault.data.patients.filter((p) => p.id !== "self").length} patients on this device`
            : "Open Patients to unlock your records."}
        </p>
      </section>
    </>
  );
}
