import { Download, ShieldCheck } from "lucide-react";
import { downloadReport, metric, type Run } from "./pro";
export default function RunReport({ run }: { run: Run }) {
  return (
    <article className="panel report" aria-label="Evaluation report">
      <div className="sectionHead">
        <div>
          <span className="eyebrow">EVIDENCE REPORT</span>
          <h2>{run.task_title}</h2>
          <p>
            {run.model_label} · {run.mode.replace(/_/g, " ")}
          </p>
        </div>
        <button className="secondary" onClick={() => downloadReport(run)}>
          <Download size={16} /> Export JSON
        </button>
      </div>
      <div className="gate">
        <ShieldCheck size={22} />
        <strong>{(run.release_gate ?? "blocked").replace(/_/g, " ")}</strong>
        <span>
          Production approval: {run.release_ready ? "approved" : "not granted"}
        </span>
      </div>
      <div className="stats">
        <div>
          <b>{metric(run.score, "/100")}</b>
          <span>Available-dimension score</span>
        </div>
        <div>
          <b>
            {run.passed ?? 0} / {run.executed_tests ?? 0}
          </b>
          <span>Assertions passed</span>
        </div>
        <div>
          <b>{metric(run.duration_ms, " ms")}</b>
          <span>Fixture harness duration</span>
        </div>
        <div>
          <b>
            {run.timed_out == null
              ? "Unavailable"
              : run.timed_out
                ? "Yes"
                : "No"}
          </b>
          <span>Timeout observed</span>
        </div>
      </div>
      {run.explanations?.map((text) => (
        <p key={text}>{text}</p>
      ))}
      {run.execution_errors?.map((text) => (
        <p role="alert" className="error" key={text}>
          {text}
        </p>
      ))}
      <h3>Scoring evidence</h3>
      <div className="dimensionGrid">
        {Object.entries(run.dimensions ?? {}).map(([key, value]) => (
          <div key={key}>
            <span>{key.replace(/_/g, " ")}</span>
            <b>{metric(value.score, "/100")}</b>
            <small>{value.evidence.replace(/_/g, " ")}</small>
          </div>
        ))}
      </div>
      <h3>Test results</h3>
      {!run.tests?.length ? (
        <p>No candidate tests executed.</p>
      ) : (
        <div className="table">
          <table>
            <thead>
              <tr>
                <th>Check</th>
                <th>Visibility</th>
                <th>Dimension</th>
                <th>Result</th>
              </tr>
            </thead>
            <tbody>
              {run.tests.map((t) => (
                <tr key={t.id}>
                  <td>{t.id}</td>
                  <td>{t.visibility.replace(/_/g, " ")}</td>
                  <td>{t.dimension.replace(/_/g, " ")}</td>
                  <td>
                    <span className={`badge ${t.passed ? "good" : "bad"}`}>
                      {t.error ? "Error" : t.passed ? "Passed" : "Failed"}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <h3>Security findings</h3>
      <p>{run.security?.status.replace(/_/g, " ") ?? "Unavailable"}</p>
      <p className="notice">{run.security?.limitation}</p>
      {run.security?.findings.length ? (
        <ul>
          {run.security.findings.map((f, i) => (
            <li key={i}>
              {f.severity} · line {f.line} · {f.message}
            </li>
          ))}
        </ul>
      ) : (
        <p>No findings recorded. This does not establish security clearance.</p>
      )}
      <details>
        <summary>Reproducibility and supplied metadata</summary>
        <dl className="provenance">
          {Object.entries(run.reproducibility ?? {}).map(([k, v]) => (
            <div key={k}>
              <dt>{k.replace(/_/g, " ")}</dt>
              <dd>{v ?? "Unavailable"}</dd>
            </div>
          ))}
          <div>
            <dt>Reported tokens / API cost</dt>
            <dd>
              {metric(run.tokens)} / {metric(run.cost_usd, " USD")} (
              {run.usage_provenance?.replace(/_/g, " ")})
            </dd>
          </div>
          <div>
            <dt>Run ID / recorded at</dt>
            <dd>
              {run.id} / {run.created_at}
            </dd>
          </div>
        </dl>
      </details>
      {run.submission?.source && (
        <details>
          <summary>Imported source (never executed)</summary>
          <pre className="starter">{run.submission.source}</pre>
        </details>
      )}
    </article>
  );
}
