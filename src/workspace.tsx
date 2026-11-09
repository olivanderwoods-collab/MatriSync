import {DemoBasicPatient} from "./demo-intake";
import { useState, type ReactNode } from "react";
import { Link, Navigate, NavLink } from "react-router-dom";
import { ArrowRight, ChevronRight, FileHeart } from "lucide-react";
import { children, patients, roleNames } from "./data";
import { MatriSathi } from "./matrisathi";
import { CareCards } from "./care";
import { SubmissionDemoPage } from "./submission-demo-page";
import { careEnabled } from "./care-model";
import type { Role } from "./session";
import {
  childSections,
  distributorSections,
  followUpSections,
  inventorySections,
  maternalSections,
  moreDescriptions,
  moreMenus,
  organizationReferrals,
  prescriptionActions,
  professionalReferrals,
  professionalSections,
  type Section,
} from "./workspace-spec";

type Props = {
  account?: boolean;
  role: Role;
  profileName: string;
  path: string;
  soon: (action: string) => void;
  exit: () => void;
  settings: (section?: string) => ReactNode;
  help: ReactNode;
  notFound: ReactNode;
};
type ActionsProps = { labels: string[]; soon: Props["soon"] };
export function Actions({ labels, soon }: ActionsProps) {
  return (
    <div className="action-row future-actions">
      {labels.map((label) => (
        <button className="soon-button" key={label} onClick={() => soon(label)}>
          <span>{label}</span>
          <span className="soon-label">Coming Soon</span>
          <ChevronRight size={16} />
        </button>
      ))}
    </div>
  );
}
function Title({
  title,
  description,
  eyebrow,
}: {
  title: string;
  description: string;
  eyebrow?: string;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <span className="eyebrow">{eyebrow}</span>}
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
    </div>
  );
}
function Panel({
  title,
  children: content,
}: {
  title?: string;
  children: ReactNode;
}) {
  return (
    <section className="panel">
      {title && (
        <div className="panel-heading">
          <h2>{title}</h2>
        </div>
      )}
      {content}
    </section>
  );
}
function Tabs({ sections, base }: { sections: Section[]; base: string }) {
  return (
    <nav className="tabs" aria-label="Section tabs">
      {sections.map((s) => (
        <NavLink key={s.id} to={`${base}/${s.id}`}>
          {s.title}
        </NavLink>
      ))}
    </nav>
  );
}
function Vitals() {
  return (
    <dl className="record-details vitals-list">
      {["BP", "Pulse / heart rate", "SpO2", "Temperature", "Weight"].map(
        (label) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>Not recorded</dd>
          </div>
        ),
      )}
      <div>
        <dt>Date / source</dt>
        <dd>Not recorded</dd>
      </div>
    </dl>
  );
}
function FollowUpRecord() {
  return (
    <dl className="record-details">
      <div>
        <dt>Clinician / source</dt>
        <dd>Dr. Ishani Rao · Synthetic fixture, 20 October 2026</dd>
      </div>
      <div>
        <dt>Example date</dt>
        <dd>28 October 2026 · Not scheduled</dd>
      </div>
      <div>
        <dt>Doctor's reason</dt>
        <dd>
          Review the previously documented visit and discuss the care plan.
        </dd>
      </div>
      <div>
        <dt>Required investigations</dt>
        <dd>No new tests listed in this synthetic example.</dd>
      </div>
    </dl>
  );
}
function HandoffContext({ external = false }: { external?: boolean }) {
  return (
    <div className="notice">
      <FileHeart size={20} />
      <div>
        <p>
          {external
            ? "Paper works without an app. Share the complete approved soft copy through an authorized channel; NFC carries only the compact encrypted handoff, never full reports."
            : "Clinical approval → organization initiation → acceptance → verified arrival → handoff acknowledgement → closure. Each is a separate future event."}
        </p>
        <p>
          Patient ID identifies the person; Referral ID identifies the handoff.
          The printed Band Inventory ID stays outside the clinical NFC payload.
        </p>
      </div>
    </div>
  );
}
function Home({
  role,
  profileName,
  account,
}: {
  role: Role;
  profileName: string;
  account?: boolean;
}) {
  if (role === "mother")
    return (
      <>
        <Title
          title={
            profileName.trim()
              ? `Welcome ${profileName.trim().split(/\s+/)[0]}`
              : "Welcome"
          }
          description="A little care, every day."
        />
        <div className="home-grid">
          {!account && (
            <section className="pregnancy-summary">
              <span className="eyebrow">MY JOURNEY · PREGNANCY</span>
              <h2>
                <strong>34</strong> weeks
              </h2>
              <p>Recorded stage · Synthetic fixture, 20 October 2026</p>
            </section>
          )}
          {account && (
            <Panel title="Your health">
              <p>No health records added yet.</p>
            </Panel>
          )}
          <CareCards followUps={[]} referrals={[]} />
          <Panel title="Important notifications">
            <p>No notifications issued in this demo.</p>
          </Panel>
          <Panel title="Educational suggestions">
            <p>Explore topics in MatriSathi. Articles are pending review.</p>
            <Link className="button secondary" to="/mother/matrisathi">
              Open MatriSathi
            </Link>
          </Panel>
        </div>
      </>
    );
  const professional = role === "professional";
  const cards: [string, string][] = professional
    ? [
        ["Assigned patients", `${patients.length} synthetic profiles`],
        ["Pending notes", "Not recorded"],
        [
          "Referrals awaiting clinical approval",
          "No submitted clinical package",
        ],
        ["AI draft reviews", "Coming Soon · No AI drafts generated"],
        ["Scheduled follow-ups", "28 October example · Not scheduled"],
        ["Facility notices", "No notices issued"],
      ]
    : [
        ["Outgoing referrals pending action", "No live outgoing referrals"],
        ["Incoming requests", "No live requests"],
        ["Accepted referrals awaiting arrival", "No verified acceptance"],
        [
          "Arrivals awaiting clinical handoff acknowledgement",
          "No verified arrival",
        ],
        ["MatriSync device", "Not connected"],
      ];
  return (
    <>
      <Title
        eyebrow={
          professional
            ? "HOME · HEALTHCARE PROFESSIONAL"
            : "HOME · LOTUS FAMILY CLINIC"
        }
        title={
          professional
            ? "Welcome back, Dr. Ishani."
            : "Your facility at a glance."
        }
        description=""
      />
      <div className="home-grid">
        {cards.map(([label, value]) => (
          <Panel title={label} key={label}>
            <p>{value}</p>
          </Panel>
        ))}
      </div>
    </>
  );
}
function SectionsPage({
  title,
  description,
  sections,
  base,
  id,
  soon,
  children: content,
  actions,
}: {
  title: string;
  description: string;
  sections: Section[];
  base: string;
  id: string;
  soon: Props["soon"];
  children?: ReactNode;
  actions?: string[];
}) {
  const active = sections.find((s) => s.id === id)!;
  return (
    <>
      <Title title={title} description={description} />
      <div className="section-layout">
        <Tabs sections={sections} base={base} />
        <Panel title={active.title}>
          <p className="section-description">{active.description}</p>
          {content}
          <Actions labels={actions || active.actions} soon={soon} />
        </Panel>
      </div>
    </>
  );
}
function Record({
  role,
  id,
  childId,
  patientId,
  soon,
}: {
  role: Role;
  id: string;
  childId?: string;
  patientId?: string;
  soon: Props["soon"];
}) {
  const child = children.find((c) => c.id === childId);
  const patient = patients.find((p) => p.id === patientId);
  const name = child?.name || patient?.name || "Mira Sen";
  const hasMaternalFixture = !child && (!patient || patient.id === "mira");
  const professional = role === "professional";
  const sections = child
    ? childSections
    : professional
      ? professionalSections
      : maternalSections;
  const base = child
    ? `/mother/children/${child.id}`
    : patient
      ? `/professional/patients/${patient.id}`
      : "/mother/health";
  return (
    <>
      {child && (
        <nav className="child-switcher" aria-label="Switch Child">
          {children.map((c) => (
            <Link
              key={c.id}
              className={c.id === child.id ? "selected" : ""}
              to={`/mother/children/${c.id}/${id}`}
            >
              <span className="avatar small-avatar">{c.initials}</span>
              {c.name}
            </Link>
          ))}
        </nav>
      )}
      <SectionsPage
        title={name}
        description={`${child?.age || patient?.age || "29 years"} · Synthetic profile · ${child ? `DEMO-CHILD-${child.id.toUpperCase()}` : `DEMO-P-${(patient?.id || "mira").toUpperCase()}`}`}
        sections={sections}
        base={base}
        id={id}
        soon={soon}
        actions={
          professional && id === "prescriptions"
            ? ["Create Prescription", ...prescriptionActions]
            : undefined
        }
      >
        {id === "overview" && (
          <dl className="record-details">
            <div>
              <dt>Profile</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt>{child ? "Mother" : "Recorded stage"}</dt>
              <dd>
                {child
                  ? "Mira Sen · Fictional mother"
                  : patient?.stage || "Pregnancy · 34 weeks"}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>
                Synthetic fixture · 20 October 2026 · Not clinically verified
              </dd>
            </div>
          </dl>
        )}
        {id === "vitals" && <Vitals />}
        {id === "reports" && (
          <div className="document-preview">
            <FileHeart size={28} />
            <div>
              <h3>{child?.report || `${name} · Maternal visit summary`}</h3>
              <p>
                18 October 2026 · Synthetic document container · Original
                laboratory/issuer not recorded.
              </p>
              <p>No report contents or clinical values are supplied.</p>
            </div>
          </div>
        )}
        {id === "prescriptions" && !professional && (
          <h3>{child?.medication || `${name} · Medication record preview`}</h3>
        )}
        {id === "follow-up" &&
          (hasMaternalFixture ? (
            <FollowUpRecord />
          ) : (
            <p>No clinician-entered follow-up is recorded for {name}.</p>
          ))}
        {id === "referrals" && (
          <>
            {hasMaternalFixture ? (
              <p>DEMO-REF-001 · Mira Sen · Synthetic example · Not initiated</p>
            ) : (
              <p>No referral is recorded for {name}.</p>
            )}
            <HandoffContext />
            {!professional && (
              <p>
                Issued band return/deposit status: no issue, return or deposit
                recorded.
              </p>
            )}
          </>
        )}
        {!professional && !child && id === "reports" && (
          <Actions labels={["Share with Authorization"]} soon={soon} />
        )}
      </SectionsPage>
    </>
  );
}
function PatientDirectory({
  role,
  soon,
  section,
}: {
  role: Role;
  soon: Props["soon"];
  section?: string;
}) {
  const pro = role === "professional";
  const [query, setQuery] = useState("");
  return (
    <>
      <Title
        title={
          section
            ? {
                prescriptions: "Prescriptions",
                reports: "Reports and Investigations",
                vitals: "Vitals Monitoring",
              }[section] || "Patients"
            : "Patients"
        }
        description={
          pro
            ? "Synthetic assigned profiles. No real patient access or registration."
            : "Facility-associated synthetic profiles and authorized operational context only."
        }
      />
      {!section &&
        (pro ? (
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

          </div>
        ) : (
          <Actions labels={["Find Patient"]} soon={soon} />
        ))}
      <Panel>
        <div className="patient-directory-grid">
          {patients
            .filter((p) =>
              `${p.name} DEMO-P-${p.id}`
                .toLowerCase()
                .includes(query.trim().toLowerCase()),
            )
            .map((p) => (
              <div className="patient-directory-entry" key={p.id}>
                <div className="person-row">
                  <span className="avatar">{p.initials}</span>
                  <div>
                    <strong>{p.name}</strong>
                    <span>
                      {p.age} · {p.stage} · DEMO-P-{p.id.toUpperCase()}
                    </span>
                  </div>
                </div>
                <dl className="record-details">
                  <div>
                    <dt>Last encounter</dt>
                    <dd>Not recorded</dd>
                  </div>
                  <div>
                    <dt>Assigned facility</dt>
                    <dd>Lotus Family Clinic · Fictional</dd>
                  </div>
                  <div>
                    <dt>Record availability</dt>
                    <dd>Synthetic preview only</dd>
                  </div>
                </dl>
                <Link
                  className="text-link"
                  to={`/${role}/patients/${p.id}/${section || "overview"}`}
                >
                  {pro ? "Open Profile" : "View Record"}
                  <ArrowRight size={16} />
                </Link>
              </div>
            ))}
        </div>
      </Panel>
    </>
  );
}
function OrganizationPatient({
  id,
  soon,
}: {
  id: string;
  soon: Props["soon"];
}) {
  const p = patients.find((p) => p.id === id)!;
  return (
    <>
      <Title
        title={p.name}
        description={`DEMO-P-${id.toUpperCase()} · ${p.age} · ${p.stage} · Synthetic facility record`}
      />
      <Panel title="Authorized operational record">
        <p>
          Lotus Family Clinic · Assigned professional: Dr. Ishani Rao ·
          Fictional affiliation.
        </p>
        <p>
          Record availability: read-only synthetic preview. Last encounter: Not
          recorded.
        </p>
        <Actions
          labels={[
            "View Record",
            "View Visits",
            "Referral History",
            "Assigned Professional",
          ]}
          soon={soon}
        />
      </Panel>
    </>
  );
}

