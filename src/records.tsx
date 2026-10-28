import {
  createContext,
  useContext,
  useCallback,
  useEffect,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Link, NavLink, Navigate, useNavigate } from "react-router-dom";
import { accountAuth } from "./auth";
import { RecordVault, type RecordWorkspace } from "./record-vault";
import type { LocalDocument, Patient } from "./records-model";
import { professionalSections, maternalSections } from "./workspace-spec";
import { profileContext } from "./ai/behavior";
import type { MotherProfile } from "./records-model";
import { CameraCapture } from "./camera-capture";
import { ReferralDrafts } from "./referral-drafts";
import { ProfileLinkPreview, TestAssignments } from "./workflow-tests";

type RecordsContext = {
  vault?: RecordVault;
  refresh: () => void;
  lock: () => void;
};
const Context = createContext<RecordsContext>({ refresh() {}, lock() {} });
export const useRecords = () => useContext(Context);
export function BloodGroupSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const groups = ["A+", "A-", "B+", "B-", "AB+", "AB-", "O+", "O-"];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)}>
      <option value="">Not recorded / Unknown</option>
      {value && !groups.includes(value) && (
        <option value={value}>{value} (previously recorded)</option>
      )}
      {groups.map((group) => (
        <option key={group} value={group}>
          {group}
        </option>
      ))}
    </select>
  );
}
export function useLocalCompanionProfile() {
  const { vault } = useContext(Context);
  return useCallback(
    async () => profileContext(await vault?.ownCompanionProfile()),
    [vault],
  );
}
export function MotherRecordsHome() {
  const load = useLocalCompanionProfile();
  const [profile, setProfile] = useState<Awaited<ReturnType<typeof load>>>();
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    let live = true;
    load()
      .then((value) => {
        if (live) {
          setProfile(value);
          setReady(true);
        }
      })
      .catch(() => {
        if (live) {
          setError(true);
          setReady(true);
        }
      });
    return () => {
      live = false;
    };
  }, [load]);
  return (
    <>
      <div className="page-title">
        <div>
          <h1>
            {profile?.name
              ? `Welcome ${profile.name.split(/\s+/)[0]}`
              : "Welcome"}
          </h1>
          <p className="home-subheading">A little care, every day.</p>
        </div>
      </div>
      <section className="panel">
        {!ready ? (
          <p>Opening your saved profile…</p>
        ) : error ? (
          <p>Open Profile Settings to connect your existing records.</p>
        ) : !profile ? (
          <p>No profile details added yet.</p>
        ) : (
          <>
            <h2 className="pregnancy-week">
              {profile.pregnancyWeeks !== undefined
                ? `Pregnancy week ${profile.pregnancyWeeks}`
                : "Pregnancy stage not recorded."}
            </h2>
            {profile.pregnancyWeeks !== undefined && (
              <p>Recorded {profile.recordedOn}</p>
            )}
          </>
        )}
      </section>
      <section className="panel">
        <h2>Educational suggestions</h2>
        <p>Explore topics in MatriSathi. Articles are pending review.</p>
        <Link className="button secondary" to="/mother/matrisathi">
          Open MatriSathi
        </Link>
      </section>
    </>
  );
}
export function MotherRecordProfile({
  email,
  onName,
}: {
  email: string;
  onName: (name: string) => void;
}) {
  return (
    <VaultGate>
      <MotherRecordForm email={email} onName={onName} />
    </VaultGate>
  );
}
export function MotherRecordForm({
  email,
  onName,
  patient: supplied,
  clinician = false,
  onSaved,
}: {
  email?: string;
  onName?: (name: string) => void;
  patient?: Patient;
  clinician?: boolean;
  onSaved?: (id: string) => void;
}) {
  const { vault, refresh } = useContext(Context);
  const patient = clinician
    ? supplied
    : vault!.data!.patients.find((p) => p.id === "self");
  useEffect(() => {
    if (patient?.name) onName?.(patient.name);
  }, [patient?.name, onName]);
  const [name, setName] = useState(patient?.name || "");
  const [birthDate, setBirthDate] = useState(patient?.birthDate || "");
  const [history, setHistory] = useState(patient?.history || "");
  const [profile, setProfile] = useState<MotherProfile>(
    patient?.profile || {
      bloodGroup: "",
      allergies: "",
      emergencyContact: "",
      emergencyPhone: "",
      guardian: "",
      guardianPhone: "",
      residence: "",
      username: "",
      profileCode: "",
    },
  );
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel record-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setStatus("");
        try {
          const id = await vault!.savePatient(
            {
              name,
              birthDate,
              history,
              profile,
              kind: "mother",
            },
            clinician ? patient?.id : "self",
          );
          refresh();
          onName?.(name.trim());
          setProfile(vault!.data!.patients.find((p) => p.id === id)!.profile!);
          setStatus("Profile saved encrypted on this device.");
          onSaved?.(id);
        } catch (e) {
          setError(message(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      <h2>Mother profile</h2>
      {email !== undefined && (
        <label>
          Email
          <input value={email} readOnly />
        </label>
      )}
      <label>
        Full name
        <input
          required
          value={name}
          maxLength={120}
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
        Recorded pregnancy week (optional)
        <input
          type="number"
          min={0}
          max={50}
          step={1}
          value={profile.pregnancyWeeks ?? ""}
          onChange={(e) =>
            setProfile({
              ...profile,
              pregnancyWeeks:
                e.target.value === "" ? undefined : Number(e.target.value),
            })
          }
        />
      </label>
      <label>
        Pregnancy week recorded on
        <input
          type="date"
          required={profile.pregnancyWeeks !== undefined}
          value={profile.recordedOn || ""}
          onChange={(e) =>
            setProfile({ ...profile, recordedOn: e.target.value })
          }
        />
      </label>
      {(
        [
          ["username", "Username"],
          ["bloodGroup", "Blood group (as recorded)"],
          ["allergies", "Allergies (as recorded)"],
          ["emergencyContact", "Emergency contact person"],
          ["emergencyPhone", "Emergency contact phone"],
          ["guardian", "Guardian name"],
          ["guardianPhone", "Guardian phone"],
          ["residence", "Residence"],
        ] as const
      ).map(([key, label]) => (
        <label key={key}>
          {label}
          {key === "bloodGroup" ? (
            <BloodGroupSelect
              value={profile.bloodGroup}
              onChange={(value) =>
                setProfile({ ...profile, bloodGroup: value })
              }
            />
          ) : (
            <input
              value={profile[key]}
              maxLength={
                key === "allergies" || key === "residence" ? 1000 : 120
              }
              onChange={(e) =>
                setProfile({ ...profile, [key]: e.target.value })
              }
            />
          )}
        </label>
      ))}
      <p className="small record-id">
        Profile code: {profile.profileCode || "Created when you save"}
      </p>
      {clinician && (
        <label>
          Medical history / profile notes (optional)
          <textarea
            maxLength={8000}
            value={history}
            onChange={(e) => setHistory(e.target.value)}
          />
        </label>
      )}
      <p className="small">
        This code and username are local until secure account linking is
        enabled. Entered health details are not professionally verified.
      </p>
      <button className="button primary" disabled={busy}>
        {busy
          ? "Saving…"
          : clinician
            ? patient
              ? "Save patient profile"
              : "Create patient profile"
            : "Save mother profile"}
      </button>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
    </form>
  );
}
export function RecordsProvider({
  uid,
  workspace,
  children,
}: {
  uid?: string;
  workspace: RecordWorkspace;
  children: ReactNode;
}) {
  const [vault] = useState(() =>
    uid
      ? new RecordVault(
          uid,
          async () => {
            if ((await accountAuth()).currentUser?.uid !== uid)
              throw Error("Sign in to the account that owns these records.");
          },
          workspace,
        )
      : undefined,
  );
  const [, update] = useState(0);
  const refresh = useCallback(() => update((n) => n + 1), []);
  const lock = () => {
    vault?.lock();
    refresh();
  };
  useEffect(() => {
    if (!vault) return;
    const clear = () => {
      vault.lock();
      update((n) => n + 1);
    };
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) window.location.reload();
    };
    window.addEventListener("pagehide", clear);
    window.addEventListener("pageshow", restore);
    return () => {
      vault.lock();
      window.removeEventListener("pagehide", clear);
      window.removeEventListener("pageshow", restore);
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
export function VaultGate({ children }: { children: ReactNode }) {
  const { vault, refresh } = useContext(Context);
  const [legacy, setLegacy] = useState(false);
  const [phrase, setPhrase] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    if (!vault || vault.data) return;
    vault
      .openOnDevice()
      .then((open) => {
        if (live) {
          setLegacy(!open);
          refresh();
        }
      })
      .catch((e) => {
        if (live) setError(message(e));
      });
    return () => {
      live = false;
    };
  }, [vault, attempt, refresh]);
  if (vault?.data) return children;
  if (!vault) return null;
  return (
    <section className="panel">
      <h2>
        {legacy ? "Connect your existing records" : "Opening your records"}
      </h2>
      {legacy && (
        <form
          className="record-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              await vault.unlock(phrase, false);
              await vault.enableDeviceAccess();
              setPhrase("");
              refresh();
            } catch (e) {
              vault.lock();
              setError(message(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Enter your previous vault passphrase once to keep your existing
            records and open them automatically on this device after sign-in.
          </p>
          <label>
            Previous vault passphrase
            <input
              type="password"
              required
              minLength={12}
              maxLength={512}
              value={phrase}
              onChange={(e) => setPhrase(e.target.value)}
            />
          </label>
          <button className="button" disabled={busy}>
            {busy ? "Connecting…" : "Keep records and continue"}
          </button>
        </form>
      )}
      {error && (
        <>
          <p role="alert">{error}</p>
          {!legacy && (
            <button
              className="button secondary"
              onClick={() => {
                setError("");
                setAttempt((n) => n + 1);
              }}
            >
              Try again
            </button>
          )}
        </>
      )}
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
        <button className="button primary" disabled={busy}>
          {busy ? "Saving…" : "Save profile"}
        </button>
        {!self && (
          <Link
            className="button cancel"
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
export function Documents({
  patient,
  kind,
}: {
  patient: Patient;
  kind: LocalDocument["kind"];
}) {
  const { vault, refresh } = useContext(Context);
  const [adding, setAdding] = useState(false);
  const [camera, setCamera] = useState(false);
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
        {!adding && !camera && (
          <div className="action-row">
            <button
              className="button secondary"
              onClick={() => {
                setCamera(false);
                setAdding(true);
              }}
            >
              Upload From Device
            </button>
            <button
              className="button secondary"
              onClick={() => setCamera(true)}
            >
              Take Photo
            </button>
          </div>
        )}
      </div>
      <p className="small muted">
        Encrypted on this device · Cloud uploads disabled
      </p>
      {camera && (
        <CameraCapture
          onCancel={() => setCamera(false)}
          onCapture={(photo) => {
            setFile(photo);
            setCamera(false);
            setAdding(true);
            setError("");
          }}
        />
      )}
      {adding && (
        <form className="record-form document-form" onSubmit={save}>
          <label>
            Document
            <input
              type="file"
              accept={
                camera
                  ? "image/jpeg,image/png,image/webp"
                  : "application/pdf,image/jpeg,image/png,image/webp"
              }
              capture={camera ? "environment" : undefined}
              required={!file}
              onChange={(e) => setFile(e.target.files?.[0])}
            />
          </label>
          {file && <p className="small">Selected: {file.name}</p>}
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
            <button className="button primary" disabled={busy || !file}>
              {busy ? "Saving…" : "Save document"}
            </button>
            <button
              type="button"
              className="button cancel"
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
function PatientAdd() {
  const [choice, setChoice] = useState("");
  const navigate = useNavigate();
  return (
    <>
      <div
        className="action-row patient-add-options"
        role="group"
        aria-label="Add patient options"
      >
        <button
          className="button secondary"
          aria-pressed={choice === "create"}
          onClick={() => setChoice("create")}
        >
          Create patient profile
        </button>
        <button
          className="button secondary"
          aria-pressed={choice === "load"}
          onClick={() => setChoice("load")}
        >
          Load profile
        </button>
        <button
          className="button secondary"
          aria-pressed={choice === "band"}
          onClick={() => setChoice("band")}
        >
          Sync NFC Band
        </button>
      </div>
      {choice === "create" && (
        <MotherRecordForm
          clinician
          onSaved={(id) =>
            navigate(`/professional/patients/${id}/overview`, { replace: true })
          }
        />
      )}
      {choice === "load" && <ProfileLinkPreview role="professional" />}
      {choice === "band" && (
        <section className="panel">
          <h2>Sync NFC Band</h2>
          <p>
            The MatriSync device will read the compact encrypted handoff over
            Bluetooth. Full profile retrieval requires authorized sharing. The
            device protocol and secure sharing are not connected yet.
          </p>
          <button className="button secondary" disabled>
            Connect MatriSync device
          </button>
        </section>
      )}
    </>
  );
}
function RecordContent({ path, self }: { path: string; self: boolean }) {
  const { vault } = useContext(Context);
  const [query, setQuery] = useState("");
  const [, id, tab = "overview", extra] = path.split("/");
  const data = vault!.data!;
  const patient = data.patients.find((p) => p.id === (self ? "self" : id));
  const title = self
    ? maternalSections.find((s) => s.id === id)?.title || "My Health"
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
          id === "reports" || id === "prescriptions" ? (
            <Documents key={id} patient={patient} kind={id} />
          ) : (
            <section className="panel">
              <h2>
                {maternalSections.find((s) => s.id === id)?.title || "Overview"}
              </h2>
              <p>{id === "overview" ? patient.name : "No records yet."}</p>
            </section>
          )
        ) : (
          <PatientForm self />
        )
      ) : !id ? (
        <>
          <TestAssignments accepted />
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
        <PatientAdd />
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
            patient.profile ? (
              <MotherRecordForm key={id} clinician patient={patient} />
            ) : (
              <PatientForm key={id} patient={patient} />
            )
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
                {patient.profile && (
                  <>
                    <div>
                      <dt>Username</dt>
                      <dd>{patient.profile.username}</dd>
                    </div>
                    <div>
                      <dt>Profile code</dt>
                      <dd className="record-id">
                        {patient.profile.profileCode}
                      </dd>
                    </div>
                  </>
                )}
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
          ) : tab === "referrals" ? (
            <ReferralDrafts key={id} patient={patient} />
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
  if (self) {
    const [, section, extra] = path.split("/");
    if (!section || ["vitals", "history", "visits"].includes(section))
      return <Navigate to="/mother/health/overview" replace />;
    if (["medications", "medicines"].includes(section))
      return <Navigate to="/mother/health/prescriptions" replace />;
    if (extra || !maternalSections.some((s) => s.id === section))
      return <p>No record is available at this address.</p>;
  }
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
            : "Open Patients to view your records."}
        </p>
      </section>
    </>
  );
}
