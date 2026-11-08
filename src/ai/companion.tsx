import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { careEnabled, careFactQuestion, type CareView } from "../care-model";
import { careFactAnswer } from "../care-facts";
import { scriptedCompanion } from "./scripted";
import { DocumentContextPanel } from "./document-context-panel";
import { documentQuestion, documentAnswer, type ReviewedDocument } from "./document-context";
import {
  AI_FLAGS,
  GEMINI_MODEL,
  OFFLINE_MODEL,
  PROVIDER_BLOCKERS,
  TAVILY_PLAN,
} from "./config";
import {
  capability,
  installed,
  mb,
  modelWorker,
  removeModel,
  type Capability,
} from "./offline";
import { safetyCheck, safeOutput } from "./safety";
import { useLocalCompanionProfile, useRecords } from "../records";
import {
  profileContextEnabled,
  saveProfileContextPreference,
} from "./preferences";
import {
  BEHAVIOR_VERSION,
  COMPANION_IDENTITY,
  confusesCompanionWithUser,
  addressReply,
  profileQuestion,
  savedProfileAnswer,
  type CompanionProfile,
} from "./behavior";

const root = "/mother/matrisathi/companion";
type Message = {
  role: "user" | "assistant";
  text: string;
  label?: string;
  source?: string;
};
type Status = "not-loaded" | "loading" | "ready" | "generating" | "error";
export function Companion({
  page,
  account,
}: {
  page: string;
  account: boolean;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("not-loaded");
  const [hasModel, setHasModel] = useState(false);
  const [device, setDevice] = useState<Capability>();
  const [notice, setNotice] = useState("");
  const [progress, setProgress] = useState("");
  const [confirm, setConfirm] = useState(false);
  const [length, setLength] = useState<"short" | "medium">("short");
  const [tone, setTone] = useState<"gentle" | "practical">("gentle");
  const [context, setContext] = useState(true);
  const { vault } = useRecords();
  const profileAccount = account ? vault?.uid : undefined;
  const [useProfile, setUseProfile] = useState(() =>
    profileContextEnabled(profileAccount),
  );
  const loadProfile = useLocalCompanionProfile();
  const [generated, setGenerated] = useState(0);
  const [reviewedDocument, setReviewedDocument] = useState<ReviewedDocument>();
  const worker = useRef<Worker | null>(null);
  const replyProfile = useRef<CompanionProfile | undefined>(undefined);
  const operation = useRef(0);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const topics = useRef<string[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const busy = status === "loading" || status === "generating";
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, page]);
  useEffect(() => {
    let live = true;
    const operations = operation;
    capability().then((value) => {
      if (live) setDevice(value);
    });
    if (account)
      installed()
        .then((value) => {
          if (live) setHasModel(value);
        })
        .catch(() => {
          if (live) setNotice("Model cache could not be read.");
        });
    return () => {
      live = false;
      operations.current++;
      worker.current?.terminate();
      worker.current = null;
      clearTimeout(timeout.current);
    };
  }, [account]);
  function stop() {
    replyProfile.current = undefined;
    operation.current++;
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timeout.current);
    setStatus("not-loaded");
    setProgress("");
    setNotice("Stopped. Load MatriSathi to continue.");
    if (!hasModel)
      void removeModel().catch(() =>
        setNotice(
          "Stopped. Partial files may remain; use your browser's site storage settings to remove them.",
        ),
      );
  }
  function fail(message: string) {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timeout.current);
    setStatus("error");
    setNotice(message);
    setProgress("");
  }
  function load(install: boolean) {
    if (!account || !AI_FLAGS.offlineInstallation || !device?.supported || busy)
      return;
    operation.current++;
    setConfirm(false);
    setNotice("");
    setStatus("loading");
    setProgress(install ? "Starting download…" : "Loading from this device…");
    worker.current?.terminate();
    const instance = modelWorker();
    worker.current = instance;
    timeout.current = setTimeout(
      () =>
        fail(
          "The model took too long to start. Try again manually on a device with more available memory.",
        ),
      15 * 60_000,
    );
    instance.onerror = () =>
      fail(
        "Offline AI could not start on this device. Other MatriSync features remain available.",
      );
    instance.onmessage = ({ data }) => {
      if (worker.current !== instance) return;
      if (data.type === "progress") {
        const p = data.progress;
        if (p.status === "progress" && typeof p.progress === "number")
          setProgress(
            `Downloading ${p.file || "model files"}: ${Math.round(p.progress)}%`,
          );
        if (p.status === "done") setProgress("Preparing model…");
      } else if (data.type === "ready") {
        clearTimeout(timeout.current);
        setHasModel(true);
        setStatus("ready");
        setProgress("");
      } else if (data.type === "error") fail(data.message);
      else if (data.type === "result") {
        clearTimeout(timeout.current);
        const output = safeOutput(String(data.text));
        const text =
          output && !confusesCompanionWithUser(output, replyProfile.current)
            ? output
            : "";
        setGenerated((n) => n + 1);
        setMessages((items) =>
          [
            ...items,
            {
              role: "assistant" as const,
              text:
                (text && addressReply(text, replyProfile.current)) ||
                "Thank you for sharing that. I couldn't form a reliable reply this time. You can tell me more about what's on your mind; for personal health questions, please speak with your care team.",
              label: text
                ? "MatriSathi · Offline AI"
                : "Safety fallback · Not AI-generated",
            },
          ].slice(-40),
        );
        setStatus("ready");
      }
    };
    instance.postMessage({ type: "load", install });
  }
  function clear() {
    if (busy) stop();
    setMessages([]);
    topics.current = [];
    setInput("");
    setReviewedDocument(undefined);
  }
  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    const scripted = status !== "ready" ? scriptedCompanion(text, !account) : undefined;
    if (scripted) {
      setMessages(items => [...items,{role:"user" as const,text},{role:"assistant" as const,text:scripted,label:"MatriSathi · Scripted response · Not generative AI"}].slice(-40));
      setInput("");setNotice("");return;
    }
    if (careEnabled && careFactQuestion(text)) {
      try {
        let linked: CareView | undefined;
        if (profileAccount && useProfile) {
          const { savedCareIds, readCareCopy } = await import("../care-storage");
          for (const id of await savedCareIds(profileAccount)) {
            const copy = await readCareCopy(profileAccount, id);
            if (copy?.motherUid === profileAccount) { linked = copy; break; }
          }
        }
        setMessages(items => [...items, { role: "user" as const, text }, { role: "assistant" as const, text: careFactAnswer(text, linked)!, label: "Recorded care detail · Exact read-back · Not AI-generated" }].slice(-40));
        setInput(""); setNotice("");
      } catch { setNotice("Your saved care details could not be opened. Load your linked profile and try again."); }
      return;
    }
    if (documentQuestion(text)) {
      const accepted = reviewedDocument?.uid === profileAccount ? reviewedDocument : undefined;
      setMessages(items => [...items, { role: "user" as const, text }, {
        role: "assistant" as const, text: documentAnswer(accepted), label: "Reviewed document · Exact read-back · Not AI-generated",
      }].slice(-40));
      setInput(""); setNotice("");
      return;
    }
    const profileRequest = profileQuestion(text);
    const safe = profileRequest ? undefined : safetyCheck(text);
    if (!safe && !profileRequest && status !== "ready") {
      setNotice(
        hasModel
          ? "Load MatriSathi before chatting."
          : "Install MatriSathi in AI settings to chat on a compatible device.",
      );
      return;
    }
    let profile: CompanionProfile | undefined;
    const request = ++operation.current;
    const previousStatus = status;
    const activeWorker = worker.current;
    if (!safe && account && useProfile) {
      setStatus("generating");
      try {
        profile = await loadProfile();
      } catch {
        if (operation.current !== request) return;
        setStatus(previousStatus);
        setNotice(
          "Open Profile Settings to connect your existing records, or turn off local profile context in AI settings.",
        );
        return;
      }
      if (operation.current !== request || worker.current !== activeWorker)
        return;
    }
    setInput("");
    setNotice("");
    const savedReply = profileRequest
      ? savedProfileAnswer(profileRequest, profile)
      : undefined;
    setMessages((items) =>
      [
        ...items,
        { role: "user" as const, text },
        ...(safe || savedReply
          ? [
              {
                role: "assistant" as const,
                text: safe?.text || savedReply!,
                label: safe
                  ? "Safety information · Not AI-generated"
                  : "Saved profile · Not AI-generated",
                source: safe?.source,
              },
            ]
          : []),
      ].slice(-40),
    );
    if (safe || savedReply) {
      if (savedReply) setStatus(previousStatus);
      return;
    }
    setStatus("generating");
    timeout.current = setTimeout(
      () =>
        fail(
          "Local generation timed out. No cloud request was made. You can load the model and try again.",
        ),
      120_000,
    );
    // Store only broad topics in memory, never verbatim previous messages as
    // hidden context. The visible transcript is discarded on leaving this area.
    worker.current?.postMessage({
      type: "generate",
      text,
      context: context ? topics.current.join(", ") : "",
      profile,
      length,
      tone,
    });
    replyProfile.current = profile;
    const tags = [
      "lonely",
      "family",
      "friend",
      "scared",
      "giving birth",
      "happy",
      "sad",
      "hobby",
      "music",
    ].filter((tag) => text.toLowerCase().includes(tag));
    topics.current = [...new Set([...topics.current, ...tags])].slice(-6);
  }
  const offline = (
    <>
      <p>
        <strong>
          {hasModel ? "Installed on this device" : "Not installed"}
        </strong>{" "}
        · {status.replace("-", " ")}
      </p>
      <p className="small">{device?.message || "Checking device…"}</p>
      <p className="small muted">
        Model weights: {mb(OFFLINE_MODEL.weightBytes)}. Estimated full
        installation: {mb(OFFLINE_MODEL.estimatedInstallBytes)}. Keep at least
        1.3 GB free.
      </p>
      {device?.availableBytes !== undefined && (
        <p className="small">
          Estimated browser space available: {mb(device.availableBytes)}
        </p>
      )}
    </>
  );
  return (
    <div className="ai-workspace" data-model-status={status}>
      <div className="ai-toolbar">
        <h2>
          {page === "settings"
            ? "AI settings"
            : page === "usage"
              ? "AI Usage Dashboard"
              : "Chat"}
        </h2>
        <nav aria-label="AI tools">
          {page !== "chat" && (
            <Link className="text-link" to={`${root}/chat`}>
              Back to Chat
            </Link>
          )}
          {page !== "settings" && (
            <Link className="text-link" to={`${root}/settings`}>
              AI settings
            </Link>
          )}
          {page !== "usage" && (
            <Link className="text-link" to={`${root}/usage`}>
              AI usage
            </Link>
          )}
        </nav>
      </div>
      {page === "settings" ? (
        <div className="ai-settings-grid">
          {account && profileAccount && <DocumentContextPanel key={profileAccount} uid={profileAccount} onAccept={setReviewedDocument} />}
          <section>
            <h3>MatriSathi · Offline companion</h3>
            <p className="small muted">{COMPANION_IDENTITY}</p>
            {offline}
            {!account && (
              <p className="notice">
                Sign in to install. Guest conversations remain temporary.
              </p>
            )}
            {!busy && (
              <div className="choice-row">
                {!hasModel ? (
                  <button
                    className="button primary"
                    disabled={
                      !account ||
                      !device?.supported ||
                      !AI_FLAGS.offlineInstallation
                    }
                    onClick={() => setConfirm(true)}
                  >
                    Install MatriSathi
                  </button>
                ) : (
                  <>
                    <button
                      className="button primary"
                      disabled={status === "ready" || !device?.supported}
                      onClick={() => load(false)}
                    >
                      Load MatriSathi
                    </button>
                    <button
                      className="button secondary"
                      onClick={async () => {
                        stop();
                        try {
                          await removeModel();
                          setHasModel(false);
                          setNotice("Offline model removed from this browser.");
                        } catch {
                          setNotice(
                            "Could not remove the model cache. Try clearing this site's storage in browser settings.",
                          );
                        }
                      }}
                    >
                      Remove model
                    </button>
                  </>
                )}
              </div>
            )}
            {confirm && (
              <div className="notice ai-install-confirm">
                <p>
                  Download approximately 620 MB from Hugging Face? Network data
                  charges may apply. Files stay in this browser; no chat or
                  patient records are sent. Browser storage may be evicted.
                </p>
                {device?.availableBytes !== undefined &&
                device.availableBytes < OFFLINE_MODEL.recommendedFreeBytes ? (
                  <p>Free more browser storage before installing.</p>
                ) : (
                  <button className="button primary" onClick={() => load(true)}>
                    Confirm download
                  </button>
                )}
                <button
                  className="button cancel"
                  onClick={() => setConfirm(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </section>
          <section>
            <h3>Conversation preferences</h3>
            <label>
              Response length
              <select
                value={length}
                onChange={(e) => setLength(e.target.value as typeof length)}
              >
                <option value="short">Short</option>
                <option value="medium">Medium</option>
              </select>
            </label>
            <label>
              Tone
              <select
                value={tone}
                onChange={(e) => setTone(e.target.value as typeof tone)}
              >
                <option value="gentle">Gentle</option>
                <option value="practical">Practical</option>
              </select>
            </label>
            <label>
              Language
              <select
                aria-label="AI language"
                value="English"
                onChange={() => {}}
              >
                <option>English</option>
              </select>
            </label>
            <p className="small muted">
              Other languages need safety validation.
            </p>
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={context}
                onChange={(e) => {
                  setContext(e.target.checked);
                  topics.current = [];
                }}
              />
              Remember brief topics in this conversation
            </label>
          </section>
          <section>
            <h3>Privacy & history</h3>
            <p>
              Messages stay in memory and clear when you leave this companion,
              sign out or reload. No chat history is saved to the cloud or
              device storage.
            </p>
            <button className="button secondary" onClick={clear}>
              Clear conversation
            </button>
          </section>
          <section>
            <h3>Online services</h3>
            <p>{PROVIDER_BLOCKERS.gemini}</p>
            <p>{PROVIDER_BLOCKERS.tavily}</p>
            <p className="small muted">
              Online image, voice and document analysis are disabled. Reports
              remain encrypted on your device.
            </p>
          </section>
          <section>
            <h3>Local profile context</h3>
            <label className="check-row">
              <input
                type="checkbox"
                checked={useProfile}
                disabled={!account || busy}
                onChange={(e) => {
                  const saved = saveProfileContextPreference(
                    profileAccount,
                    e.target.checked,
                  );
                  setUseProfile(saved && e.target.checked);
                  if (!saved)
                    setNotice(
                      "Profile context is off for this session. This browser could not save your preference; check it again after reopening the app.",
                    );
                }}
              />
              Use saved name and recorded pregnancy stage
            </label>
            <p className="small">
              Read on this device when you send a message. Report contents,
              clinical history, contacts and diagnoses are excluded. You can
              turn this off. Your choice is saved for this account on this
              browser.
            </p>
            <p className="small">
              Behavior instructions: {BEHAVIOR_VERSION}. These guide replies;
              they do not retrain the model.
            </p>
          </section>
        </div>
      ) : page === "usage" ? (
        <div className="ai-meter-grid">
          <section className="ai-meter">
            <h3>Tavily Web Research</h3>
            <p>Unavailable</p>
            <dl className="record-details">
              <div>
                <dt>Plan / published allocation</dt>
                <dd>{TAVILY_PLAN.name} · 1,000 credits/month</dd>
              </div>
              <div>
                <dt>Used / remaining / next reset</dt>
                <dd>Unavailable — provider not connected</dd>
              </div>
              <div>
                <dt>Search cost</dt>
                <dd>Basic: 1 credit · Advanced: 2 credits</dd>
              </div>
            </dl>
            <p className="small muted">
              Shared provider allowance. No balance is assumed; searches are
              disabled.
            </p>
          </section>
          <section className="ai-meter">
            <h3>Gemini Online AI</h3>
            <p>{GEMINI_MODEL} · Unavailable</p>
            <dl className="record-details">
              <div>
                <dt>MatriSync request budget</dt>
                <dd>0 — disabled</dd>
              </div>
              <div>
                <dt>
                  Tracked requests / input / output / thinking / total tokens
                </dt>
                <dd>Not connected — no usage metadata</dd>
              </div>
              <div>
                <dt>Provider balance</dt>
                <dd>Provider remaining quota unavailable</dd>
              </div>
            </dl>
            <p className="small muted">
              Project free tier, App Check and shared quotas must be verified
              before requests.
            </p>
          </section>
          <section className="ai-meter">
            <h3>MatriSathi · Offline</h3>
            {offline}
            <dl className="record-details">
              <div>
                <dt>Generations in this conversation session</dt>
                <dd>{generated}</dd>
              </div>
              <div>
                <dt>Generated tokens</dt>
                <dd>Not measured</dd>
              </div>
            </dl>
            <p className="small">Offline AI — No cloud token charges.</p>
          </section>
        </div>
      ) : (
        <>
          <p className="small muted">
            MatriSathi offers labelled scripted help without installation and
            optional local AI conversation. It is not a healthcare professional.
          </p>
          {hasModel && status !== "ready" && !busy && (
            <>
              <button
                className="button secondary"
                disabled={!device?.supported}
                onClick={() => load(false)}
              >
                Load MatriSathi
              </button>
              {!device?.supported && (
                <p className="small" role="status">
                  {device?.message || "Checking device compatibility…"}
                </p>
              )}
            </>
          )}
          <div
            ref={log}
            className="chat-messages"
            role="log"
            aria-label="Conversation"
          >
            {!messages.length && (
              <p className="chat-empty">
                A little space to talk about your day.
              </p>
            )}
            {messages.map((message, i) => (
              <article className={`chat-bubble ${message.role}`} key={i}>
                <span className="small muted">
                  {message.role === "user" ? "You" : message.label}
                </span>
                <p>{message.text}</p>
                {message.source && (
                  <a
                    href={message.source}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Safety guidance source
                  </a>
                )}
              </article>
            ))}
          </div>
          <form
            className="chat-compose"
            onSubmit={(e) => {
              e.preventDefault();
              send();
            }}
          >
            <div className="action-row">
              <button type="button" className="button secondary" disabled={busy} onClick={() => setInput("What is my name?")}>My saved profile</button>
              <button type="button" className="button secondary" disabled={busy} onClick={() => setInput("Read my document")}>Read my document</button>
            </div>
            <label htmlFor="companion-message">Your message</label>
            <textarea
              id="companion-message"
              maxLength={1500}
              rows={3}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Tell MatriSathi how you're feeling…"
            />
            <div className="ai-toolbar">
              <button
                className="text-link"
                type="button"
                disabled={!messages.length && !input}
                onClick={clear}
              >
                New chat
              </button>
              <button
                className="button primary"
                disabled={!input.trim() || busy}
              >
                Send
              </button>
            </div>
          </form>
          {!hasModel && (
            <p className="small muted">
              Install the optional model in AI settings for local chat. Safety
              information can be shown without a model.
            </p>
          )}
        </>
      )}
      {busy && (
        <div className="ai-operation" role="status">
          <span>
            {status === "generating"
              ? "MatriSathi is preparing a reply…"
              : progress || "Loading…"}
          </span>
          <button className="button cancel" onClick={stop}>
            {status === "loading" ? "Cancel" : "Stop"}
          </button>
        </div>
      )}
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
    </div>
  );
}