function More({
  account,
  role,
  soon,
  exit,
  page,
  settings,
  help,
  notFound,
}: Props & { page?: string }) {
  if (!page)
    return (
      <>
        <Title
          title="More"
          description={`${roleNames[role]} · Account, preferences and additional areas`}
        />
        <nav className="more-menu" aria-label="More menu">
          {moreMenus[role].map(([id, label]) =>
            id === "logout" ? (
              <button key={id} onClick={exit}>
                {label}
                <ChevronRight size={18} />
              </button>
            ) : (
              <Link key={id} to={`/${role}/more/${id}`}>
                {label}
                <ChevronRight size={18} />
              </Link>
            ),
          )}
        </nav>
      </>
    );
  const retained: [string, string][] =
    role === "mother"
      ? [["notifications", "Notifications"]]
      : role === "professional"
        ? [
            ["documentation", "AI Documentation Reviews"],
            ["device", "Bluetooth NFC Device Manager"],
          ]
        : [];
  const item = [...moreMenus[role], ...retained].find(([id]) => id === page);
  if (!item || page === "logout") return notFound;
  if (
    ["language", "appearance", "privacy", "settings", "profile"].includes(page)
  ) {
    if (page !== "profile" || role !== "organization") return settings(page);
  }
  if (page === "help") return help;
  if (role === "mother" && page === "referrals")
    return <Navigate to="/mother/health/referrals" replace />;
  if (role === "mother" && page === "follow-up")
    return <Navigate to="/mother/health/follow-up" replace />;
  if (
    role === "professional" &&
    ["prescriptions", "reports", "vitals"].includes(page)
  )
    return <PatientDirectory role={role} soon={soon} section={page} />;
  if (role === "professional" && page === "referral-history")
    return <Navigate to="/professional/referrals/completed" replace />;
  return (
    <>
      <Title
        title={item[1]}
        description={
          account
            ? "Not connected yet"
            : "Coming Soon · Read-only synthetic preview"
        }
      />
      <Panel>
        {page === "staff" ? (
          <>
            {account ? (
              <p>No staff linked yet.</p>
            ) : (
              <>
                <p>Dr. Ishani Rao · Professional · Synthetic affiliation</p>
                <p>Nila Bose · Facility coordinator · Synthetic affiliation</p>
              </>
            )}
            <p>No credentials or permissions have been verified.</p>
            <Actions
              labels={[
                "Invite Staff",
                "Verify Affiliation",
                "Assign Permissions",
                "Suspend Access",
                "View Activity History",
              ]}
              soon={soon}
            />
          </>
        ) : (
          <p className="section-description">
            {role === "organization" && page === "reports"
              ? "Reports and Analytics: future authorized facility reporting. No live analytics, clinical interpretation or export is generated."
              : account && page === "affiliation"
                ? "No facility affiliation recorded."
                : account && page === "profile"
                  ? "No facility profile recorded."
                  : moreDescriptions[page] ||
                    "This area will be available in a future release."}
          </p>
        )}
        {role === "professional" && page === "device" && (
          <>
            <HandoffContext external />
            <Actions
              labels={[
                "Connect Device",
                "Device Status",
                "Prepare NFC Handoff",
                "Read NFC Handoff",
                "Verify Transfer",
                "Transfer History",
              ]}
              soon={soon}
            />
          </>
        )}
      </Panel>
    </>
  );
}

