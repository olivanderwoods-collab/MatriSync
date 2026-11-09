import { Companion } from "./ai/companion";
import { useEffect, useState } from "react";
import { Link, NavLink } from "react-router-dom";
import { Camera, Mic, X } from "lucide-react";
import {
  checkPairs,
  demoDatabaseEnabled,
  loadDemoDatabase,
  lookup,
  normalizeName,
  suggestions,
  type DemoDatabase,
  type Medicine,
  type Source,
} from "./medicine";

const topics = [
  ["preconception", "Preconception", "Planning ahead"],
  ["pregnancy", "Pregnancy", "Your pregnancy journey"],
  ["nutrition", "Food & nutrition", "Food and everyday care"],
  ["sleep", "Sleep", "Rest and routines"],
  ["postpartum", "Postpartum", "After birth"],
  ["breastfeeding", "Breastfeeding", "Feeding your baby"],
  ["childcare", "Newborn & childcare", "Growing together"],
  ["wellbeing", "Wellbeing", "Caring for yourself"],
];
function Education({ topic }: { topic?: string }) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("all");
  const active = topics.find((t) => t[0] === topic);
  if (topic)
    return (
      <section className="panel article-preview">
        <Link className="back-link" to="/mother/matrisathi/information">
          ← Back to topics
        </Link>
        <h2>{active?.[1] || "Topic unavailable"}</h2>
        <p>
          {active
            ? "The article and its sources will appear here after review."
            : "Choose a topic from the menu."}
        </p>
        {active && (
          <div className="article-video">
            <button className="button secondary" disabled>
              Watch Video
            </button>
            <p className="small muted">Video link pending.</p>
          </div>
        )}
      </section>
    );
  const filtered = topics.filter(
    (t) =>
      (category === "all" || t[0] === category) &&
      normalizeName(t.slice(1).join(" ")).includes(normalizeName(query)),
  );
  return (
    <section className="panel">
      <div className="topic-filters">
        <label>
          Search topics
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Find a topic"
          />
        </label>
        <label>
          Browse categories
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            <option value="all">All topics</option>
            {topics.map((t) => (
              <option key={t[0]} value={t[0]}>
                {t[1]}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="topic-grid">
        {filtered.map((t) => (
          <Link
            className="topic-card"
            key={t[0]}
            to={`/mother/matrisathi/information/${t[0]}`}
          >
            <h2>{t[1]}</h2>
            <p>{t[2]}</p>
            <span className="small muted">Article pending review</span>
          </Link>
        ))}
      </div>
      {!filtered.length && <p role="status">No matching topics.</p>}
    </section>
  );
}
function Sources({ sources }: { sources: Source[] }) {
  return (
    <details className="source-list">
      <summary>Sources supplied with this draft</summary>
      <ul>
        {sources.map((s, i) => (
          <li key={`${s.url}-${i}`}>
            {/^https:\/\//i.test(s.url) ? (
              <a href={s.url} target="_blank" rel="noopener noreferrer">
                {s.title}
              </a>
            ) : (
              s.title
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
function MedicineResult({
  db,
  medicine,
}: {
  db: DemoDatabase;
  medicine: Medicine;
}) {
  const record = db.catalogue.medicines.find(
    (m) => m.id === medicine.legacy_id,
  );
  if (!record) return <p>Catalogue details unavailable for {medicine.name}.</p>;
  return (
    <article className="medicine-result">
      <span className="draft-label">Demo database · Unverified</span>
      <h3>{medicine.name}</h3>
      <dl className="record-details">
        <div>
          <dt>Class</dt>
          <dd>{record.plain_language.drug_class}</dd>
        </div>
        <div>
          <dt>Description in supplied draft</dt>
          <dd>{record.plain_language.mechanism}</dd>
        </div>
        <div>
          <dt>Uses listed in draft</dt>
          <dd>{record.plain_language.uses}</dd>
        </div>
        <div>
          <dt>Pregnancy context in draft</dt>
          <dd>{record.pregnancy_context}</dd>
        </div>
      </dl>
      <Sources
        sources={record.context_source_ids
          .map((id) => db.catalogue.sources[id])
          .filter(Boolean)}
      />
    </article>
  );
}
type Entry = { input: string; medicine?: Medicine };
function DrugSearch({ db }: { db: DemoDatabase }) {
  const [mode, setMode] = useState("single");
  const [value, setValue] = useState("");
  const [entries, setEntries] = useState<Entry[]>([]);
  const [result, setResult] = useState<Entry[] | null>(null);
  const [candidates, setCandidates] = useState<Medicine[]>([]);
  const [message, setMessage] = useState("");
  const [camera, setCamera] = useState(false);
  const interaction = mode === "interaction";
  function accept(entry: Entry) {
    setCandidates([]);
    if (!interaction) {
      setResult([entry]);
      return;
    }
    if (entries.length >= 10) {
      setMessage("You can add up to 10 drugs or herbs.");
      return;
    }
    if (
      entries.some(
        (e) =>
          normalizeName(e.input) === normalizeName(entry.input) ||
          (entry.medicine && entry.medicine.id === e.medicine?.id),
      )
    ) {
      setMessage(
        "This medicine is already added. Check for duplicate products.",
      );
      return;
    }
    setEntries([...entries, entry]);
    setValue("");
    setResult(null);
    setMessage("");
  }
  function submit() {
    if (!value.trim()) return;
    const found = lookup(db, value);
    setResult(null);
    setMessage("");
    if (found.length > 1) {
      setCandidates(found);
      return;
    }
    accept({ input: value.trim(), medicine: found[0] });
  }
  const found = result?.flatMap((e) => (e.medicine ? [e.medicine] : [])) || [];
  const missing = result?.filter((e) => !e.medicine) || [];
  const pairs = interaction && found.length >= 2 ? checkPairs(db, found) : [];
  return (
    <>
      <div
        className="choice-row drug-modes"
        aria-label="Drug information options"
      >
        {[
          ["single", "Drug/Herb search"],
          ["interaction", "Interaction checker"],
        ].map(([id, label]) => (
          <button
            className="button secondary"
            key={id}
            aria-pressed={mode === id}
            onClick={() => {
              setMode(id);
              setResult(null);
              setCandidates([]);
              setMessage("");
              setValue("");
            }}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="draft-notice">
        <strong>Test database · Not clinically verified</strong>
        <p>
          Supplied draft content only. Do not start, stop or change treatment
          from these results.
        </p>
      </div>
      <div className={`drug-workspace ${result ? "has-results" : ""}`}>
        <div className="drug-controls">
          <form
            className="drug-search"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <label htmlFor="medicine-name">
              {interaction
                ? "Add drugs or herbs, one at a time"
                : "Drug or herb name"}
            </label>
            <div className="search-row">
              <input
                id="medicine-name"
                list="medicine-names"
                autoComplete="off"
                maxLength={120}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  setCandidates([]);
                  setResult(null);
                  setMessage("");
                }}
                placeholder="Type a name"
              />
              <button
                className="button primary"
                disabled={
                  !value.trim() || (interaction && entries.length >= 10)
                }
              >
                {interaction ? "Add" : "Search"}
              </button>
            </div>
            <datalist id="medicine-names">
              {suggestions(db, value).map((m) => (
                <option key={m.id} value={m.name} />
              ))}
            </datalist>
            <div className="media-options">
              <button
                type="button"
                className="button secondary"
                disabled
                aria-label="Microphone — online recognition disabled"
              >
                <Mic size={18} />
                Mic
              </button>
              <button
                type="button"
                className="button secondary"
                aria-expanded={camera}
                onClick={() => setCamera(!camera)}
              >
                <Camera size={18} />
                Camera
              </button>
              <span className="small muted">
                Online voice and image recognition are disabled.
              </span>
            </div>
            {camera && (
              <div className="media-preview">
                <p>For packaged medicines, use a clear photo of the label.</p>
                <div className="choice-row">
                  <button type="button" className="button secondary" disabled>
                    Upload from device
                  </button>
                  <button type="button" className="button secondary" disabled>
                    Capture
                  </button>
                </div>
              </div>
            )}
          </form>
          {!!candidates.length && (
            <div className="candidate-list">
              <h3>Did you mean this?</h3>
              <p>Choose the exact catalogue entry.</p>
              {candidates.map((m) => (
                <button
                  className="button secondary"
                  key={m.id}
                  onClick={() => accept({ input: m.name, medicine: m })}
                >
                  {m.name}
                </button>
              ))}
              <button
                className="text-link"
                onClick={() => {
                  setCandidates([]);
                  setMessage(
                    "Enter the generic name or exact ingredients. Online name resolution is not connected.",
                  );
                }}
              >
                No
              </button>
            </div>
          )}
          {interaction && (
            <>
              <ul className="medicine-chips">
                {entries.map((entry, i) => (
                  <li key={entry.input}>
                    <span>{entry.medicine?.name || entry.input}</span>
                    <button
                      className="icon-button"
                      aria-label={`Remove ${entry.input}`}
                      onClick={() => {
                        setEntries(entries.filter((_, n) => n !== i));
                        setResult(null);
                        setMessage("");
                      }}
                    >
                      <X size={16} />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="search-row">
                <span className="small muted">{entries.length} / 10 added</span>
                {entries.length >= 2 && (
                  <button
                    className="button primary"
                    onClick={() => {
                      setResult([...entries]);
                      setCandidates([]);
                    }}
                  >
                    Search
                  </button>
                )}
              </div>
            </>
          )}
          {message && <p role="status">{message}</p>}
        </div>
        {result && (
          <div className="drug-results" aria-live="polite">
            {interaction && (
              <>
                <h3>Test results</h3>
                <p>
                  {found.length} found in the demo database · {missing.length}{" "}
                  not found
                </p>
                {!!found.length && (
                  <p>Found: {found.map((m) => m.name).join(", ")}</p>
                )}
              </>
            )}
            {!!missing.length && (
              <div className="missing-result">
                <h3>No data found in database</h3>
                <p>{missing.map((e) => e.input).join(", ")}</p>
                <p>Would you like to search online?</p>
                <button className="button secondary" disabled>
                  Search Online
                </button>
                <p className="small muted">
                  Online research disabled pending a secure free proxy. Future
                  results: “Unverified Internet Research — Not verified in
                  MatriSync.”
                </p>
              </div>
            )}
            {!interaction &&
              found.map((m) => (
                <MedicineResult key={m.id} db={db} medicine={m} />
              ))}
            {interaction &&
              pairs.map(({ a, b, pair, rules }) => (
                <article className="medicine-result" key={`${a.id}-${b.id}`}>
                  <span className="draft-label">
                    Demo database · Unverified
                  </span>
                  <h3>
                    {a.name} + {b.name}
                  </h3>
                  {!rules.length ? (
                    <p>
                      Unresolved — interaction information is incomplete for
                      this combination.
                    </p>
                  ) : (
                    <>
                      <p>
                        <strong>Potential interaction in supplied draft</strong>
                      </p>
                      <p className="small">
                        Route and individual context have not been checked. This
                        is not a patient-specific assessment.
                      </p>
                      {rules.map((rule) => (
                        <details className="interaction-rule" key={rule.id}>
                          <summary>{rule.plain_language.effect}</summary>
                          <p>{rule.plain_language.action}</p>
                          <p>
                            <strong>Applies to:</strong> {rule.conditions}
                          </p>
                          <p className="small">
                            Draft severity: {rule.severity} · Not validated
                          </p>
                          <Sources
                            sources={rule.source_ids
                              .map((id) => db.interactions.sources_by_id[id])
                              .filter(Boolean)}
                          />
                        </details>
                      ))}
                    </>
                  )}
                  {!!pair?.potential_shared_ingredients.length && (
                    <p>
                      Possible shared ingredients:{" "}
                      {pair.potential_shared_ingredients.join(", ")}.
                      Formulation review required.
                    </p>
                  )}
                </article>
              ))}
            {interaction && (
              <p className="small muted">
                Pairwise draft lookup only. Missing or unresolved results do not
                establish safety, including pregnancy safety. Effects involving
                three or more medicines are not assessed.
              </p>
            )}
          </div>
        )}
      </div>
    </>
  );
}
function DrugInformation() {
  const [db, setDb] = useState<DemoDatabase>();
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let live = true;
    if (demoDatabaseEnabled)
      loadDemoDatabase()
        .then((value) => {
          if (live) setDb(value);
        })
        .catch((e) => {
          if (live) setError(e.message);
        });
    return () => {
      live = false;
    };
  }, [attempt]);
  if (!demoDatabaseEnabled)
    return (
      <p>
        The test database is available only in the local testing build. The
        verified database is pending.
      </p>
    );
  if (error)
    return (
      <>
        <p role="alert">{error}</p>
        <button
          className="button secondary"
          onClick={() => {
            setError("");
            setAttempt(attempt + 1);
          }}
        >
          Retry
        </button>
      </>
    );
  if (!db) return <p role="status">Loading the test database…</p>;
  return <DrugSearch db={db} />;
}
export function MatriSathi({
  section,
  detail,
  account = false,
}: {
  section: string;
  detail?: string;
  account?: boolean;
}) {
  const companion = section === "companion";
  return (
    <>
      <div className="page-title">
        <div>
          <h1>MatriSathi</h1>
        </div>
      </div>
      <nav className="tabs" aria-label="Section tabs">
        <NavLink to="/mother/matrisathi/information">
          Information & Education
        </NavLink>
        <NavLink to="/mother/matrisathi/companion">RUHI · AI Companion</NavLink>
      </nav>
      {!companion ? (
        <Education topic={detail} />
      ) : (
        <section className="panel">
          <nav className="tabs" aria-label="Companion options">
            <NavLink to="/mother/matrisathi/companion/chat">Chat</NavLink>
            <NavLink to="/mother/matrisathi/companion/drugs">
              Drug information
            </NavLink>
          </nav>
          {detail === "drugs" ? (
            <DrugInformation />
          ) : (
            <Companion page={detail || "chat"} account={account} />
          )}
        </section>
      )}
    </>
  );
}
