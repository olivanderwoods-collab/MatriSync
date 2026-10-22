import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { createRoot } from "react-dom/client";
import {
  BrowserRouter,
  Link,
  Navigate,
  NavLink,
  Route,
  Routes,
  useLocation,
  useNavigate,
  useParams,
} from "react-router-dom";
import {
  Activity,
  ArrowRight,
  ArrowRightLeft,
  Baby,
  BadgeCheck,
  Building2,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardList,
  Cpu,
  FileHeart,
  Files,
  Flower2,
  Heart,
  HeartPulse,
  House,
  Info,
  LogOut,
  Menu,
  Moon,
  Pill,
  Settings,
  ShieldCheck,
  Sparkles,
  Sun,
  Users,
  WifiOff,
  X,
  type LucideIcon,
} from "lucide-react";
import type { User } from "firebase/auth";
import {
  accountAuth,
  authConfigured,
  authError,
  authWasInitialized,
} from "./auth";
import { navigation, roleNames, TAGLINE } from "./data";
import { defaultProfile, ProfileEditor, type Profile } from "./profile";
import { BackButton } from "./navigation";
import { WorkspaceScreens } from "./workspace";
import { RecordsProvider, LocalRecords, RecordsHome } from "./records";
import { distributorSections, moreMenus } from "./workspace-spec";
import {
  demoStore,
  languages,
  roles,
  seed,
  type DemoSession,
  type Role,
  type Theme,
  type Language,
} from "./session";
import "./styles.css";

const icons: Record<string, LucideIcon> = {
  Menu,
  Activity,
  ArrowRightLeft,
  Baby,
  BadgeCheck,
  CalendarDays,
  ClipboardList,
  Cpu,
  FileHeart,
  Files,
  Flower2,
  Heart,
  HeartPulse,
  House,
  Pill,
  Sparkles,
  Users,
};
function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const Component = icons[name] || Heart;
  return <Component size={size} aria-hidden="true" />;
}
const ACCOUNT_KEY = "matrisync.account.active";
function hasAccount() {
  try {
    return sessionStorage.getItem(ACCOUNT_KEY) === "1";
  } catch {
    return false;
  }
}
function accountMarker(active: boolean) {
  try {
    if (active) sessionStorage.setItem(ACCOUNT_KEY, "1");
    else sessionStorage.removeItem(ACCOUNT_KEY);
  } catch {
    /* Auth SDK retains its own session or memory persistence. */
  }
}
type AppState = {
  profile: Profile;
  saveProfile: (profile: Profile) => void;
  demo: DemoSession | null;
  user: User | null;
  loading: boolean;
  theme: Theme;
  language: Language;
  online: boolean;
  start: (role: Role) => Promise<void>;
  exit: () => Promise<void>;
  reset: () => void;
  preferences: (theme: Theme, language: Language) => void;
  toAccount: (role: Role) => void;
  beginAccount: () => void;
  authenticated: (user: User) => void;
  soon: (label: string) => void;
};
const Context = createContext<AppState>(null!);
const useApp = () => useContext(Context);
function Brand({
  large = false,
  profile,
}: {
  large?: boolean;
  profile?: Profile;
}) {
  return (
    <div className={`brand ${large ? "brand-large" : ""}`}>
      <img
        className={profile?.photo ? "profile-photo" : undefined}
        src={profile?.photo || "/icons/icon-192.png"}
        alt=""
      />
      <div>
        <strong>
          MatriSync<span className="brand-dot">.</span>
        </strong>
        <span>{TAGLINE}</span>
      </div>
    </div>
  );
}

