import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Beaker,
  Bot,
  Clock3,
  GitCompareArrows,
  LayoutDashboard,
  LockKeyhole,
  Search,
  ShieldCheck,
} from "lucide-react";
import { request } from "./api";
import ReviewWorkbench from "./ReviewWorkbench";
import RunReport from "./RunReport";
import {
  metric,
  type Benchmark,
  type Comparison,
  type Overview,
  type Run,
} from "./pro";

type View =
  | "Overview"
  | "Benchmarks"
  | "Workspace"
  | "Comparisons"
  | "History"
  | "Human review";
const views: [View, typeof Activity][] = [
  ["Overview", LayoutDashboard],
  ["Benchmarks", Beaker],
  ["Workspace", Activity],
  ["Comparisons", GitCompareArrows],
  ["History", Clock3],
  ["Human review", ShieldCheck],
];
export default function App() {
  const [view, setView] = useState<View>("Overview");
  const [benchmarks, setBenchmarks] = useState<Benchmark[]>([]);
  const [selectedId, setSelectedId] = useState("PY-001");
  const selected = benchmarks.find((t) => t.id === selectedId);
  const [token, setToken] = useState("");
  const [draftToken, setDraftToken] = useState("");
  const [configured, setConfigured] = useState(false);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [history, setHistory] = useState<Run[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [comparison, setComparison] = useState<Comparison[]>([]);
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState("");
  const [taskFilter, setTaskFilter] = useState("");
  const [version, setVersion] = useState("");
  const [mode, setMode] = useState("trusted_fixture");
  const [fixture, setFixture] = useState("reference");
  const [source, setSource] = useState("");
  const [model, setModel] = useState("Human baseline");
  const [modelVersion, setModelVersion] = useState("unspecified");
  const [provider, setProvider] = useState("");
  const [tokens, setTokens] = useState("");
  const [cost, setCost] = useState("");
  const [run, setRun] = useState<Run | null>(null);
  const [revision, setRevision] = useState(0);
  const auth = { Authorization: `Bearer ${token}` };
  async function loadCatalog() {
    setCatalogLoading(true);
    setError("");
    try {
      const [tasks, caps] = await Promise.all([
        request<Benchmark[]>("/api/pro/benchmarks"),
        request<{ workspace_configured: boolean }>("/api/pro/capabilities"),
      ]);
      setBenchmarks(tasks);
      setConfigured(caps.workspace_configured);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCatalogLoading(false);
    }
  }
  useEffect(() => {
    void loadCatalog();
  }, []);
  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const params = new URLSearchParams({
      q: query,
      task_id: taskFilter,
      language,
      dataset_version: version,
      offset: String(offset),
    });
    const path =
      view === "Comparisons"
        ? `/api/pro/comparisons?${params}`
        : view === "History"
          ? `/api/pro/evaluations?${params}`
          : "/api/pro/overview";
    setError("");
    request<Overview | Comparison[] | { items: Run[]; total: number }>(path, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((data) => {
        if (cancelled) return;
        if (Array.isArray(data)) setComparison(data);
        else if ("items" in data) {
          setHistory(data.items);
          setTotal(data.total);
        } else setOverview(data);
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
    };
  }, [token, view, query, language, taskFilter, version, offset, revision]);
  function choose(task: Benchmark) {
    setSelectedId(task.id);
    setMode(
      task.execution_support === "trusted_fixture"
        ? "trusted_fixture"
        : "imported",
    );
    setRun(null);
    setView("Workspace");
  }
  async function evaluate() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setRun(null);
    try {
      const body = {
        task_id: selected.id,
        dataset_version: selected.dataset_version,
        mode,
        ...(mode === "trusted_fixture"
          ? { fixture_id: fixture }
          : {
              source,
              model_label: model,
              model_version: modelVersion,
              provider: provider || null,
              tokens: tokens === "" ? null : Number(tokens),
              cost_usd: cost === "" ? null : Number(cost),
            }),
      };
      setRun(
        await request<Run>("/api/pro/evaluations", {
          method: "POST",
          headers: auth,
          body: JSON.stringify(body),
        }),
      );
      setRevision((x) => x + 1);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function openRun(id: string) {
    setError("");
    try {
      const result = await request<Run>(`/api/pro/evaluations/${id}`, {
        headers: auth,
      });
      setRun(result);
      setView("History");
    } catch (e) {
      setError((e as Error).message);
    }
  }
  function navigate(next: View) {
    setView(next);
    setQuery("");
    setLanguage("");
    setTaskFilter("");
    setVersion("");
    setOffset(0);
    setRun(null);
  }
  const filtered = benchmarks.filter(
    (t) =>
      (!language || t.language === language) &&
      `${t.title} ${t.category} ${t.id}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  function runTable(rows: Run[]) {
    return rows.length ? (
      <div className="table">
        <table>
          <thead>
            <tr>
              <th>Benchmark / submission</th>
              <th>Evidence</th>
              <th>Status</th>
              <th>Tests</th>
              <th>Gate</th>
              <th>Report</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <strong>{r.task_title}</strong>
                  <small>{r.model_label}</small>
                </td>
                <td>{r.mode.replace(/_/g, " ")}</td>
                <td>{r.status}</td>
                <td>
                  {r.executed_tests
                    ? `${r.passed}/${r.executed_tests}`
                    : "Not executed"}
                </td>
                <td>
                  <span
                    className={`badge ${r.release_gate === "rejected" ? "bad" : ""}`}
                  >
                    {r.release_gate?.replace(/_/g, " ") ?? "Pending"}
                  </span>
                </td>
                <td>
                  <button
                    className="textButton"
                    onClick={() => void openRun(r.id)}
                    aria-label={`Open report ${r.id}`}
                  >
                    Open <ArrowRight size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    ) : (
      <div className="empty">
        <Beaker />
        <h3>No evaluations yet</h3>
        <p>
          Run a bundled fixture or import a solution to create an evidence
          record.
        </p>
        <button className="primary" onClick={() => navigate("Benchmarks")}>
          Explore benchmarks
        </button>
      </div>
    );
  }
  return (
    <div className="proApp">
      <aside className="sidebar">
        <a className="brand" href="#" onClick={() => navigate("Overview")}>
          <Bot />
          <span>
            AgentBench <b>Pro</b>
          </span>
        </a>
        <span className="sideLabel">EVALUATION PLATFORM</span>
        <nav aria-label="Workspace navigation">
          {views.map(([name, Icon]) => (
            <button
              key={name}
              aria-current={view === name ? "page" : undefined}
              className={view === name ? "active" : ""}
              onClick={() => navigate(name)}
            >
              <Icon size={18} />
              {name}
            </button>
          ))}
        </nav>
        <div className="sideFoot">
          <ShieldCheck size={18} />
          <b>Execution boundary</b>
          <p>
            Trusted fixtures only.
            <br />
            Imported code never runs.
          </p>
          <a
            href="https://github.com/yeabsira-mesfin/agentbench-swe"
            target="_blank"
            rel="noreferrer"
          >
            View source ↗
          </a>
        </div>
      </aside>
      <div className="proMain">
        <header className="topbar">
          <span>
            Workspace / <strong>{view}</strong>
          </span>
          <span className="badge good">Dataset 1.0.0</span>
        </header>
        <main className="proContent">
          <div className="pageHeading">
            <div>
              <span className="eyebrow">MEASURE. INSPECT. COMPARE.</span>
              <h1>
                {view === "Overview"
                  ? "Evidence before approval."
                  : view === "Benchmarks"
                    ? "Benchmark explorer"
                    : view === "Workspace"
                      ? "Evaluation workspace"
                      : view === "Comparisons"
                        ? "Compare the evidence"
                        : view === "History"
                          ? "Evaluation history"
                          : "Human review"}
              </h1>
              <p>
                {view === "Overview"
                  ? "Reproducible checks. Explicit limitations. Decisions you can explain."
                  : "Measured results and reviewer assessments remain separate."}
              </p>
            </div>
            {view === "Overview" && (
              <button
                className="primary"
                onClick={() => navigate("Benchmarks")}
              >
                New evaluation <ArrowRight size={16} />
              </button>
            )}
          </div>
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button
                className="secondary"
                onClick={() => {
                  void loadCatalog();
                  setRevision((x) => x + 1);
                }}
              >
                Retry
              </button>
            </div>
          )}
          <div className="boundary">
            <LockKeyhole size={18} />
            <span>
              <strong>Safe fixture mode.</strong> Python fixtures execute.
              Imported Python, JavaScript and TypeScript code is stored for
              inspection, with arbitrary execution disabled.
            </span>
          </div>
          {!token && view !== "Human review" && (
            <details className="connection" open={view === "Workspace"}>
              <summary>Connect private workspace</summary>
              <p>
                {configured
                  ? "Enter your workspace token to access persisted evaluations."
                  : "Workspace storage is not configured on this server. The catalog and human review remain available. See README for local setup."}{" "}
                The token stays in memory for this tab.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setToken(draftToken);
                  setDraftToken("");
                }}
              >
                <label htmlFor="token">Workspace token</label>
                <input
                  id="token"
                  type="password"
                  autoComplete="off"
                  value={draftToken}
                  onChange={(e) => setDraftToken(e.target.value)}
                  minLength={32}
                  required
                />
                <button className="secondary">Connect</button>
              </form>
            </details>
          )}
          {token && (
            <button
              className="textButton disconnect"
              onClick={() => {
                setToken("");
                setOverview(null);
                setHistory([]);
                setComparison([]);
                setRun(null);
              }}
            >
              Disconnect workspace
            </button>
          )}
          {view === "Overview" && (
            <>
              <div className="stats overviewStats">
                {[
                  ["Total evaluations", overview?.total],
                  ["Completed runs", overview?.completed],
                  [
                    "Failed / blocked",
                    overview
                      ? `${overview.failed} / ${overview.blocked}`
                      : undefined,
                  ],
                  [
                    "Fixture pass rate",
                    overview ? metric(overview.pass_rate, "%") : undefined,
                  ],
                  ["Security gate failures", overview?.security_gate_failures],
                ].map(([label, value]) => (
                  <div key={label}>
                    <span>{label}</span>
                    <b>{value ?? "Unavailable"}</b>
                  </div>
                ))}
              </div>
              <p className="notice">
                Pass rate counts completed fixture runs with every assertion
                passing ({overview?.pass_rate_denominator ?? 0} measured runs).
                It is not model performance or release approval.
              </p>
              <section className="panel">
                <div className="sectionHead">
                  <h2>Recent evaluations</h2>
                  <button
                    className="textButton"
                    onClick={() => navigate("History")}
                  >
                    View history <ArrowRight size={14} />
                  </button>
                </div>
                {runTable(overview?.recent ?? [])}
              </section>
              <div className="featureGrid">
                <article className="panel">
                  <Beaker />
                  <h3>Versioned benchmarks</h3>
                  <p>
                    Explore {benchmarks.length || "the"} original tasks across
                    validation, APIs, authorization and regression safety.
                  </p>
                </article>
                <article className="panel">
                  <ShieldCheck />
                  <h3>Gates beyond a score</h3>
                  <p>
                    Failures override weighted scores. Missing review evidence
                    prevents release approval.
                  </p>
                </article>
              </div>
            </>
          )}
          {["Benchmarks", "History", "Comparisons"].includes(view) && (
            <div className="toolbar">
              {view !== "Comparisons" && (
                <label className="search">
                  <Search size={16} />
                  <input
                    aria-label="Search"
                    placeholder={
                      view === "History"
                        ? "Search evaluations..."
                        : "Search benchmarks..."
                    }
                    value={query}
                    onChange={(e) => {
                      setQuery(e.target.value);
                      setOffset(0);
                    }}
                  />
                </label>
              )}
              <label>
                Language
                <select
                  value={language}
                  onChange={(e) => {
                    setLanguage(e.target.value);
                    setOffset(0);
                  }}
                >
                  <option value="">All languages</option>
                  {[...new Set(benchmarks.map((t) => t.language))].map((l) => (
                    <option key={l}>{l}</option>
                  ))}
                </select>
              </label>
              {view !== "Benchmarks" && (
                <>
                  <label>
                    Task
                    <select
                      value={taskFilter}
                      onChange={(e) => {
                        setTaskFilter(e.target.value);
                        setOffset(0);
                      }}
                    >
                      <option value="">All tasks</option>
                      {benchmarks.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.id}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Dataset
                    <select
                      value={version}
                      onChange={(e) => {
                        setVersion(e.target.value);
                        setOffset(0);
                      }}
                    >
                      <option value="">All versions</option>
                      <option>1.0.0</option>
                    </select>
                  </label>
                </>
              )}
            </div>
          )}
          {view === "Benchmarks" && (
            <>
              {catalogLoading ? (
                <p role="status">Loading benchmark catalog...</p>
              ) : (
                <div className="benchmarkGrid">
                  {filtered.map((t) => (
                    <article className="panel benchmarkCard" key={t.id}>
                      <div className="sectionHead">
                        <span className="eyebrow">{t.id}</span>
                        <span className="badge">{t.language}</span>
                      </div>
                      <h2>{t.title}</h2>
                      <p>{t.description}</p>
                      <div className="tags">
                        <span>{t.category}</span>
                        <span>{t.difficulty}</span>
                      </div>
                      <p className="notice">
                        {t.visible_tests.length} visible ·{" "}
                        {t.held_out_test_count} held-out · v{t.dataset_version}
                      </p>
                      <button className="secondary" onClick={() => choose(t)}>
                        Inspect task <ArrowRight size={16} />
                      </button>
                    </article>
                  ))}
                </div>
              )}
              {!catalogLoading && !filtered.length && (
                <p>No benchmarks match these filters.</p>
              )}
            </>
          )}
          {view === "Workspace" && selected && (
            <>
              <div className="workspaceGrid">
                <section className="panel">
                  <span className="eyebrow">BENCHMARK CONTRACT</span>
                  <label>
                    Task
                    <select
                      disabled={busy}
                      value={selectedId}
                      onChange={(e) => {
                        const task = benchmarks.find(
                          (t) => t.id === e.target.value,
                        );
                        if (task) choose(task);
                      }}
                    >
                      {benchmarks.map((t) => (
                        <option value={t.id} key={t.id}>
                          {t.id} · {t.title}
                        </option>
                      ))}
                    </select>
                  </label>
                  <h2>{selected.title}</h2>
                  <p>{selected.description}</p>
                  <h3>Input specification</h3>
                  <pre className="starter">{selected.input_specification}</pre>
                  <h3>Visible assertions</h3>
                  {selected.visible_tests.map((t) => (
                    <div className="visibleTest" key={t.id}>
                      <b>{t.id}</b>
                      <pre>
                        {JSON.stringify(t.input)} → {JSON.stringify(t.expected)}
                      </pre>
                    </div>
                  ))}
                  <p className="notice">
                    {selected.held_out_test_count} held-out tests are excluded
                    from public API responses. This public repository is not a
                    secret benchmark dataset.
                  </p>
                  <details>
                    <summary>Scoring and sandbox contract</summary>
                    <pre className="starter">
                      {JSON.stringify(
                        {
                          weights: selected.scoring_criteria,
                          proposed_sandbox_limits: selected.resource_limits,
                          timeout_seconds: selected.timeout_seconds,
                        },
                        null,
                        2,
                      )}
                    </pre>
                    <p>
                      Limits define the future sandbox contract. Trusted bundled
                      functions run without a candidate sandbox. Security
                      behavior checks act as a veto.
                    </p>
                  </details>
                </section>
                <section className="panel">
                  <span className="eyebrow">SUBMISSION</span>
                  <h2>Build an evidence record</h2>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void evaluate();
                    }}
                  >
                    <fieldset disabled={busy}>
                      <label>
                        Evaluation mode
                        <select
                          value={mode}
                          onChange={(e) => {
                            setMode(e.target.value);
                            setRun(null);
                          }}
                        >
                          <option
                            value="trusted_fixture"
                            disabled={
                              selected.execution_support !== "trusted_fixture"
                            }
                          >
                            Trusted bundled fixture
                          </option>
                          <option value="imported">
                            Imported solution (execution blocked)
                          </option>
                        </select>
                      </label>
                      {mode === "trusted_fixture" ? (
                        <>
                          <label>
                            Implementation
                            <select
                              value={fixture}
                              onChange={(e) => setFixture(e.target.value)}
                            >
                              <option value="reference">
                                Reference implementation
                              </option>
                              <option value="broken">
                                Intentionally faulty implementation
                              </option>
                            </select>
                          </label>
                          <p>
                            Runs fixed, developer-authored Python code against
                            the selected benchmark. Results are labeled as
                            bundled fixtures, never as a model's performance.
                          </p>
                        </>
                      ) : (
                        <>
                          <div className="formGrid">
                            <label>
                              Model / agent label
                              <input
                                required
                                maxLength={100}
                                value={model}
                                onChange={(e) => setModel(e.target.value)}
                              />
                            </label>
                            <label>
                              Model version
                              <input
                                required
                                maxLength={100}
                                value={modelVersion}
                                onChange={(e) =>
                                  setModelVersion(e.target.value)
                                }
                              />
                            </label>
                          </div>
                          <label>
                            Provider (optional)
                            <input
                              maxLength={100}
                              value={provider}
                              onChange={(e) => setProvider(e.target.value)}
                            />
                          </label>
                          <label>
                            Candidate source
                            <textarea
                              required
                              maxLength={20000}
                              value={source}
                              onChange={(e) => setSource(e.target.value)}
                              spellCheck={false}
                              placeholder="Paste a solution for storage and limited static inspection"
                            />
                          </label>
                          <div className="formGrid">
                            <label>
                              Reported tokens (optional)
                              <input
                                type="number"
                                min="0"
                                max="100000000"
                                step="1"
                                value={tokens}
                                onChange={(e) => setTokens(e.target.value)}
                              />
                            </label>
                            <label>
                              Reported cost, USD (optional)
                              <input
                                type="number"
                                min="0"
                                max="100000"
                                step="any"
                                value={cost}
                                onChange={(e) => setCost(e.target.value)}
                              />
                            </label>
                          </div>
                          <p className="notice">
                            Usage is user-supplied and unverified. Leave missing
                            values blank. Do not submit secrets or private
                            customer data.
                          </p>
                        </>
                      )}
                      <button className="primary" disabled={!token || busy}>
                        {busy
                          ? "Evaluating and saving..."
                          : mode === "trusted_fixture"
                            ? "Run fixture evaluation"
                            : "Import and inspect"}
                      </button>
                    </fieldset>
                  </form>
                  <p role="status">
                    {busy
                      ? "Running trusted checks or static inspection. Results will appear below."
                      : !token
                        ? "Connect a private workspace to save evaluations."
                        : "Ready for a submission."}
                  </p>
                </section>
              </div>
              {run && <RunReport run={run} />}
            </>
          )}
          {view === "History" && (
            <>
              <section className="panel">
                {runTable(history)}
                <div className="pagination">
                  <button
                    className="secondary"
                    disabled={offset === 0}
                    onClick={() => setOffset((x) => Math.max(0, x - 25))}
                  >
                    Previous
                  </button>
                  <span>
                    {total
                      ? `${offset + 1}–${Math.min(offset + 25, total)} of ${total}`
                      : "0 evaluations"}
                  </span>
                  <button
                    className="secondary"
                    disabled={offset + 25 >= total}
                    onClick={() => setOffset((x) => x + 25)}
                  >
                    Next
                  </button>
                </div>
              </section>
              {run && <RunReport run={run} />}
            </>
          )}
          {view === "Comparisons" && (
            <section className="panel">
              <h2>Comparable runs</h2>
              <p>
                Grouped by model, provider, task, dataset, execution mode,
                policy and engine hash. Imported solutions have no measured pass
                rate. Reported usage is unverified.
              </p>
              {!comparison.length ? (
                <p>
                  No evaluations match. Connect your workspace and create
                  evaluations first.
                </p>
              ) : (
                <div className="table">
                  <table>
                    <thead>
                      <tr>
                        <th>Submission / task</th>
                        <th>Evidence</th>
                        <th>Pass rate</th>
                        <th>Correctness</th>
                        <th>Security failures</th>
                        <th>Regressions</th>
                        <th>Duration</th>
                        <th>Tokens / USD</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comparison.map((c, i) => (
                        <tr key={i}>
                          <td>
                            <strong>{c.model_label}</strong>
                            <small>
                              {c.model_version} · {c.task_id} · dataset{" "}
                              {c.dataset_version}
                            </small>
                            <details>
                              <summary>Reproducibility</summary>
                              <small>
                                Provider: {c.provider ?? "Unavailable"}
                                <br />
                                Policy: {c.policy_version}
                                <br />
                                Engine: {c.engine_sha256}
                              </small>
                            </details>
                          </td>
                          <td>
                            {c.mode.replace(/_/g, " ")}
                            <small>
                              {c.measured_runs}/{c.runs} measured
                            </small>
                          </td>
                          <td>
                            {metric(c.pass_rate, "%")}
                            {c.pass_rate !== null && (
                              <meter
                                min={0}
                                max={100}
                                value={c.pass_rate}
                                aria-label={`${c.model_label} pass rate`}
                              />
                            )}
                          </td>
                          <td>{metric(c.correctness_score)}</td>
                          <td>{c.security_gate_failures}</td>
                          <td>{c.regression_failures}</td>
                          <td>{metric(c.duration_ms, " ms")}</td>
                          <td>
                            {metric(c.reported_tokens)} /{" "}
                            {metric(c.reported_cost_usd)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          )}
          {view === "Human review" && (
            <div className="legacy">
              <ReviewWorkbench />
            </div>
          )}
          <footer>
            AgentBench Pro · Original benchmark fixtures · Evidence provenance
            preserved
          </footer>
        </main>
      </div>
    </div>
  );
}
