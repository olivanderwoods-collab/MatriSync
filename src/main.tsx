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
import {
  children,
  modules,
  navigation,
  patients,
  roleNames,
  TAGLINE,
} from "./data";
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
  authenticated: (user: User) => void;
  soon: (label: string) => void;
};
const Context = createContext<AppState>(null!);
const useApp = () => useContext(Context);
function Brand({ large = false }: { large?: boolean }) {
  return (
    <div className={`brand ${large ? "brand-large" : ""}`}>
      <img src="/icons/icon-192.png" alt="" />
      <div>
        <strong>
          MatriSync<span className="brand-dot">.</span>
        </strong>
        <span>{TAGLINE}</span>
      </div>
    </div>
  );
}
function Tag({
  children: content,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`tag ${tone}`}>
      <span aria-hidden="true">●</span> {content}
    </span>
  );
}
function Soon({
  action = "Learn more",
  compact = false,
}: {
  action?: string;
  compact?: boolean;
}) {
  const { soon } = useApp();
  return (
    <button
      className={`soon-button ${compact ? "compact" : ""}`}
      onClick={() => soon(action)}
    >
      <span>{action}</span>
      <span className="soon-label">Coming Soon</span>
      <ChevronRight size={16} />
    </button>
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
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let disposed = false;
    if (!demo && hasAccount() && authConfigured) {
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
    // Restore once at startup; Guest never initializes Firebase.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
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
            Got it
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
    "Bring your care teams, referrals, and facility workflows into one view.",
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
    if (!authConfigured || !app.online) return;
    const data = new FormData(e.currentTarget);
    const password = String(data.get("password"));
    if (signup && password !== data.get("confirm")) {
      setError("Your passwords do not match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      demoStore.clear();
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
function NotFound() {
  return (
    <main id="main" tabIndex={-1} className="empty-state">
      <Brand />
      <span className="eyebrow">PAGE NOT FOUND</span>
      <h1>Let’s find your way back.</h1>
      <p>This page isn’t part of the demo.</p>
      <Link className="button primary" to="/">
        Choose a workspace
      </Link>
    </main>
  );
}
function Workspace() {
  const { role, "*": rest } = useParams();
  const app = useApp();
  const navigate = useNavigate();
  const [menu, setMenu] = useState(false);
  const location = useLocation();
  useEffect(() => setMenu(false), [location.pathname]);
  if (!roles.includes(role as Role)) return <NotFound />;
  const r = role as Role;
  if (app.loading) return <Loading />;
  if (!app.demo && !app.user)
    return <Navigate to={`/auth/login?role=${r}`} replace />;
  if (app.demo && app.demo.role !== r)
    return <Navigate to={`/${app.demo.role}/overview`} replace />;
  const section = (rest || "overview").split("/")[0];
  const nav = navigation[r];
  const title =
    nav.find((x) => x[0] === section)?.[1] ||
    { settings: "Settings", help: "About & help" }[section] ||
    "Details";
  const navContents = (
    <>
      <div className="nav-caption">YOUR WORKSPACE</div>
      {nav.map(([path, label, icon]) => (
        <NavLink key={path} to={`/${r}/${path}`}>
          <Icon name={icon} />
          <span>{label}</span>
        </NavLink>
      ))}
      <div className="nav-divider" />
      <NavLink to={`/${r}/settings`}>
        <Settings size={20} />
        Settings
      </NavLink>
      <NavLink to={`/${r}/help`}>
        <Info size={20} />
        About & help
      </NavLink>
    </>
  );
  return (
    <div className="app-layout">
      <aside className="sidebar">
        <Link to={`/${r}/overview`}>
          <Brand />
        </Link>
        <div className="workspace-label">{roleNames[r]}</div>
        <nav aria-label="Main navigation">{navContents}</nav>
        <div className="sidebar-bottom">
          <div className="avatar small-avatar">
            {r === "mother" ? "MS" : r === "professional" ? "DR" : "LF"}
          </div>
          <div>
            <strong>
              {r === "mother"
                ? "Mira Sen"
                : r === "professional"
                  ? "Dr. Ishani Rao"
                  : "Lotus Family Clinic"}
            </strong>
            <span>Synthetic profile</span>
          </div>
          <button
            className="icon-button"
            aria-label={app.demo ? "Exit Guest" : "Log out"}
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
          <div className="mobile-brand">
            <Brand />
          </div>
          <div className="header-actions">
            <span className="date-label">DEMO · 20 OCT 2026</span>
            <button
              className="icon-button"
              aria-label="Open settings"
              onClick={() => navigate(`/${r}/settings`)}
            >
              <Settings size={20} />
            </button>
          </div>
        </header>
        <div className="demo-banner">
          <div>
            <span className="status-dot" />
            <strong>
              {app.demo
                ? "Guest Demo · Synthetic data"
                : "Account Demo · Synthetic data"}
            </strong>
            <span className="banner-description">
              A preview of connected care. All records are fictional.
            </span>
          </div>
          <button onClick={() => void app.exit()}>
            {app.demo ? "Exit Guest" : "Log out"} <LogOut size={14} />
          </button>
        </div>
        <main id="main" tabIndex={-1} className="workspace-main">
          <Screen role={r} path={rest || "overview"} />
          <footer className="workspace-footer">
            <span>MatriSync · {TAGLINE}</span>
            <span>Demonstration only · No clinical advice</span>
          </footer>
        </main>
        <nav className="mobile-nav" aria-label="Mobile navigation">
          {nav.slice(0, 3).map(([path, label, icon]) => (
            <NavLink to={`/${r}/${path}`} key={path}>
              <Icon name={icon} />
              <span>{label}</span>
            </NavLink>
          ))}
          <button onClick={() => setMenu(true)}>
            <Menu size={20} />
            <span>More</span>
          </button>
        </nav>
      </div>
      {menu && (
        <Dialog title="Your workspace" onClose={() => setMenu(false)}>
          <nav className="drawer-nav">{navContents}</nav>
          <button
            className="button secondary full"
            onClick={() => void app.exit()}
          >
            {app.demo ? "Exit Guest" : "Log out"}
          </button>
        </Dialog>
      )}
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
function Overview({ role }: { role: Role }) {
  const mother = role === "mother";
  const org = role === "organization";
  return (
    <>
      <PageTitle
        eyebrow={
          mother
            ? "YOUR CARE, CONNECTED"
            : org
              ? "LOTUS FAMILY CLINIC · SYNTHETIC FACILITY"
              : "YOUR CARE WORKSPACE"
        }
        title={
          mother
            ? "A little care, every day."
            : org
              ? "A connected team. A shared purpose."
              : "Welcome back, Dr. Ishani."
        }
        description={
          mother
            ? "Welcome, Mira. Here’s a gentle overview of your family’s journey."
            : org
              ? "A sample view of the people and handoffs that bring care together."
              : "Your sample workspace for continuity, coordination, and care."
        }
      />
      <div className="overview-grid">
        <section className="journey-hero">
          <div>
            <span className="eyebrow">
              {mother ? "YOUR MATERNAL JOURNEY" : "CONTINUITY OF CARE"}
            </span>
            <h2>
              {mother ? (
                <>
                  Every chapter.
                  <br />A circle of care.
                </>
              ) : (
                <>
                  Good care goes further
                  <br />
                  when we stay connected.
                </>
              )}
            </h2>
            <p>
              {mother
                ? "A space for you, your children, and the people who care for you."
                : "Keep the person at the heart of every record, referral, and follow-up."}
            </p>
            <Link
              className="button hero-button"
              to={`/${role}/${mother ? "journey" : "patients"}`}
            >
              {mother ? "Explore my journey" : "View sample patients"}
              <ArrowRight size={18} />
            </Link>
          </div>
          <div className="hero-emblem">
            <img src="/icons/icon-512.png" alt="" />
          </div>
          <div className="hero-foot">
            <span>
              <ShieldCheck size={16} /> Synthetic example
            </span>
            <span>Built around you</span>
          </div>
        </section>
        <section className="next-card">
          <div className="card-kicker">
            <CalendarDays size={21} />
            <span>FOLLOW-UP PREVIEW</span>
          </div>
          <div className="calendar-date">
            <strong>28</strong>
            <span>
              OCT
              <br />
              2026
            </span>
          </div>
          <h3>A moment to reconnect</h3>
          <p>Example follow-up with Dr. Ishani Rao at Lotus Family Clinic.</p>
          <Tag tone="purple">Example · Not scheduled</Tag>
          <Link className="text-link" to={`/${role}/follow-up`}>
            View clinician’s instructions <ArrowRight size={16} />
          </Link>
        </section>
      </div>
      <div className="stat-grid">
        {(mother
          ? [
              ["2", "Child profiles", "Baby", "children"],
              ["3", "Record categories", "Files", "health"],
              ["1", "Sample care handoff", "ArrowRightLeft", "referrals"],
            ]
          : org
            ? [
                ["3", "Sample patient profiles", "Users", "patients"],
                ["2", "Sample staff profiles", "BadgeCheck", "staff"],
                [
                  "2",
                  "Example referral directions",
                  "ArrowRightLeft",
                  "referrals",
                ],
              ]
            : [
                ["3", "Sample patients", "Users", "patients"],
                ["1", "Example follow-up", "CalendarDays", "follow-up"],
                ["1", "Sample handoff", "ArrowRightLeft", "matriflow"],
              ]
        ).map(([value, label, icon, path]) => (
          <Link className="stat-card" key={label} to={`/${role}/${path}`}>
            <span className="stat-icon">
              <Icon name={icon} />
            </span>
            <div>
              <strong>{value}</strong>
              <span>{label}</span>
            </div>
            <ChevronRight size={18} />
          </Link>
        ))}
      </div>
      <div className="two-columns">
        <Panel
          title={mother ? "Your family, in one place" : "People at the center"}
          description="Separate profiles. One connected journey."
          link={{
            to: `/${role}/${mother ? "children" : "patients"}`,
            label: "View all",
          }}
        >
          {(mother ? children : patients.slice(0, 2)).map((person) => (
            <Link
              className="person-row"
              to={`/${role}/${mother ? "children" : "patients"}/${person.id}/overview`}
              key={person.id}
            >
              <span className="avatar">{person.initials}</span>
              <div>
                <strong>{person.name}</strong>
                <span>{person.age} · Synthetic profile</span>
              </div>
              <ChevronRight size={18} />
            </Link>
          ))}
        </Panel>
        <Panel
          title={
            mother
              ? "A companion for the journey"
              : "Thoughtful tools for your team"
          }
          description={
            mother
              ? "Meet MatriSathi, your future educational companion."
              : "Preview the next chapter of coordinated care."
          }
        >
          <div className="companion">
            <div className="companion-icon">
              {mother ? <Flower2 size={34} /> : <Files size={34} />}
            </div>
            <div>
              <h3>
                {mother ? "Growing together" : "Less paperwork, more presence"}
              </h3>
              <p>
                {mother
                  ? "From preparing for pregnancy to raising your children. A space to learn, at your pace."
                  : "Explore how MatriBridge will organize documentation for professional review."}
              </p>
              <Link
                className="text-link"
                to={`/${role}/${mother ? "matrisathi" : org ? "devices" : "matribridge"}`}
              >
                Explore the preview <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        </Panel>
      </div>
      <div className="quiet-note">
        <Info size={17} />
        <span>
          These are demonstration records, not live activity. Future actions are
          clearly marked Coming Soon.
        </span>
      </div>
    </>
  );
}
function Tabs({
  items,
  base,
  active,
}: {
  items: [string, string][];
  base: string;
  active: string;
}) {
  return (
    <nav className="tabs" aria-label="Section tabs">
      {items.map(([key, label]) => (
        <Link
          aria-current={active === key ? "page" : undefined}
          className={active === key ? "active" : ""}
          to={`${base}/${key}`}
          key={key}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
function Journey({ role }: { role: Role }) {
  const { soon } = useApp();
  const [stage, setStage] = useState("Pregnancy");
  return (
    <>
      <PageTitle
        eyebrow="MY JOURNEY"
        title="Every chapter belongs here."
        description="Explore the stages of a maternal and family journey. This is a synthetic preview."
      />
      <div className="journey-stages">
        {["Conceiving", "Pregnancy", "Postpartum", "Parenting"].map((s, i) => (
          <button
            aria-pressed={stage === s}
            className={s === stage ? "selected" : ""}
            key={s}
            onClick={() => setStage(s)}
          >
            <span>0{i + 1}</span>
            <Icon name={["Flower2", "Heart", "HeartPulse", "Baby"][i]} />
            <strong>{s}</strong>
          </button>
        ))}
      </div>
      <Panel
        title={`${stage} · Your example chapter`}
        description="A preview of how your care story could come together."
      >
        <div className="two-columns inner">
          <div>
            <h3>A place for your story</h3>
            <p>
              Keep the people, appointments, and records for this chapter in
              view. No health advice or personalized guidance is generated.
            </p>
            <button
              className="button secondary"
              onClick={() => soon("Save journey updates")}
            >
              Save journey updates · Coming Soon
            </button>
          </div>
          <div className="link-stack">
            <Link to={`/${role}/health`}>
              Explore maternal records <ArrowRight size={18} />
            </Link>
            <Link to={`/${role}/follow-up`}>
              See sample follow-up <ArrowRight size={18} />
            </Link>
            <Link to={`/${role}/children`}>
              Meet the child profiles <ArrowRight size={18} />
            </Link>
          </div>
        </div>
      </Panel>
    </>
  );
}
const healthTabs: [string, string][] = [
  ["overview", "Overview"],
  ["medications", "Medications"],
  ["prescriptions", "Prescriptions"],
  ["reports", "Test reports"],
];
function RecordContent({
  name,
  tab,
  childId,
}: {
  name: string;
  tab: string;
  childId?: string;
}) {
  const child = children.find((c) => c.id === childId);
  if (tab === "overview")
    return (
      <div className="two-columns">
        <Panel title="Profile overview">
          <dl className="record-details">
            <div>
              <dt>Profile</dt>
              <dd>{name}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>Synthetic meeting fixture</dd>
            </div>
            <div>
              <dt>Record status</dt>
              <dd>Example only · Not clinically verified</dd>
            </div>
            <div>
              <dt>{child ? "Guardian" : "Care team"}</dt>
              <dd>
                {child
                  ? "Mira Sen · Fictional caregiver"
                  : "Dr. Ishani Rao · Fictional professional"}
              </dd>
            </div>
          </dl>
        </Panel>
        <Panel title={child ? "A separate story" : "Maternal history"}>
          <p>
            {child
              ? `Records in this view belong only to ${name}. Child profiles are nested beneath the caregiver, with no separate sign-in.`
              : "This preview reserves space for pregnancy history, recorded observations, allergies, and clinician-authored notes."}
          </p>
          <div className="notice">
            <Info size={18} />
            <p>
              No measurements or medical conditions are inferred. This sample
              contains no real health information.
            </p>
          </div>
          <Soon action="Edit profile" />
        </Panel>
      </div>
    );
  const title =
    tab === "medications"
      ? child?.medication || `${name} · Medication record preview`
      : tab === "prescriptions"
        ? child?.prescription || `${name} · Prescription layout example`
        : child?.report || `${name} · Maternal visit summary`;
  return (
    <Panel title={title} description="Synthetic example · Read-only">
      <div className="document-preview">
        <div className="document-icon">
          <Icon name={tab === "medications" ? "Pill" : "Files"} size={32} />
        </div>
        <div>
          <h3>
            {tab === "medications"
              ? "Clinician-entered medication record"
              : tab === "prescriptions"
                ? "Prescription documentation"
                : "Visit report preview"}
          </h3>
          <p>
            Profile: <strong>{name}</strong> · Example date: 18 October 2026
          </p>
          <p>
            {tab === "medications"
              ? "Medicine names and doses are intentionally omitted. This screen demonstrates record organization only."
              : tab === "prescriptions"
                ? "Author, source, date, and review status will accompany clinician-authored prescriptions. No treatment is generated here."
                : "A sample document container showing provenance and profile context. No laboratory values or interpretation are supplied."}
          </p>
          <Tag>Synthetic example</Tag>
        </div>
      </div>
      <Soon
        action={
          tab === "medications"
            ? "Add medication record"
            : tab === "prescriptions"
              ? "Create prescription"
              : "Upload report"
        }
      />
    </Panel>
  );
}
function Children({ role, parts }: { role: Role; parts: string[] }) {
  const child = children.find((c) => c.id === parts[1]);
  const tab = parts[2] || "overview";
  if (parts[1] && !child) return <NotFound />;
  if (!healthTabs.some(([id]) => id === tab)) return <NotFound />;
  return (
    <>
      <PageTitle
        eyebrow="MY CHILDREN"
        title={
          child
            ? `${child.name}’s little world.`
            : "Their own stories. Always connected."
        }
        description={
          child
            ? `${child.age} · Child profile ${child.id.toUpperCase()} · Synthetic example`
            : "Two fictional child profiles, with their records kept carefully separate."
        }
        action={<Soon action="Add child" compact />}
      />
      {child ? (
        <>
          <div className="child-switcher">
            {children.map((c) => (
              <Link
                className={child.id === c.id ? "selected" : ""}
                to={`/${role}/children/${c.id}/${tab}`}
                key={c.id}
              >
                <span className="avatar small-avatar">{c.initials}</span>
                {c.name}
              </Link>
            ))}
          </div>
          <Tabs
            base={`/${role}/children/${child.id}`}
            active={tab}
            items={healthTabs}
          />
          <RecordContent name={child.name} tab={tab} childId={child.id} />
        </>
      ) : (
        <div className="two-columns">
          {children.map((c) => (
            <Link
              className="child-card panel"
              to={`/${role}/children/${c.id}/overview`}
              key={c.id}
            >
              <span className="avatar large-avatar">{c.initials}</span>
              <h2>{c.name}</h2>
              <Tag>{c.age}</Tag>
              <p>{c.description}</p>
              <span className="text-link">
                Open child profile <ArrowRight size={18} />
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
function PatientList({ role, parts }: { role: Role; parts: string[] }) {
  const patient = patients.find((p) => p.id === parts[1]);
  const tab = parts[2] || "overview";
  if (parts[1] && !patient) return <NotFound />;
  if (!healthTabs.some(([id]) => id === tab)) return <NotFound />;
  return (
    <>
      <PageTitle
        eyebrow={
          role === "organization"
            ? "READ-ONLY FACILITY RECORDS"
            : "PATIENT WORKSPACE"
        }
        title={patient ? patient.name : "People, beyond the records."}
        description={
          patient
            ? `${patient.age} · ${patient.stage} · Synthetic profile`
            : "A fictional patient directory for exploring the care workspace."
        }
        action={<Soon action="Search patients" compact />}
      />
      {patient ? (
        <>
          <Link className="back-link" to={`/${role}/patients`}>
            ← All sample patients
          </Link>
          <Tabs
            items={healthTabs}
            base={`/${role}/patients/${patient.id}`}
            active={tab}
          />
          <RecordContent name={patient.name} tab={tab} />
          <div className="action-row">
            <Soon action="Pair or merge records" />
            <Soon action="Verify profile" />
          </div>
        </>
      ) : (
        <Panel
          title="Sample patient directory"
          description="3 fictional profiles · No real patient access"
        >
          {patients.map((p) => (
            <Link
              className="person-row patient-row"
              to={`/${role}/patients/${p.id}/overview`}
              key={p.id}
            >
              <span className="avatar">{p.initials}</span>
              <div>
                <strong>{p.name}</strong>
                <span>{p.detail}</span>
              </div>
              <Tag>{p.stage}</Tag>
              <ChevronRight size={18} />
            </Link>
          ))}
          <Soon action="Register a patient" />
        </Panel>
      )}
    </>
  );
}
function FollowUp() {
  return (
    <>
      <PageTitle
        eyebrow="FOLLOW-UP"
        title="The next step, clearly in view."
        description="A fictional example of instructions entered by a clinician. Nothing has been scheduled or sent."
      />
      <Panel
        title="Mira Sen · Example follow-up"
        description="Entered by Dr. Ishani Rao · Synthetic clinician"
      >
        <div className="follow-up-grid">
          <div className="due-date">
            <CalendarDays size={28} />
            <span>EXAMPLE DUE DATE</span>
            <strong>28 October</strong>
            <span>2026</span>
            <Tag tone="purple">Not scheduled</Tag>
          </div>
          <dl className="record-details">
            <div>
              <dt>Doctor’s reason</dt>
              <dd>
                Review the previously documented visit and discuss the care
                plan.
              </dd>
            </div>
            <div>
              <dt>Required tests, as entered</dt>
              <dd>
                No new tests listed in this synthetic example. Bring the
                existing report preview.
              </dd>
            </div>
            <div>
              <dt>Example facility</dt>
              <dd>Lotus Family Clinic · Fictional</dd>
            </div>
            <div>
              <dt>Record source</dt>
              <dd>Demo fixture, not an appointment or medical instruction</dd>
            </div>
          </dl>
        </div>
        <div className="action-row">
          <Soon action="Schedule follow-up" />
          <Soon action="Send reminder" />
          <Soon action="Mark complete" />
        </div>
      </Panel>
    </>
  );
}
function Referrals({ role, tab = "incoming" }: { role: Role; tab?: string }) {
  const org = role === "organization";
  if (org && !["incoming", "outgoing"].includes(tab)) return <NotFound />;
  return (
    <>
      <PageTitle
        eyebrow={role === "professional" ? "MATRIFLOW" : "CARE JOURNEY"}
        title="Keep the handoff human."
        description="A sample care-coordination timeline. No referral has been submitted or received."
      />
      {org && (
        <Tabs
          items={[
            ["incoming", "Incoming"],
            ["outgoing", "Outgoing"],
          ]}
          base={`/${role}/referrals`}
          active={tab}
        />
      )}
      <div className="two-columns">
        <Panel
          title={`Mira Sen · ${org ? tab + " referral" : "Sample handoff"}`}
          description="DEMO-REF-001 · Synthetic example"
        >
          <div className="referral-route">
            <div>
              <span>FROM</span>
              <strong>
                {org && tab === "incoming"
                  ? "Meadow Care Center"
                  : "Lotus Family Clinic"}
              </strong>
            </div>
            <ArrowRight size={24} />
            <div>
              <span>TO</span>
              <strong>
                {org && tab === "incoming"
                  ? "Lotus Family Clinic"
                  : "Meadow Care Center"}
              </strong>
            </div>
          </div>
          <Tag tone="purple">Demo status · Awaiting acknowledgement</Tag>
          <p>
            Both facilities are fictional. The destination illustrates a handoff
            and is not a recommendation.
          </p>
          <Soon action="Submit referral" />
        </Panel>
        <Panel
          title="Example timeline"
          description="Static illustration · Not live activity"
        >
          <ol className="timeline">
            {[
              "Clinician documents the reason",
              "Handoff prepared for review",
              "Destination receives the handoff",
              "Patient Received confirmation",
            ].map((label, i) => (
              <li key={label}>
                <span>{i < 2 ? <Check size={14} /> : i + 1}</span>
                <div>
                  <strong>{label}</strong>
                  <p>
                    {i < 2 ? "Example stage" : "Planned stage · Coming Soon"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <Soon action="Patient Received" />
        </Panel>
      </div>
    </>
  );
}
function Module({ name }: { name: string }) {
  const module = modules[name];
  const [topic, setTopic] = useState(0);
  return (
    <>
      <PageTitle
        eyebrow={module.eyebrow.toUpperCase()}
        title={module.title}
        description={module.description}
      />
      <section className="module-hero panel">
        <div className="module-icon">
          <Icon
            name={
              name === "matrisathi"
                ? "Flower2"
                : name === "drug-safety"
                  ? "Pill"
                  : name === "bridge" || name === "devices"
                    ? "Cpu"
                    : "Sparkles"
            }
            size={42}
          />
        </div>
        <Tag tone="purple">Coming Soon</Tag>
        <h2>{module.eyebrow}</h2>
        <p>A preview of what’s ahead. Explore the concept below.</p>
        <div className="module-topics" aria-label="Preview topics">
          {module.steps.map((step, i) => (
            <button
              key={step}
              aria-pressed={topic === i}
              className={topic === i ? "active" : ""}
              onClick={() => setTopic(i)}
            >
              {step}
            </button>
          ))}
        </div>
        <div className="topic-description">
          <strong>{module.steps[topic]}</strong>
          <p>
            This area will support the planned {module.eyebrow} workflow. It is
            an informational preview; no clinical content, device action, or
            service is active.
          </p>
        </div>
        <Soon action={module.action} />
      </section>
    </>
  );
}
function Watch() {
  return (
    <>
      <PageTitle
        eyebrow="MATRIWATCH"
        title="Every handoff accounted for."
        description="Operational workflow examples only. No clinical risk scores, monitoring, or alerts are generated."
      />
      <div className="two-columns">
        <Panel title="Pending acknowledgement">
          <Tag tone="purple">Demo status</Tag>
          <h3>DEMO-REF-001 · Mira Sen</h3>
          <p>
            A fictional handoff awaiting a receiving professional’s
            acknowledgement.
          </p>
          <Soon action="Notify care team" />
        </Panel>
        <Panel title="Incomplete documentation">
          <Tag tone="amber">Example workflow state</Tag>
          <h3>Handoff review</h3>
          <p>
            The example documentation step is waiting for a professional to
            review the source.
          </p>
          <Soon action="Open live monitoring" />
        </Panel>
      </div>
    </>
  );
}
function Staff() {
  return (
    <>
      <PageTitle
        eyebrow="STAFF & VERIFICATION"
        title="The people behind the care."
        description="Fictional team profiles. Selection and sign-in do not verify credentials."
        action={<Soon action="Invite staff" compact />}
      />
      <Panel title="Sample care team">
        {[
          "Dr. Ishani Rao · Professional",
          "Nila Bose · Facility coordinator",
        ].map((name, i) => (
          <div className="person-row" key={name}>
            <span className="avatar">{i ? "NB" : "IR"}</span>
            <div>
              <strong>{name}</strong>
              <span>Lotus Family Clinic · Synthetic affiliation</span>
            </div>
            <Tag tone="purple">Not verified</Tag>
          </div>
        ))}
        <Soon action="Verify credentials" />
      </Panel>
    </>
  );
}
function SettingsPage({ role }: { role: Role }) {
  const app = useApp();
  return (
    <>
      <PageTitle
        eyebrow="YOUR PREFERENCES"
        title="Make this space feel like yours."
        description="Appearance and language preferences stay in this tab’s demo session."
      />
      <div className="two-columns">
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
        <Panel title="Your demo profile">
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
                  : "Signed-in account · Synthetic health data"}
              </dd>
            </div>
            <div>
              <dt>Professional privileges</dt>
              <dd>None granted in this demo</dd>
            </div>
          </dl>
          <Soon action="Update or verify profile" />
        </Panel>
        <Panel title="Session & privacy">
          <p>
            Guest uses fictional information and temporary tab storage. Browser
            restore or duplicated tabs may preserve a session. Explicitly exit
            to clear the demo.
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
                Exit Guest & sign in
              </button>
            </>
          )}
          <button
            className="button subtle full"
            onClick={() => void app.exit()}
          >
            {app.demo ? "Exit Guest" : "Log out"}
          </button>
        </Panel>
      </div>
    </>
  );
}
function Help() {
  return (
    <>
      <PageTitle
        eyebrow="ABOUT MATRISYNC"
        title="Every Mother. Every Step."
        description="A demonstration of maternal care continuity, from conceiving through parenting."
      />
      <Panel title="A guide to this preview">
        <div className="help-grid">
          <div>
            <h3>Explore with confidence</h3>
            <p>
              Choose a workspace, open its sections, switch child profiles, and
              try both appearance modes. All people, records, dates, and
              facilities are fictional.
            </p>
          </div>
          <div>
            <h3>Know what works</h3>
            <p>
              Navigation, preferences, and temporary Guest sessions work.
              Account sign-in requires configured Authentication. Future
              clinical, AI, messaging, and device actions say Coming Soon.
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
            <h3>Made for a meeting</h3>
            <p>
              This is a demonstration, not a production medical system. It
              offers no diagnosis, treatment, prescription, or patient-specific
              advice.
            </p>
          </div>
        </div>
      </Panel>
    </>
  );
}
function Screen({ role, path }: { role: Role; path: string }) {
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] || "overview";
  const depth = ['children', 'patients'].includes(section) ? 3 : ['health', 'prescriptions'].includes(section) || (section === 'referrals' && role === 'organization') ? 2 : 1;
  if (parts.length > depth) return <NotFound />;
  if (
    !navigation[role].some((n) => n[0] === section) &&
    !["settings", "help"].includes(section)
  )
    return <NotFound />;
  if (section === "overview") return <Overview role={role} />;
  if (section === "settings") return <SettingsPage role={role} />;
  if (section === "help") return <Help />;
  if (section === "journey") return <Journey role={role} />;
  if (section === "children") return <Children role={role} parts={parts} />;
  if (section === "patients") return <PatientList role={role} parts={parts} />;
  if (section === "health" || section === "prescriptions") {
    const tab =
      parts[1] || (section === "prescriptions" ? "prescriptions" : "overview");
    if (!healthTabs.some(([id]) => id === tab)) return <NotFound />;
    return (
      <>
        <PageTitle
          eyebrow={section === "health" ? "MY HEALTH" : "PRESCRIPTION PREVIEWS"}
          title="A story of care, in one place."
          description="Mira Sen · Read-only synthetic examples"
        />
        <Tabs items={healthTabs} base={`/${role}/${section}`} active={tab} />
        <RecordContent name="Mira Sen" tab={tab} />
      </>
    );
  }
  if (section === "follow-up") return <FollowUp />;
  if (section === "referrals" || section === "matriflow")
    return <Referrals role={role} tab={parts[1]} />;
  if (section === "matriwatch") return <Watch />;
  if (section === "staff") return <Staff />;
  if (section === "activity")
    return (
      <>
        <PageTitle
          eyebrow="ACTIVITY HISTORY"
          title="A shared view of the journey."
          description="Illustrative workflow stages, not live facility analytics."
        />
        <Panel title="Synthetic activity examples">
          <ol className="timeline">
            {[
              "Profile prepared for review",
              "Handoff awaiting acknowledgement",
              "Follow-up preview documented",
            ].map((s, i) => (
              <li key={s}>
                <span>{i + 1}</span>
                <div>
                  <strong>{s}</strong>
                  <p>
                    Example only · 20 October 2026 · Fictional facility team
                  </p>
                </div>
              </li>
            ))}
          </ol>
          <Soon action="Export activity" />
          <Soon action="View live analytics" />
        </Panel>
      </>
    );
  if (modules[section]) return <Module key={section} name={section} />;
  return <NotFound />;
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