function Dialog({
  title,
  children: content,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement;
    ref.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="dialog-title"
    >
      <div className="dialog-head">
        <h2 id="dialog-title">{title}</h2>
        <button
          className="icon-button"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X />
        </button>
      </div>
      {content}
    </dialog>
  );
}
function App() {
  const [demo, setDemo] = useState<DemoSession | null>(() => demoStore.load());
  const [accountProfile, setAccountProfile] = useState<Profile>(defaultProfile);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(
    () => !demo && hasAccount() && authConfigured,
  );
  const [theme, setTheme] = useState<Theme>(demo?.theme || "system");
  const [language, setLanguage] = useState<Language>(
    demo?.language || "English",
  );
  const [online, setOnline] = useState(navigator.onLine);
  const [modal, setModal] = useState("");
  const [error, setError] = useState("");
  const [update, setUpdate] = useState<ServiceWorker | null>(null);
  const navigate = useNavigate();
  const location = useLocation();
  const observeAccount = !demo && (!!user || hasAccount()) && authConfigured;
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    if (observeAccount) {
      Promise.all([accountAuth(), import("firebase/auth")])
        .then(([auth, sdk]) => {
          if (disposed) return;
          unsubscribe = sdk.onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
            if (!u) accountMarker(false);
          });
        })
        .catch(() => {
          setLoading(false);
          setError(
            "Account restoration failed. Sign in again or explore Guest mode.",
          );
        });
    }
    return () => {
      disposed = true;
      unsubscribe?.();
    };
    // Observe both restored and newly signed-in sessions; Guest never initializes Firebase.
  }, [observeAccount]);
  useEffect(() => {
    const media = matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      document.documentElement.dataset.theme =
        theme === "system" ? (media.matches ? "dark" : "light") : theme;
    };
    apply();
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [theme]);
  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener("online", sync);
    window.addEventListener("offline", sync);
    return () => {
      window.removeEventListener("online", sync);
      window.removeEventListener("offline", sync);
    };
  }, []);
  useEffect(() => {
    document.querySelector("main")?.focus();
    window.scrollTo(0, 0);
  }, [location.pathname]);
  useEffect(() => {
    if (import.meta.env.PROD && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (reg.waiting) setUpdate(reg.waiting);
          reg.addEventListener("updatefound", () => {
            const worker = reg.installing;
            worker?.addEventListener("statechange", () => {
              if (
                worker.state === "installed" &&
                navigator.serviceWorker.controller
              )
                setUpdate(worker);
            });
          });
        })
        .catch(() =>
          setError(
            "Offline setup is unavailable in this browser. You can continue while online.",
          ),
        );
    }
  }, []);
  const clear = () => {
    setAccountProfile(defaultProfile);
    demoStore.clear();
    setDemo(null);
    setTheme("system");
    setLanguage("English");
    setModal("");
  };
  async function exit() {
    try {
      if (user || hasAccount()) {
        const [auth, sdk] = await Promise.all([
          accountAuth(),
          import("firebase/auth"),
        ]);
        await sdk.signOut(auth);
      }
      accountMarker(false);
      demoStore.clear();
      window.location.replace("/");
    } catch (e) {
      setError(authError(e));
    }
  }
  async function start(role: Role) {
    if (user || hasAccount()) {
      try {
        const [auth, sdk] = await Promise.all([
          accountAuth(),
          import("firebase/auth"),
        ]);
        await sdk.signOut(auth);
        accountMarker(false);
        clear();
        window.location.assign(`/guest/start/${role}`);
        return;
      } catch (e) {
        setError(authError(e));
        return;
      }
    }
    if (authWasInitialized()) {
      clear();
      window.location.assign(`/guest/start/${role}`);
      return;
    }
    clear();
    setDemo(demoStore.save(seed(role)));
    navigate(`/${role}/overview`);
  }
  function preferences(nextTheme: Theme, nextLanguage: Language) {
    setTheme(nextTheme);
    setLanguage(nextLanguage);
    if (demo)
      setDemo(
        demoStore.save({ ...demo, theme: nextTheme, language: nextLanguage }),
      );
  }
  const state: AppState = {
    profile: demo?.profile || accountProfile,
    saveProfile: (profile) => {
      if (demo) setDemo(demoStore.save({ ...demo, profile }));
      else setAccountProfile(profile);
    },
    demo,
    user,
    loading,
    theme,
    language,
    online,
    start,
    exit,
    reset: () => {
      if (demo) {
        demoStore.clear();
        setDemo(demoStore.save(seed(demo.role)));
        setTheme("system");
        setLanguage("English");
        navigate(`/${demo.role}/overview`, { replace: true });
      }
    },
    preferences,
    toAccount: (role) => {
      clear();
      navigate(`/auth/login?role=${role}`);
    },
    beginAccount: clear,
    authenticated: (u) => {
      clear();
      accountMarker(true);
      setUser(u);
      setLoading(false);
    },
    soon: setModal,
  };
  return (
    <Context.Provider value={state}>
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      {!online && (
        <div className="global-notice offline" role="status">
          <WifiOff size={16} /> Offline · Guest demo is available. Account
          sign-in needs a connection.
        </div>
      )}
      {(demoStore.warning() || error) && (
        <div className="global-notice" role="alert">
          {error || demoStore.warning()}
          {error && <button onClick={() => setError("")}>Dismiss</button>}
        </div>
      )}
      {update && (
        <div className="global-notice" role="status">
          A new version is ready.
          <button
            onClick={() => {
              navigator.serviceWorker.addEventListener(
                "controllerchange",
                () => window.location.reload(),
                { once: true },
              );
              update.postMessage({ type: "ACTIVATE_UPDATE" });
            }}
          >
            Update now
          </button>
        </div>
      )}
      <Routes>
        <Route path="/" element={<RoleSelection />} />
        <Route path="/auth/:mode" element={<AuthPage />} />
        <Route path="/guest/start/:role" element={<GuestStart />} />
        <Route path="/:role/*" element={<Workspace />} />
        <Route path="*" element={<NotFound />} />
      </Routes>
      {modal && (
        <Dialog title="Coming Soon" onClose={() => setModal("")}>
          <div className="dialog-icon">
            <Sparkles />
          </div>
          <h3>{modal}</h3>
          <p>
            This feature is planned for a future release and is not active in
            this demo.
          </p>
          <p className="muted">
            You can explore synthetic previews. No information is sent,
            generated, or saved to a service.
          </p>
          <button className="button primary" onClick={() => setModal("")}>
            Close
          </button>
        </Dialog>
      )}
    </Context.Provider>
  );
}
function GuestStart() {
  const { role } = useParams();
  const { start } = useApp();
  const started = useRef(false);
  useEffect(() => {
    if (!started.current && roles.includes(role as Role)) {
      started.current = true;
      void start(role as Role);
    }
  }, [role, start]);
  return roles.includes(role as Role) ? <Loading /> : <NotFound />;
}
function PublicHeader() {
  const app = useApp();
  return (
    <header className="public-header">
      <Link to="/" aria-label="MatriSync home">
        <Brand />
      </Link>
      <div className="header-actions">
        <span className="edition">PHASE 01 · MEETING DEMO</span>
        <button
          className="icon-button"
          aria-label="Toggle appearance"
          onClick={() =>
            app.preferences(
              document.documentElement.dataset.theme === "dark"
                ? "light"
                : "dark",
              app.language,
            )
          }
        >
          {app.theme === "dark" ? <Sun size={20} /> : <Moon size={20} />}
        </button>
      </div>
    </header>
  );
}
function RoleSelection() {
  const descriptions = [
    "A thoughtful space for your health, your children, and every chapter ahead.",
    "A connected view of your patients, documentation, and care handoffs.",
    "See your patients, care team, and facility devices in one place.",
  ];
  return (
    <div className="public-page">
      <PublicHeader />
      <main id="main" tabIndex={-1} className="welcome">
        <div className="eyebrow">
          <span className="short-line" /> CONNECTED CARE, AT EVERY STEP
        </div>
        <h1>
          Every journey deserves
          <br />
          <em>care that stays connected.</em>
        </h1>
        <p className="welcome-lead">
          From the first question to the next generation.
          <br />
          Choose your space and explore a more connected care journey.
        </p>
        <div className="role-grid">
          {roles.map((role, i) => (
            <Link
              className="role-card"
              to={`/auth/login?role=${role}`}
              key={role}
            >
              <div className="role-top">
                <span className="role-icon">
                  {i === 0 ? (
                    <Heart size={28} />
                  ) : i === 1 ? (
                    <HeartPulse size={28} />
                  ) : (
                    <Building2 size={28} />
                  )}
                </span>
                <span className="role-number">0{i + 1}</span>
              </div>
              <h2>{roleNames[role]}</h2>
              <p>{descriptions[i]}</p>
              <span className="role-cta">
                Enter your workspace <ArrowRight size={19} />
              </span>
            </Link>
          ))}
        </div>
        <div className="welcome-note">
          <ShieldCheck size={18} />
          <span>
            A safe space to explore. All health records in this demo are
            fictional.
          </span>
        </div>
      </main>
      <footer className="public-footer">
        <span>AN INITIATIVE BY TEAM UNCODED</span>
        <span>Thoughtfully built for continuity of care.</span>
      </footer>
    </div>
  );
}
function AuthPage() {
  const { mode } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const role = new URLSearchParams(location.search).get("role") as Role;
  const app = useApp();
  const signup = mode === "signup";
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  if (!roles.includes(role) || !["login", "signup"].includes(mode || ""))
    return <NotFound />;
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !authConfigured || !app.online) return;
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (signup && password !== data.get("confirm")) {
      setError("Your passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      app.beginAccount();
      const [auth, sdk] = await Promise.all([
        accountAuth(),
        import("firebase/auth"),
      ]);
      const result = await (
        signup
          ? sdk.createUserWithEmailAndPassword
          : sdk.signInWithEmailAndPassword
      )(auth, String(data.get("email")), password);
      app.authenticated(result.user);
      navigate(`/${role}/overview`, { replace: true });
    } catch (err) {
      setError(authError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="public-page">
      <PublicHeader />
      <main id="main" tabIndex={-1} className="auth-layout">
        <section className="auth-story">
          <Link className="back-link" to="/">
            ← Choose another workspace
          </Link>
          <span className="eyebrow">{roleNames[role]}</span>
          <h1>
            Care begins
            <br />
            with <em>connection.</em>
          </h1>
          <p>
            Your journey. Your team. A shared commitment to every mother and
            every child.
          </p>
          <div className="auth-art">
            <img
              src="/icons/icon-512.png"
              alt="MatriSync mother and child emblem"
            />
            <span className="orbit-label">
              <Heart size={16} /> Every step, together.
            </span>
          </div>
          <p className="small muted">
            Selecting a workspace opens a demo experience. It does not verify
            professional credentials or grant access to real records.
          </p>
        </section>
        <section className="auth-card">
          <Brand />
          <h2>{signup ? "Create your account" : "Welcome to MatriSync"}</h2>
          <p className="muted">
            {signup
              ? "Start with an email and password."
              : "Sign in to explore your selected workspace."}
          </p>
          {!authConfigured && (
            <div className="notice">
              <Info size={19} />
              <div>
                <strong>Authentication setup required</strong>
                <p>
                  Account access is not ready yet. Explore the full synthetic
                  demo below.
                </p>
              </div>
            </div>
          )}
          <form onSubmit={submit}>
            <label>
              Email address
              <input
                name="email"
                type="email"
                autoComplete="email"
                placeholder="you@example.com"
                required
                disabled={busy || !authConfigured}
              />
            </label>
            <label>
              Password
              <div className="password-input">
                <input
                  aria-label="Password"
                  name="password"
                  type={show ? "text" : "password"}
                  autoComplete={signup ? "new-password" : "current-password"}
                  minLength={6}
                  required
                  disabled={busy || !authConfigured}
                />
                <button
                  type="button"
                  aria-label={show ? "Hide password" : "Show password"}
                  onClick={() => setShow(!show)}
                >
                  {show ? "Hide" : "Show"}
                </button>
              </div>
            </label>
            {signup && (
              <label>
                Confirm password
                <input
                  name="confirm"
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  minLength={6}
                  required
                  disabled={busy || !authConfigured}
                />
              </label>
            )}
            {error && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
            <button
              className="button primary full"
              disabled={busy || !authConfigured || !app.online}
            >
              {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
              <ArrowRight size={18} />
            </button>
          </form>
          <p className="auth-switch">
            {signup ? "Already have an account?" : "New to MatriSync?"}{" "}
            <Link to={`/auth/${signup ? "login" : "signup"}?role=${role}`}>
              {signup ? "Sign in" : "Create an account"}
            </Link>
          </p>
          <div className="or">
            <span />
            or explore first
            <span />
          </div>
          <button
            className="button secondary full"
            onClick={() => void app.start(role)}
            disabled={busy}
          >
            Continue as Guest <ArrowRight size={18} />
          </button>
          <p className="guest-copy">
            Fictional sample data, kept in this tab. Use Exit Guest to clear it.
            Browser session restore may preserve a session. Please do not enter
            personal or medical information.
          </p>
        </section>
      </main>
    </div>
  );
}
function Loading() {
  return (
    <main id="main" tabIndex={-1} className="empty-state" role="status">
      <Brand />
      <h2>Restoring your account…</h2>
      <p>You will be able to continue shortly.</p>
    </main>
  );
}
function NotFound({ embedded = false }: { embedded?: boolean }) {
  const Container = embedded ? "section" : "main";
  return (
    <Container
      id={embedded ? undefined : "main"}
      tabIndex={-1}
      className="empty-state"
    >
      <Brand />
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1>Let’s find your way back.</h1>
      <p>This page isn’t part of the demo.</p>
      <Link className="button primary" to="/">
        Return to Role Selection
      </Link>
    </Container>
  );
}
function Workspace() {
  const app = useApp();
  const uid = !app.demo ? app.user?.uid : undefined;
  return (
    <RecordsProvider key={uid || "guest"} uid={uid}>
      <WorkspaceBody />
    </RecordsProvider>
  );
}
function WorkspaceBody() {
  const { role, "*": rest } = useParams();
  const app = useApp();
  if (!roles.includes(role as Role)) return <NotFound />;
  const r = role as Role;
  if (app.loading) return <Loading />;
  if (!app.demo && !app.user)
    return <Navigate to={`/auth/login?role=${r}`} replace />;
  if (app.demo && app.demo.role !== r)
    return <Navigate to={`/${app.demo.role}/overview`} replace />;
  const path = rest || "overview";
  const section = path.split("/")[0];
  const realRecords =
    !app.demo &&
    ((r === "professional" &&
      (section === "patients" || path === "overview")) ||
      (r === "mother" &&
        ["health/reports", "health/prescriptions"].includes(path)));
  const distributor =
    r === "organization" &&
    path.split("/")[0] === "more" &&
    path.split("/")[1] === "distributor";
  const nav: [string, string, string][] = distributor
    ? distributorSections.map((s, i) => [
        `more/distributor/${s.id}`,
        s.title,
        ["House", "Cpu", "ArrowRightLeft", "Files", "Menu"][i],
      ])
    : navigation[r];
  const title = distributor
    ? "Distributor preview"
    : nav.find((n) => n[0] === section)?.[1] || "Details";
  const navLinks = nav.map(([target, label, icon]) => (
    <NavLink key={target} to={`/${r}/${target}`}>
      <Icon name={icon} />
      <span>{label}</span>
    </NavLink>
  ));
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link
          to={r === "mother" ? "/mother/more/profile" : `/${r}/overview`}
          aria-label={r === "mother" ? "Open profile settings" : "Home"}
        >
          <Brand profile={r === "mother" ? app.profile : undefined} />
        </Link>
        <div className="workspace-label">
          {distributor ? "Restricted distributor · Demo" : roleNames[r]}
        </div>
        <nav aria-label="Main navigation">
          <div className="nav-caption">YOUR WORKSPACE</div>
          {navLinks}
        </nav>
        {!distributor && section === "more" && path.split("/")[1] && (
          <nav className="nested-nav" aria-label="More destinations">
            {moreMenus[r]
              .filter(([id]) => id !== "logout")
              .map(([id, label]) => (
                <NavLink key={id} to={`/${r}/more/${id}`}>
                  {label}
                </NavLink>
              ))}
          </nav>
        )}
        <div className="sidebar-bottom">
          <div className="avatar small-avatar">
            {r === "mother" ? "MS" : r === "professional" ? "DR" : "LF"}
          </div>
          <div>
            <strong>
              {r === "mother"
                ? app.profile.name
                : r === "professional"
                  ? app.demo
                    ? "Dr. Ishani Rao"
                    : "Your account"
                  : "Lotus Family Clinic"}
            </strong>
            <span>{app.demo ? "Synthetic profile" : "Signed-in account"}</span>
          </div>
          <button
            className="icon-button"
            aria-label={app.demo ? "Exit Guest" : "Log Out"}
            onClick={() => void app.exit()}
          >
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <div className="workspace-body">
        <header className="workspace-header">
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} />
            <strong>{title}</strong>
          </div>
          <Link
            className="mobile-brand"
            to={r === "mother" ? "/mother/more/profile" : `/${r}/overview`}
            aria-label={r === "mother" ? "Open profile settings" : "Home"}
          >
            <Brand profile={r === "mother" ? app.profile : undefined} />
          </Link>
          {r === "mother" && section === "overview" && (
            <label className="home-language">
              <span>Language</span>
              <select
                aria-label="Language"
                value={app.language}
                onChange={(e) =>
                  app.preferences(app.theme, e.target.value as Language)
                }
              >
                {languages.map((language) => (
                  <option key={language}>{language}</option>
                ))}
              </select>
            </label>
          )}
          <span className="connection-state">
            {realRecords
              ? "Device storage"
              : app.online
                ? "Online · Demo only"
                : "Offline · Public shell"}
          </span>
        </header>
        <div className="demo-banner">
          <div>
            <span className="status-dot" />
            <strong>
              {app.demo
                ? "Guest Demo · Synthetic data"
                : realRecords
                  ? "Private records · Device storage"
                  : "Account Demo · Synthetic data"}
            </strong>
            <span className="banner-description">
              {realRecords
                ? "Documents remain on this device."
                : "Patient records are fictional."}
            </span>
          </div>
          <button onClick={() => void app.exit()}>
            {app.demo ? "Exit Guest" : "Log Out"} <LogOut size={14} />
          </button>
        </div>
        <main id="main" tabIndex={-1} className="workspace-main">
          {path !== "overview" && (
            <BackButton
              fallback={`/${r}/${path.startsWith("more/") ? "more" : path.startsWith("patients/") ? "patients" : "overview"}`}
            />
          )}
          {r === "mother" &&
            section === "overview" &&
            app.language !== "English" && (
              <p className="small muted" role="status">
                {app.language} selected. Reviewed translations are pending;
                content is shown in English.
              </p>
            )}
          {realRecords ? (
            path === "overview" ? (
              <RecordsHome />
            ) : (
              <LocalRecords path={path} self={r === "mother"} />
            )
          ) : (
            <WorkspaceScreens
              account={!!app.user && !app.demo}
              role={r}
              profileName={app.profile.name}
              path={path}
              soon={app.soon}
              exit={() => void app.exit()}
              settings={(section) => (
                <SettingsPage role={r} section={section} />
              )}
              help={<Help embedded />}
              notFound={<NotFound embedded />}
            />
          )}
          <footer className="workspace-footer">
            <span>MatriSync · {TAGLINE}</span>
            <span>
              {realRecords
                ? "Private storage · No clinical interpretation"
                : "Demonstration only · No clinical advice"}
            </span>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {navLinks}
        </nav>
      </div>
    </div>
  );
}
function PageTitle({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
function Panel({
  title,
  description,
  children: content,
  link,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  link?: { to: string; label: string };
}) {
  return (
    <section className="panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {link && (
          <Link className="text-link" to={link.to}>
            {link.label}
            <ArrowRight size={16} />
          </Link>
        )}
      </div>
      {content}
    </section>
  );
}

function SettingsPage({ role, section }: { role: Role; section?: string }) {
  const app = useApp();
  if (role === "mother" && section === "profile")
    return (
      <>
        <PageTitle
          eyebrow="YOUR PREFERENCES"
          title="Profile Settings"
          description="Your name and picture."
        />
        <ProfileEditor profile={app.profile} save={app.saveProfile} />
      </>
    );
  const combinedProfile = role === "professional" && section === "profile";
  const title =
    moreMenus[role].find(([id]) => id === section)?.[1] || "Settings";
  return (
    <>
      <PageTitle
        eyebrow="YOUR PREFERENCES"
        title={title}
        description={
          section === "profile"
            ? "Account and workspace preferences."
            : "Appearance and language preferences stay in this tab’s demo session."
        }
      />
      <div className="two-columns">
        {(!section ||
          section === "settings" ||
          section === "appearance" ||
          combinedProfile) && (
          <Panel
            title="Appearance"
            description="Choose the view that feels most comfortable."
          >
            <div className="theme-choices">
              {(["light", "dark", "system"] as const).map((t) => (
                <button
                  key={t}
                  aria-pressed={app.theme === t}
                  className={app.theme === t ? "selected" : ""}
                  onClick={() => app.preferences(t, app.language)}
                >
                  {t === "light" ? (
                    <Sun />
                  ) : t === "dark" ? (
                    <Moon />
                  ) : (
                    <Settings />
                  )}
                  <span>{t[0].toUpperCase() + t.slice(1)}</span>
                  {app.theme === t && <Check size={16} />}
                </button>
              ))}
            </div>
          </Panel>
        )}
        {(!section ||
          section === "settings" ||
          section === "language" ||
          combinedProfile) && (
          <Panel
            title="Preferred language"
            description="English is the default for this preview."
          >
            <label htmlFor="preferred-language">Language</label>
            <select
              id="preferred-language"
              aria-label="Language"
              value={app.language}
              onChange={(e) =>
                app.preferences(app.theme, e.target.value as Language)
              }
            >
              {languages.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
            <p className="small" role="status">
              {app.language === "English"
                ? "Navigation and demo content are shown in English."
                : `${app.language} selected. Reviewed translations are not yet bundled, so navigation and content currently fall back to English.`}
            </p>
          </Panel>
        )}
        {section === "profile" && (
          <Panel title={title}>
            <dl className="record-details">
              <div>
                <dt>Workspace</dt>
                <dd>{roleNames[role]}</dd>
              </div>
              <div>
                <dt>Identity</dt>
                <dd>
                  {app.demo
                    ? "Guest · No account created"
                    : "Signed-in account"}
                </dd>
              </div>
              <div>
                <dt>Professional privileges</dt>
                <dd>No verified clinical privileges</dd>
              </div>
            </dl>
          </Panel>
        )}
        {(!section ||
          section === "settings" ||
          section === "privacy" ||
          combinedProfile) && (
          <Panel title="Privacy and Data Controls">
            <p>
              Guest uses fictional information and temporary tab storage.
              Browser restore or duplicated tabs may preserve a session.
              Explicitly exit to clear the demo.
            </p>
            {app.demo && (
              <>
                <button className="button secondary full" onClick={app.reset}>
                  Reset Demo
                </button>
                <button
                  className="button subtle full"
                  onClick={() => app.toAccount(role)}
                >
                  Log In
                </button>
              </>
            )}
            <button
              className="button subtle full"
              onClick={() => void app.exit()}
            >
              {app.demo ? "Exit Guest" : "Log Out"}
            </button>
          </Panel>
        )}
      </div>
    </>
  );
}
function Help({ embedded = false }: { embedded?: boolean }) {
  return (
    <>
      {!embedded && <BackButton fallback="/" />}
      <PageTitle
        eyebrow="ABOUT MATRISYNC"
        title={TAGLINE}
        description="A demonstration of maternal care continuity, from conceiving through parenting."
      />
      <Panel title="A guide to this preview">
        <div className="help-grid">
          <div>
            <h3>Explore with confidence</h3>
            <p>
              Choose a workspace, open its sections, switch child profiles, and
              try both appearance modes. Guest profiles and workflow previews
              are fictional. Signed-in private records stay on your device.
            </p>
          </div>
          <div>
            <h3>Know what works</h3>
            <p>
              Navigation, preferences, and temporary Guest sessions work.
              Signed-in accounts can save encrypted patient profiles and
              upload documents locally. Clinical approvals, AI, messaging and
              device connections remain in development.
            </p>
          </div>
          <div>
            <h3>Offline, after your first visit</h3>
            <p>
              The installed public shell can open without a connection. Account
              sign-in requires internet access. There is no patient-data
              synchronization.
            </p>
          </div>
          <div>
            <h3>Development status</h3>
            <p>
              This is a development build. It
              offers no diagnosis, treatment, prescription, or patient-specific
              advice.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <main className="empty-state">
        <Brand />
        <h1>Something interrupted this view.</h1>
        <p>Your demo can be reopened from the workspace selector.</p>
        <a className="button primary" href="/">
          Return to MatriSync
        </a>
      </main>
    ) : (
      this.props.children
    );
  }
}
createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
