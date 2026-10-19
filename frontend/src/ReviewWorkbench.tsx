import { useEffect, useState } from "react";
import { Bot, ShieldCheck, Download, CheckCircle2 } from "lucide-react";
import { request } from "./api";
type Task = {
  id: string;
  title: string;
  language: string;
  category: string;
  difficulty: string;
  description: string;
  context: string;
  starter_code: string;
  checks: { id: string; label: string }[];
};
type Report = {
  score: number;
  grade: string;
  task_id: string;
  release_ready: boolean;
  dimensions: Record<string, number>;
  gates: Record<string, boolean>;
  limitation: string;
};
export default function App() {
  const [tasks, setTasks] = useState<Task[]>([]),
    [selected, setSelected] = useState<Task | null>(null),
    [filter, setFilter] = useState("All");
  const [checks, setChecks] = useState<string[]>([]),
    [explanation, setExplanation] = useState(""),
    [maintainability, setMaintainability] = useState(false),
    [documentation, setDocumentation] = useState(false);
  const [result, setResult] = useState<Report | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const data = await request<Task[]>("/api/tasks");
      setTasks(data);
      setSelected(data[0] ?? null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  useEffect(() => {
    setChecks([]);
    setExplanation("");
    setMaintainability(false);
    setDocumentation(false);
    setResult(null);
    setError("");
  }, [selected?.id]);
  function chooseCategory(category: string) {
    setFilter(category);
    const first = tasks.find(
      (t) => category === "All" || t.category === category,
    );
    if (first) setSelected(first);
  }
  async function evaluate() {
    if (!selected) return;
    setBusy(true);
    setError("");
    setResult(null);
    try {
      setResult(
        await request<Report>("/api/evaluate", {
          method: "POST",
          body: JSON.stringify({
            task_id: selected.id,
            satisfied_checks: checks,
            explanation,
            maintainability,
            documentation,
          }),
        }),
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!result) return;
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(result, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `${result.task_id}-review.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <main className="shell">
      <nav>
        <div className="brand">
          <Bot />
          <span>AgentBench SWE</span>
        </div>
        <a
          href="https://github.com/yeabsira-mesfin/agentbench-swe"
          target="_blank"
          rel="noreferrer"
        >
          Source code
        </a>
      </nav>
      <section className="hero">
        <div>
          <span className="eyebrow">CODING AGENT EVALUATION WORKBENCH</span>
          <h1>Evaluate the engineering behind the answer.</h1>
          <p>
            Inspect realistic tasks, record review evidence, and produce a
            weighted assessment of correctness, security, regression safety, and
            engineering quality.
          </p>
          <div className="heroActions">
            <button
              onClick={() =>
                document
                  .getElementById("tasks")
                  ?.scrollIntoView({ behavior: "smooth" })
              }
            >
              Explore tasks
            </button>
            <span>
              <ShieldCheck size={17} /> No submitted code execution
            </span>
          </div>
        </div>
        <div className="scoreCard">
          <span>Evaluation contract</span>
          <strong>5</strong>
          <small>weighted quality dimensions</small>
          <p>
            Correctness 40% · Security 20% · Tests 15% · Maintainability 15% ·
            Documentation 10%
          </p>
          <p className="notice">
            Structured review demo. No model runs or candidate test results are
            claimed.
          </p>
        </div>
      </section>
      <section id="tasks" className="panel">
        <div className="sectionHead">
          <div>
            <span className="eyebrow">CURATED ENGINEERING TASKS</span>
            <h2>Task library</h2>
          </div>
          <div className="filters">
            {["All", ...new Set(tasks.map((t) => t.category))].map((c) => (
              <button
                aria-pressed={filter === c}
                disabled={busy}
                className={filter === c ? "active" : ""}
                key={c}
                onClick={() => chooseCategory(c)}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
        {loading && <p role="status">Loading task registry...</p>}
        {error && (
          <div role="alert" className="error">
            {error}
            {!tasks.length && (
              <button onClick={() => void load()}>Retry</button>
            )}
          </div>
        )}
        {!loading && !error && !tasks.length && <p>No tasks are available.</p>}
        <div className="taskLayout">
          <div className="taskList">
            {tasks
              .filter((t) => filter === "All" || t.category === filter)
              .map((t) => (
                <button
                  disabled={busy}
                  aria-pressed={selected?.id === t.id}
                  key={t.id}
                  onClick={() => setSelected(t)}
                  className={`task ${selected?.id === t.id ? "selected" : ""}`}
                >
                  <span className="taskTop">
                    <b>{t.id}</b>
                    <em>{t.difficulty}</em>
                  </span>
                  <strong>{t.title}</strong>
                  <small>
                    {t.language} · {t.category}
                  </small>
                </button>
              ))}
          </div>
          {selected && (
            <article className="detail">
              <span className="eyebrow">
                {selected.id} / {selected.language}
              </span>
              <h3>{selected.title}</h3>
              <p>{selected.description}</p>
              <div className="rubric">
                <span>Evidence supplied by the scenario</span>
                <p>{selected.context}</p>
              </div>
              <h4>Curated starter code</h4>
              <pre className="starter">{selected.starter_code}</pre>
              <h4>Visible review criteria</h4>
              <p>
                Check only criteria supported by your review. These are
                attestations, not executed tests.
              </p>
              <fieldset disabled={busy}>
                {selected.checks.map((c) => (
                  <label className="check" key={c.id}>
                    <input
                      type="checkbox"
                      checked={checks.includes(c.id)}
                      onChange={() =>
                        setChecks((s) =>
                          s.includes(c.id)
                            ? s.filter((x) => x !== c.id)
                            : [...s, c.id],
                        )
                      }
                    />
                    {c.label}
                  </label>
                ))}
                <label className="check">
                  <input
                    type="checkbox"
                    checked={maintainability}
                    onChange={(e) => setMaintainability(e.target.checked)}
                  />
                  Change is scoped, readable, and maintainable
                </label>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={documentation}
                    onChange={(e) => setDocumentation(e.target.checked)}
                  />
                  Documentation explains behavior and tradeoffs
                </label>
                <label htmlFor="explanation">
                  Review evidence and verification plan
                </label>
                <textarea
                  id="explanation"
                  value={explanation}
                  maxLength={4000}
                  onChange={(e) => setExplanation(e.target.value)}
                  placeholder="Explain what supports your assessment (at least 20 characters)."
                />
              </fieldset>
              <button
                className="primary"
                disabled={busy || explanation.trim().length < 20}
                onClick={() => void evaluate()}
              >
                {busy ? "Evaluating..." : "Generate assessment"}
              </button>
            </article>
          )}
        </div>
      </section>
      <section className="panel" aria-live="polite">
        <span className="eyebrow">ASSESSMENT REPORT</span>
        {result ? (
          <>
            <div className="sectionHead">
              <h2>
                {result.score}/100 · {result.grade.replace(/_/g, " ")}
              </h2>
              <button className="primary" onClick={download}>
                <Download size={16} /> Export JSON
              </button>
            </div>
            <div className="stats">
              {Object.entries(result.dimensions).map(([k, v]) => (
                <div key={k}>
                  <b>{v}/100</b>
                  <span>{k}</span>
                </div>
              ))}
            </div>
            <p>
              <CheckCircle2 size={16} /> Release gates: security{" "}
              {result.gates.security ? "met" : "unmet"}, regression safety{" "}
              {result.gates.regression_safety ? "met" : "unmet"}.
            </p>
            <p>
              {result.release_ready
                ? "Required structural gates satisfied."
                : "Required structural gates remain unmet."}{" "}
              This is not a production approval.
            </p>
            <p className="notice">{result.limitation}</p>
          </>
        ) : (
          <p>
            No evaluation generated yet. Complete a task review to create a
            report.
          </p>
        )}
      </section>
      <footer>
        Yeabsira Mesfin · React / TypeScript · Python / FastAPI · Versioned
        structured evaluation
      </footer>
    </main>
  );
}
