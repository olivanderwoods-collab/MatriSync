import {
  createContext,
  useContext,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { VerificationTests, SavedTestCopies } from "./verification-tests";
import {
  actorNames,
  applyTestCommand,
  emptyTestState,
  hasTestAccess,
  staff,
  type Actor,
  type Command,
  type TestState,
} from "./workflow-test-model";
export const workflowTestsEnabled =
  import.meta.env.DEV || import.meta.env.MODE === "demo";
const Context = createContext<{
  state: TestState;
  run: (actor: Actor, command: Command) => void;
  reset: () => void;
}>(null!);
export function WorkflowTestProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState(emptyTestState);
  return (
    <Context.Provider
      value={{
        state,
        run: (actor, command) =>
          setState(applyTestCommand(state, actor, command)),
        reset: () => setState(emptyTestState()),
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function TestLink({ role }: { role: string }) {
  return workflowTestsEnabled ? (
    <Link className="button secondary" to={`/${role}/patients/test`}>
      Test linking &amp; assignment
    </Link>
  ) : null;
}
function TestLoadForm({ actor }: { actor: Actor }) {
  const { run } = useContext(Context);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  return (
    <form
      className="panel record-form"
      onSubmit={(e) => {
        e.preventDefault();
        setError("");
        setStatus("");
        const data = new FormData(e.currentTarget);
        try {
          run(actor, {
            type: "load",
            username: String(data.get("username")),
            code: String(data.get("code")),
          });
          setStatus(
            actor === "mother" || actor === "mother2"
              ? "Test profile claimed. No clinical account was linked."
              : "Test profile loaded. No clinical account was linked.",
          );
        } catch (e) {
          setError(e instanceof Error ? e.message : "Unable to load.");
        }
      }}
    >
      <h2>Load profile · Synthetic test</h2>
      <p>
        Fixed fictional identities only. Verified test clinicians can use
        test.mother / TEST-M-001 directly. Mothers can claim an unclaimed
        clinician-created test profile. Permanent identifiers cannot override
        revocation or an existing owner.
      </p>
      <label>
        Username
        <input required name="username" autoComplete="off" />
      </label>
      <label>
        Profile code
        <input required name="code" autoComplete="off" />
      </label>
      <button className="button primary">Load test profile</button>
      {status && <p role="status">{status}</p>}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
export function ProfileLinkPreview({ role }: { role: string }) {
  return (
    <>
      <TestLoadForm actor={role === "mother" ? "mother" : "doctor"} />
      <TestLink role={role} />
    </>
  );
}
export function TestAssignments({ accepted = false }: { accepted?: boolean }) {
  const { state, run } = useContext(Context);
  const [error, setError] = useState("");
  const profiles = state.profiles.filter((p) =>
    accepted
      ? hasTestAccess(state, "doctor", p.id)
      : state.assignments.some(
          (a) =>
            a.patient === p.id &&
            a.staff === "doctor" &&
            a.status === "pending",
        ),
  );
  if (!profiles.length) return null;
  return (
    <section className="panel">
      <h2>
        {accepted
          ? "Synced test patients"
          : "Patient assignments · Synthetic test"}
      </h2>
      <p className="small">
        Test Doctor only · Memory-only workflow, no live account sharing.
      </p>
      {profiles.map((p) => (
        <article className="local-document" key={p.id}>
          <div>
            <strong>{accepted ? p.name : "Patient assignment"}</strong>
            <p className="record-id">{p.code}</p>
          </div>
          {accepted ? (
            <Link
              className="button secondary"
              to={`/professional/patients/test/${p.id}/overview`}
            >
              Open test profile
            </Link>
          ) : (
            <button
              className="button primary"
              onClick={() => {
                try {
                  run("doctor", { type: "accept", patient: p.id });
                  setError("");
                } catch (e) {
                  setError(
                    e instanceof Error ? e.message : "Unable to accept.",
                  );
                }
              }}
            >
              Accept
            </button>
          )}
        </article>
      ))}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
export function WorkflowTests({ role, path }: { role: string; path: string }) {
  const { state, run, reset } = useContext(Context);
  const testPatients = state.profiles;
  const [actor, setActor] = useState<Actor>(
    role === "professional"
      ? "doctor"
      : role === "organization"
        ? "organization"
        : "mother",
  );
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const navigate = useNavigate();
  const base = `/${role}/patients/test`;
  const [, , id, tab = "overview"] = path.split("/");
  const patient = testPatients.find((p) => p.id === id);
  function act(command: Command) {
    try {
      run(actor, command);
      setError("");
      setStatus("Test change saved for this session only.");
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Test action failed.");
      setStatus("");
      return false;
    }
  }
  function submit(
    e: FormEvent<HTMLFormElement>,
    command: (data: FormData) => Command,
  ) {
    e.preventDefault();
    const form = e.currentTarget;
    if (act(command(new FormData(form)))) form.reset();
  }
  const accessible = patient && hasTestAccess(state, actor, patient.id);
  return (
    <>
      <section className="notice test-workspace">
        <div>
          <strong>Synthetic workflow test</strong>
          <p>
            Fictional identities only. Changes stay in memory and clear on
            reload or logout. No real profile, cloud service or device is
            connected.
          </p>
          <label>
            Test actor
            <select
              value={actor}
              onChange={(e) => {
                setActor(e.target.value as Actor);
                setError("");
                setStatus("");
                navigate(base);
              }}
            >
              {(Object.keys(actorNames) as Actor[]).map((a) => (
                <option key={a} value={a}>
                  {actorNames[a]}
                  {a === "nurse" || a === "anm" ? " · Caregiver" : ""}
                </option>
              ))}
            </select>
          </label>
          <button
            className="text-button"
            onClick={() => {
              reset();
              setStatus("Test data reset.");
              setError("");
              navigate(base);
            }}
          >
            Reset test
          </button>
        </div>
      </section>
      {error && <p role="alert">{error}</p>}
      {status && <p role="status">{status}</p>}
      {!id ? (
        <>
          <h1>Test patients</h1>
          <VerificationTests state={state} actor={actor} act={act} />
          <SavedTestCopies state={state} actor={actor} act={act} />
          {actor !== "organization" && actor !== "unverified-facility" && (
            <TestLoadForm actor={actor} />
          )}
          {actor === "doctor" && (
            <form
              className="panel record-form"
              onSubmit={(e) =>
                submit(e, (d) => ({
                  type: "create-patient",
                  name: String(d.get("name")),
                  username: String(d.get("username")),
                }))
              }
            >
              <h2>Create unclaimed test profile</h2>
              <p>
                Use fictional details only. Switch to a Mother actor to claim
                the generated username/code.
              </p>
              <label>
                Test patient name
                <input name="name" required maxLength={120} />
              </label>
              <label>
                Test username
                <input name="username" required maxLength={40} />
              </label>
              <button className="button primary">Create test profile</button>
              {testPatients
                .filter((p) => p.createdBy === "doctor")
                .map((p) => (
                  <p className="record-id" key={p.id}>
                    {p.username} / {p.code} ·{" "}
                    {p.owner ? "Claimed" : "Unclaimed"}
                  </p>
                ))}
            </form>
          )}
          {actor === "organization" && (
            <form
              className="panel record-form"
              onSubmit={(e) =>
                submit(e, (d) => ({
                  type: "request",
                  username: String(d.get("username")),
                  code: String(d.get("code")),
                }))
              }
            >
              <h2>Add patient</h2>
              <p>
                Use test.mother / TEST-M-001 or test.child / TEST-C-001. The
                mother must approve the request.
              </p>
              <label>
                Username
                <input name="username" required autoComplete="off" />
              </label>
              <label>
                Profile code
                <input name="code" required autoComplete="off" />
              </label>
              <button className="button">Request test link</button>
              <button type="button" className="button secondary" disabled>
                Sync NFC Band · Device not connected
              </button>
            </form>
          )}
          {(actor === "mother" || actor === "mother2") && (
            <section className="panel">
              <h2>Connection requests</h2>
              {!state.grants.length && (
                <p>
                  No requests yet. Switch the test actor to a doctor or facility
                  to request a link.
                </p>
              )}
              {state.grants
                .filter((g) => hasTestAccess(state, actor, g.patient))
                .map((g) => (
                  <article
                    className="local-document"
                    key={`${g.patient}/${g.target}`}
                  >
                    <div>
                      <strong>
                        {actorNames[g.target]} ·{" "}
                        {testPatients.find((p) => p.id === g.patient)?.name}
                      </strong>
                      <p>{g.status}</p>
                    </div>
                    {g.status === "requested" && (
                      <button
                        className="button"
                        onClick={() =>
                          act({
                            type: "consent",
                            patient: g.patient,
                            target: g.target,
                            approve: true,
                          })
                        }
                      >
                        Approve link
                      </button>
                    )}
                    {g.status !== "revoked" && (
                      <button
                        className="button secondary"
                        onClick={() =>
                          act({
                            type: "consent",
                            patient: g.patient,
                            target: g.target,
                            approve: false,
                          })
                        }
                      >
                        {g.status === "requested" ? "Decline" : "Revoke link"}
                      </button>
                    )}
                  </article>
                ))}
            </section>
          )}
          {staff.includes(actor as (typeof staff)[number]) &&
            state.assignments
              .filter((a) => a.staff === actor && a.status === "pending")
              .map((a) => (
                <section className="panel" key={a.patient}>
                  <h2>Patient assignment</h2>
                  <p>
                    Test profile{" "}
                    {testPatients.find((p) => p.id === a.patient)?.code} ·
                    Clinical contents remain unavailable until acceptance.
                  </p>
                  <button
                    className="button"
                    onClick={() => act({ type: "accept", patient: a.patient })}
                  >
                    Accept assignment
                  </button>
                </section>
              ))}
          <section className="panel">
            <h2>Accessible patients</h2>
            {!testPatients.some((p) => hasTestAccess(state, actor, p.id)) && (
              <p>No accepted patient links yet.</p>
            )}
            {testPatients
              .filter((p) => hasTestAccess(state, actor, p.id))
              .map((p) => (
                <Link
                  className="person-row"
                  key={p.id}
                  to={`${base}/${p.id}/overview`}
                >
                  <strong>{p.name}</strong>
                  <span>{p.code}</span>
                </Link>
              ))}
          </section>
        </>
      ) : !accessible ? (
        <section className="panel">
          <h1>Patient access unavailable</h1>
          <p>An approved link or accepted facility assignment is required.</p>
          <Link to={base}>Back to test patients</Link>
        </section>
      ) : (
        <>
          <h1>{patient.name}</h1>
          <p>{patient.code} · Synthetic profile</p>
          <nav className="tabs" aria-label="Patient tabs">
            {[
              "overview",
              "prescriptions",
              "reports",
              "referrals",
              "follow-up",
              ...(actor === "organization" ? ["staff"] : []),
              "activity",
            ].map((t) => (
              <NavLink key={t} to={`${base}/${id}/${t}`}>
                {
                  (
                    {
                      overview: "Overview",
                      prescriptions: "Prescriptions",
                      reports: "Reports",
                      referrals: "Referrals",
                      "follow-up": "Follow-ups",
                      staff: "Assigned Staff",
                      activity: "Activity",
                    } as Record<string, string>
                  )[t]
                }
              </NavLink>
            ))}
          </nav>
          {tab === "overview" && (
            <section className="panel">
              <h2>Profile</h2>
              <p>
                The mother controls her profile and connections. The facility
                controls only its staff assignments.
              </p>
              <p>Username: {patient.username}</p>
              {staff.includes(actor as (typeof staff)[number]) && (
                <button
                  className="button secondary"
                  onClick={() => act({ type: "save-copy", patient: id })}
                >
                  Save test copy for offline reading
                </button>
              )}
            </section>
          )}
          {tab === "staff" && actor === "organization" && (
            <section className="panel">
              <h2>Assign or revoke staff access</h2>
              {staff.map((s) => {
                const assignment = state.assignments.find(
                  (a) => a.patient === id && a.staff === s,
                );
                return (
                  <article className="local-document" key={s}>
                    <div>
                      <strong>{actorNames[s]}</strong>
                      <p>
                        {s === "doctor"
                          ? "Doctor · Clinical permissions"
                          : "Caregiver · Reports and procedures, no digital prescriptions"}
                      </p>
                      <p>{assignment?.status || "Not assigned"}</p>
                    </div>
                    {!assignment || assignment.status === "revoked" ? (
                      <button
                        className="button"
                        onClick={() =>
                          act({ type: "assign", patient: id, staff: s })
                        }
                      >
                        Assign staff
                      </button>
                    ) : (
                      <button
                        className="button secondary"
                        onClick={() =>
                          act({ type: "revoke", patient: id, staff: s })
                        }
                      >
                        Revoke access
                      </button>
                    )}
                  </article>
                );
              })}
            </section>
          )}
          {(tab === "reports" || tab === "prescriptions") && (
            <section className="panel">
              <h2>{tab === "reports" ? "Reports" : "Prescriptions"}</h2>
              {state.documents
                .filter(
                  (d) =>
                    d.patient === id &&
                    (tab === "reports"
                      ? d.kind === "report"
                      : d.kind !== "report"),
                )
                .map((d) => (
                  <article className="local-document" key={d.id}>
                    <div>
                      <p>{d.text}</p>
                      <small>
                        {actorNames[d.author]} ·{" "}
                        {d.kind === "prescription"
                          ? "Test digital prescription"
                          : "Test document copy"}
                      </small>
                    </div>
                  </article>
                ))}
              {actor !== "organization" &&
                (tab === "prescriptions"
                  ? actor === "mother" ||
                    actor === "mother2" ||
                    actor === "doctor"
                  : actor !== "mother" && actor !== "mother2") && (
                  <>
                    <button
                      className="button secondary"
                      onClick={() =>
                        act({
                          type: "document",
                          patient: id,
                          kind: tab === "reports" ? "report" : "copy",
                          text: "Synthetic document copy · No clinical values",
                        })
                      }
                    >
                      Add sample{" "}
                      {tab === "reports" ? "report" : "prescription copy"}
                    </button>
                    {actor === "doctor" && tab === "prescriptions" && (
                      <form
                        className="record-form"
                        onSubmit={(e) =>
                          submit(e, (d) => ({
                            type: "document",
                            patient: id,
                            kind: "prescription",
                            text: String(d.get("text")),
                          }))
                        }
                      >
                        <label>
                          Test digital prescription
                          <textarea
                            name="text"
                            required
                            maxLength={2000}
                            placeholder="Synthetic text only"
                          />
                        </label>
                        <button className="button">
                          Save test prescription
                        </button>
                      </form>
                    )}
                  </>
                )}
            </section>
          )}
          {tab === "referrals" && (
            <section className="panel">
              <h2>Referrals</h2>
              <p>
                Doctor creates and approves. Organization initiates and
                transfers the handoff through the MatriSync device.
              </p>
              {actor === "doctor" && (
                <form
                  className="record-form"
                  onSubmit={(e) =>
                    submit(e, (d) => ({
                      type: "refer",
                      patient: id,
                      reason: String(d.get("reason")),
                    }))
                  }
                >
                  <label>
                    Reason for test referral
                    <textarea name="reason" required maxLength={2000} />
                  </label>
                  <label className="check-row">
                    <input type="checkbox" required />I reviewed this synthetic
                    referral.
                  </label>
                  <button className="button">
                    Create approved test referral
                  </button>
                  <p className="small">
                    No AI summary or clinical validation is generated.
                  </p>
                </form>
              )}
              {state.referrals
                .filter((r) => r.patient === id)
                .map((r) => (
                  <article className="local-document" key={r.id}>
                    <div>
                      <p>{r.reason}</p>
                      <strong>
                        {r.status === "approved"
                          ? "Clinician approved"
                          : "Initiated · Test only"}
                      </strong>
                    </div>
                    {actor === "organization" &&
                      (r.status === "approved" ? (
                        <button
                          className="button"
                          onClick={() =>
                            act({ type: "initiate", patient: id, id: r.id })
                          }
                        >
                          Initiate test referral
                        </button>
                      ) : (
                        <button className="button secondary" disabled>
                          Transfer to band · Device not connected
                        </button>
                      ))}
                  </article>
                ))}
            </section>
          )}
          {tab === "follow-up" && (
            <section className="panel">
              <h2>Follow-ups</h2>
              {actor === "doctor" && (
                <form
                  className="record-form"
                  onSubmit={(e) =>
                    submit(e, (d) => ({
                      type: "follow-up",
                      patient: id,
                      date: String(d.get("date")),
                      instructions: String(d.get("instructions")),
                      investigations: String(d.get("investigations")),
                    }))
                  }
                >
                  <label>
                    Date and time
                    <input name="date" type="datetime-local" required />
                  </label>
                  <label>
                    Patient instructions
                    <textarea name="instructions" required maxLength={2000} />
                  </label>
                  <label>
                    Required investigations
                    <textarea name="investigations" maxLength={2000} />
                  </label>
                  <button className="button">Add test follow-up</button>
                </form>
              )}
              {(["upcoming", "completed", "cancelled"] as const).map((s) => (
                <div key={s}>
                  <h3>{s[0].toUpperCase() + s.slice(1)}</h3>
                  {state.followUps
                    .filter((f) => f.patient === id && f.status === s)
                    .map((f) => (
                      <article className="local-document" key={f.id}>
                        <div>
                          <strong>{f.date.replace("T", " ")}</strong>
                          <p>{f.instructions}</p>
                          <p>
                            {f.investigations || "No investigations specified"}
                          </p>
                        </div>
                        {actor === "doctor" && s === "upcoming" && (
                          <div className="action-row">
                            <button
                              className="button secondary"
                              onClick={() =>
                                act({
                                  type: "follow-status",
                                  patient: id,
                                  id: f.id,
                                  status: "completed",
                                })
                              }
                            >
                              Mark completed
                            </button>
                            <button
                              className="button cancel"
                              onClick={() =>
                                act({
                                  type: "follow-status",
                                  patient: id,
                                  id: f.id,
                                  status: "cancelled",
                                })
                              }
                            >
                              Cancel follow-up
                            </button>
                          </div>
                        )}
                      </article>
                    ))}
                </div>
              ))}
            </section>
          )}
          {tab === "activity" && (
            <section className="panel">
              <h2>Activity history</h2>
              {state.audit
                .filter((a) => a.patient === id)
                .map((a, i) => (
                  <p key={i}>
                    {actorNames[a.actor]} · {a.action} ·{" "}
                    {new Date(a.at).toLocaleString()}
                  </p>
                ))}
            </section>
          )}
        </>
      )}
    </>
  );
}
