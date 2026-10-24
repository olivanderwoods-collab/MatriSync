import { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { BloodGroupSelect, Documents, useRecords, VaultGate } from "./records";
import type { Patient } from "./records-model";
import { childSections } from "./workspace-spec";

export function ChildRecords({ path }: { path: string }) {
  return (
    <VaultGate>
      <ChildContent key={path} path={path} />
    </VaultGate>
  );
}
function ChildForm({ patient }: { patient?: Patient }) {
  const { vault, refresh } = useRecords();
  const navigate = useNavigate();
  const [name, setName] = useState(patient?.name || "");
  const [date, setDate] = useState(patient?.birthDate || "");
  const [history, setHistory] = useState(patient?.history || "");
  const [details, setDetails] = useState(
    patient?.child || { sex: "", bloodGroup: "", allergies: "" },
  );
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <form
      className="panel record-form"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
          const id = await vault!.savePatient(
            { name, birthDate: date, history, kind: "child", child: details },
            patient?.id,
          );
          refresh();
          navigate(`/mother/children/${id}/overview`, { replace: true });
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to save.");
          setBusy(false);
        }
      }}
    >
      <h2>{patient ? "Edit child profile" : "New child profile"}</h2>
      <label>
        Child's full name
        <input
          required
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label>
        Date of birth
        <input
          required
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
        />
      </label>
      <label>
        Sex (as recorded)
        <select
          value={details.sex}
          onChange={(e) => setDetails({ ...details, sex: e.target.value })}
        >
          <option value="">Not recorded</option>
          <option>Female</option>
          <option>Male</option>
          <option>Other / unspecified</option>
        </select>
      </label>
      <label>
        Blood group (as recorded)
        <BloodGroupSelect
          value={details.bloodGroup}
          onChange={(bloodGroup) => setDetails({ ...details, bloodGroup })}
        />
      </label>
      <label>
        Allergies (as recorded)
        <input
          maxLength={1000}
          value={details.allergies}
          onChange={(e) =>
            setDetails({ ...details, allergies: e.target.value })
          }
        />
      </label>
      <label>
        Profile notes
        <textarea
          maxLength={8000}
          value={history}
          onChange={(e) => setHistory(e.target.value)}
        />
      </label>
      <p className="small">
        A separate child record in your account on this device. This does not
        connect another account or verify guardianship.
      </p>
      <div className="action-row">
        <button className="button primary" disabled={busy}>
          Save child profile
        </button>
        <Link className="button cancel" to="/mother/children">
          Cancel
        </Link>
      </div>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
function ChildContent({ path }: { path: string }) {
  const { vault } = useRecords();
  const [, id, tab = "overview", extra] = path.split("/");
  const children = vault!.data!.patients.filter(
    (p) => p.kind === "child" && p.parentId === "self",
  );
  const child = children.find((p) => p.id === id);
  if (id === "add" && !extra)
    return (
      <>
        <h1>Add child</h1>
        <ChildForm />
      </>
    );
  if (!id)
    return (
      <>
        <div className="page-title">
          <h1>Children</h1>
          <Link className="button secondary" to="/mother/children/add">
            Add child profile
          </Link>
        </div>
        <section className="panel">
          {children.length ? (
            children.map((p) => (
              <Link
                className="person-row"
                key={p.id}
                to={`/mother/children/${p.id}/overview`}
              >
                <strong>{p.name}</strong>
                <span>Born {p.birthDate}</span>
              </Link>
            ))
          ) : (
            <p>No child profiles added yet.</p>
          )}
        </section>
      </>
    );
  if (!child || extra)
    return <p>No child record is available at this address.</p>;
  return (
    <>
      <h1>{child.name}</h1>
      <nav className="tabs" aria-label="Child record tabs">
        {childSections.map((section) => (
          <NavLink key={section.id} to={`/mother/children/${id}/${section.id}`}>
            {section.title}
          </NavLink>
        ))}
      </nav>
      {tab === "edit" ? (
        <ChildForm patient={child} />
      ) : tab === "reports" || tab === "prescriptions" ? (
        <Documents key={tab} patient={child} kind={tab} />
      ) : tab === "overview" ? (
        <section className="panel">
          <div className="panel-heading">
            <h2>Child profile</h2>
            <Link className="text-link" to={`/mother/children/${id}/edit`}>
              Edit profile
            </Link>
          </div>
          <p>Date of birth: {child.birthDate}</p>
          <p>Sex: {child.child?.sex || "Not recorded"}</p>
          <p>Blood group: {child.child?.bloodGroup || "Not recorded"}</p>
          <p>Allergies: {child.child?.allergies || "Not recorded"}</p>
          <p className="preserve-lines">{child.history}</p>
          <p className="small record-id">Patient ID: {child.id}</p>
        </section>
      ) : tab === "vaccinations" || tab === "follow-up" ? (
        <section className="panel">
          <h2>{tab === "vaccinations" ? "Vaccinations" : "Follow-ups"}</h2>
          <p>Coming Soon</p>
          <p>
            {tab === "vaccinations"
              ? "Vaccination records and scheduling are not connected yet."
              : "Clinician-entered follow-ups will appear here when authorized sharing is connected."}
          </p>
        </section>
      ) : (
        <p>No record is available at this address.</p>
      )}
    </>
  );
}