// Old links resolve to the closest approved v2 destination without retaining obsolete screens.
export const legacyRoutes: Record<Role, Record<string, string>> = {
  mother: {
    journey: "overview",
    assistant: "matrisathi/companion",
    "follow-up": "health/follow-up",
    referrals: "health/referrals",
    help: "more/help",
  },
  professional: {
    prescriptions: "more/prescriptions",
    matribridge: "more/documentation",
    matriflow: "referrals/draft",
    matriwatch: "referrals/initiated",
    "drug-safety": "more/prescriptions",
    matrivitals: "more/vitals",
    bridge: "more/device",
    help: "more/help",
    settings: "more/settings",
  },
  organization: {
    staff: "more/staff",
    devices: "inventory/devices",
    activity: "inventory/history",
    "follow-up": "more/follow-up",
    help: "more/help",
    settings: "more/settings",
  },
};
export function WorkspaceScreens(props: Props) {
  const { role, path, soon, notFound } = props;
  if (!props.account && role !== "mother" && path.startsWith("patients/LOCAL-")) return <DemoBasicPatient id={path.split("/")[1]} role={role} section={path.split("/")[2]||"overview"}/>;
  if (!props.account && (path === "overview" || (role === "professional" && path === "more/profile") || (role !== "mother" && (path === "patients" || path.startsWith("patients/MAT-DEMO-001") || path.startsWith("referrals"))) || (role === "mother" && (path === "health" || path.startsWith("health/"))))) return <SubmissionDemoPage role={role} path={path === "health" ? "health/overview" : path} />;
  const parts = path.split("/").filter(Boolean);
  const [section = "overview", second, third, fourth] = parts;
  const redirect = (target: string) => (
    <Navigate to={`/${role}/${target}`} replace />
  );
  if (parts.length === 1 && legacyRoutes[role][section])
    return redirect(legacyRoutes[role][section]);
  if (role === "mother" && section === "settings" && parts.length === 1)
    return props.settings();
  if (section === "overview")
    return parts.length === 1 ? (
      <Home
        role={role}
        profileName={props.profileName}
        account={props.account}
      />
    ) : (
      notFound
    );
  if (role === "professional" && section === "referrals")
    return careEnabled && props.account ? redirect("care") : redirect("patients");
  if (role === "organization" && section === "more") {
    const moved: Record<string, string> = {
      device: "devices",
      settlements: "refunds",
      distributor: "distributor",
    };
    if (moved[second]) return redirect(`inventory/${moved[second]}`);
    if (["reports", "monitoring", "follow-up"].includes(second))
      return redirect("more");
  }
  if (section === "more") {
    if (role === "mother" && !third) {
      const old: Record<string, string> = {
        referrals: "health/referrals",
        "follow-up": "health/follow-up",
        documents: "health/reports",
        language: "overview",
      };
      if (old[second]) return redirect(old[second]);
    }
    if (role === "professional" && !third) {
      if (second === "settings") return redirect("more/profile");
      if (["prescriptions", "reports", "vitals"].includes(second))
        return redirect("patients");
      if (second === "referral-history") return redirect("patients");
    }
    if (role === "organization" && second === "distributor") {
      if (!third) return redirect("more/distributor/overview");
      const active = distributorSections.find((s) => s.id === third);
      if (!active || fourth) return notFound;
      return (
        <>
          <Title
            eyebrow="RESTRICTED DISTRIBUTOR · SYNTHETIC PREVIEW"
            title={active.title}
            description="Nested organizational capability. Production requires verified distributor entitlement; this demo grants no privilege."
          />
          <Panel>
            <p>{active.description}</p>
            <Actions labels={active.actions} soon={soon} />
          </Panel>
          {third === "settlements" && (
            <p className="notice">
              The participating return facility refunds where applicable; the
              distributor collects returned bands and reimburses valid
              reconciled claims. Free public/NGO issue and manufacturing-cost
              private deposits are proposed, untested policies. Liability and
              service terms remain open.
            </p>
          )}
        </>
      );
    }
    if (third) return notFound;
    return <More {...props} page={second} />;
  }
  if (role === "mother" && section === "matrisathi") {
    if (!second) return redirect("matrisathi/information");
    if (second === "companion" && !third)
      return redirect("matrisathi/companion/chat");
    return !fourth &&
      ["information", "companion"].includes(second) &&
      (second !== "companion" ||
        ["chat", "drugs", "settings", "usage"].includes(third)) ? (
      <MatriSathi
        key={second === "companion" ? second : `${second}/${third || ""}`}
        account={!!props.account}
        section={second}
        detail={third}
      />
    ) : (
      notFound
    );
  }
  if (role === "mother" && section === "health") {
    if (!second) return redirect("health/overview");
    if (third) return notFound;
    if (["vitals", "history", "visits"].includes(second))
      return redirect("health/overview");
    if (["medications", "medicines"].includes(second))
      return redirect("health/prescriptions");
    if (!maternalSections.some((s) => s.id === second)) return notFound;
    return <Record role={role} id={second} soon={soon} />;
  }
  if (role === "mother" && section === "children") {
    if (props.account)
      return (
        <>
          <Title title="Children" description="Your linked child profiles" />
          <Panel>
            <p>No children linked yet.</p>
          </Panel>
        </>
      );
    if (!second)
      return (
        <>
          <Title
            title="Children"
            description="Two separate synthetic child profiles. No clinical linkage is created."
          />
          <Panel title="Switch Child">
            {children.map((c) => (
              <Link
                className="person-row"
                key={c.id}
                to={`/mother/children/${c.id}/overview`}
              >
                <span className="avatar">{c.initials}</span>
                <div>
                  <strong>{c.name}</strong>
                  <span>{c.age} · Synthetic profile</span>
                </div>
                <ChevronRight size={18} />
              </Link>
            ))}
          </Panel>
        </>
      );
    if (!children.some((c) => c.id === second) || fourth) return notFound;
    if (!third) return redirect(`children/${second}/overview`);
    if (["vitals", "history"].includes(third))
      return redirect(`children/${second}/overview`);
    if (third === "visits") return redirect(`children/${second}/follow-up`);
    if (["medications", "medicines"].includes(third))
      return redirect(`children/${second}/prescriptions`);
    if (!childSections.some((s) => s.id === third)) return notFound;
    return <Record role={role} childId={second} id={third} soon={soon} />;
  }
  if (role !== "mother" && section === "patients") {
    if (!second) return <PatientDirectory role={role} soon={soon} />;
    if (
      role === "professional" &&
      ["register", "consultation", "add"].includes(second) &&
      !fourth
    ) {
      if (third && !(second === "add" && third === "profile")) return notFound;
      if (second === "register") return redirect("patients/add");
      if (second === "consultation") return redirect("patients");
      return redirect("patients");
    }
    if (!patients.some((p) => p.id === second) || fourth) return notFound;
    if (!third) return redirect(`patients/${second}/overview`);
    if (role === "organization") {
      if (["medications", "prescriptions", "reports"].includes(third))
        return redirect(`patients/${second}/overview`);
      return third === "overview" ? (
        <OrganizationPatient id={second} soon={soon} />
      ) : (
        notFound
      );
    }
    if (["vitals", "history", "visits"].includes(third))
      return redirect(`patients/${second}/overview`);
    if (third === "medications")
      return redirect(`patients/${second}/prescriptions`);
    if (!professionalSections.some((s) => s.id === third)) return notFound;
    return <Record role={role} patientId={second} id={third} soon={soon} />;
  }
  if (role !== "mother" && section === "referrals") {
    const sections =
      role === "professional" ? professionalReferrals : organizationReferrals;
    if (!second) return redirect(`referrals/${sections[0].id}`);
    if (third || !sections.some((s) => s.id === second)) return notFound;
    return (
      <SectionsPage
        title="Referrals"
        description={
          role === "professional"
            ? "Clinical preparation and approval · Organizations initiate referrals."
            : "Operational coordination after clinician approval · Synthetic preview only."
        }
        sections={sections}
        base={`/${role}/referrals`}
        id={second}
        soon={soon}
      >
        <HandoffContext external={second === "external"} />
      </SectionsPage>
    );
  }
  if (role === "professional" && section === "follow-up") {
    if (
      !second ||
      ["today", "overdue", "instructions", "investigations"].includes(second)
    )
      return redirect("follow-up/upcoming");
    if (third || !followUpSections.some((s) => s.id === second))
      return notFound;
    return (
      <SectionsPage
        title="Follow-ups"
        description="Doctor-entered instructions · No reminders or clinical updates are sent."
        sections={followUpSections}
        base="/professional/follow-up"
        id={second}
        soon={soon}
      >
        {["upcoming", "instructions", "investigations"].includes(second) && (
          <FollowUpRecord />
        )}
      </SectionsPage>
    );
  }
  if (role === "organization" && section === "inventory") {
    if (!second) return redirect("inventory/stock");
    if (second === "financial") return redirect("inventory/refunds");
    if (third || !inventorySections.some((s) => s.id === second))
      return notFound;
    return (
      <SectionsPage
        title="Inventory"
        description="Physical stock and financial previews. Never read clinical NFC content to process inventory."
        sections={inventorySections}
        base="/organization/inventory"
        id={second}
        soon={soon}
      >
        {second === "devices" && (
          <p>
            Planned device sequence: encrypted payload size → ready → physical
            confirmation → write → read-back verification. No device state is
            simulated as successful.
          </p>
        )}
      </SectionsPage>
    );
  }
  return notFound;
}
