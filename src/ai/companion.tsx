import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
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
  const [generated, setGenerated] = useState(0);
  const worker = useRef<Worker | null>(null);
  const timeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const topics = useRef<string[]>([]);
  const log = useRef<HTMLDivElement>(null);
  const busy = status === "loading" || status === "generating";
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, page]);
  useEffect(() => {
    let live = true;
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
      worker.current?.terminate();
      clearTimeout(timeout.current);
    };
  }, [account]);
  function stop() {
    worker.current?.terminate();
    worker.current = null;
    clearTimeout(timeout.current);
    setStatus("not-loaded");
    setProgress("");
    setNotice("Stopped. Load Offline AI to continue.");
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
        const text = safeOutput(String(data.text));
        setGenerated((n) => n + 1);
        setMessages((items) =>
          [
            ...items,
            {
              role: "assistant" as const,
              text:
                text ||
                "I couldn't produce a reliable reply. I can listen to everyday worries; please seek a qualified professional for personal health questions.",
              label: text ? "Offline AI" : "Safety fallback",
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
  }
  function send() {
    const text = input.trim();
    if (!text || busy) return;
    const safe = safetyCheck(text);
    if (!safe && status !== "ready") {
      setNotice(
        hasModel
          ? "Load Offline AI before chatting."
          : "Install Offline AI in AI settings to chat on a compatible device.",
      );
      return;
    }
    setInput("");
    setNotice("");
    setMessages((items) =>
      [
        ...items,
        { role: "user" as const, text },
        ...(safe
          ? [
              {
                role: "assistant" as const,
                text: safe.text,
                label: "Safety information · Not AI-generated",
                source: safe.source,
              },
            ]
          : []),
      ].slice(-40),
    );
    if (safe) return;
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
      length,
      tone,
    });
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
          <section>
            <h3>Offline MatriSathi</h3>
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
                    Install Offline AI
                  </button>
                ) : (
                  <>
                    <button
                      className="button primary"
                      disabled={status === "ready" || !device?.supported}
                      onClick={() => load(false)}
                    >
                      Load Offline AI
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
                  className="button secondary"
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
            <h3>MatriSathi Offline</h3>
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
            MatriSathi is an AI companion, not a healthcare professional.
            English · Offline only.
          </p>
          {hasModel && status !== "ready" && !busy && (
            <button className="button secondary" onClick={() => load(false)}>
              Load Offline AI
            </button>
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
          <button className="button secondary" onClick={stop}>
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
