export type Benchmark = {
  id: string;
  title: string;
  category: string;
  language: string;
  difficulty: string;
  description: string;
  dataset_version: string;
  input_specification: string;
  expected_behavior: string;
  timeout_seconds: number;
  resource_limits: Record<string, number>;
  scoring_criteria: Record<string, number>;
  execution_support: string;
  visible_tests: {
    id: string;
    input: unknown;
    expected: unknown;
    dimension: string;
  }[];
  held_out_test_count: number;
};
export type Run = {
  id: string;
  task_id: string;
  task_title: string;
  language: string;
  created_at: string;
  dataset_version: string;
  model_label: string;
  model_version: string;
  mode: string;
  status: string;
  passed?: number;
  failed?: number;
  executed_tests?: number;
  score?: number | null;
  duration_ms?: number | null;
  timed_out?: boolean | null;
  release_gate?: string;
  release_ready?: boolean;
  execution_errors?: string[];
  explanations?: string[];
  dimensions?: Record<string, { score: number | null; evidence: string }>;
  tests?: {
    id: string;
    visibility: string;
    dimension: string;
    passed: boolean;
    error: boolean;
  }[];
  security?: {
    status: string;
    findings: {
      rule: string;
      severity: string;
      line: number;
      message: string;
    }[];
    limitation: string;
  };
  reproducibility?: Record<string, string | null>;
  tokens?: number | null;
  cost_usd?: number | null;
  usage_provenance?: string;
  submission?: { source: string | null };
};
export type Overview = {
  total: number;
  completed: number;
  failed: number;
  blocked: number;
  security_gate_failures: number;
  pass_rate: number | null;
  pass_rate_denominator: number;
  recent: Run[];
};
export type Comparison = {
  model_label: string;
  model_version: string;
  provider: string | null;
  task_id: string;
  dataset_version: string;
  mode: string;
  engine_sha256: string;
  policy_version: string;
  runs: number;
  measured_runs: number;
  pass_rate: number | null;
  correctness_score: number | null;
  security_gate_failures: number;
  regression_failures: number;
  duration_ms: number | null;
  reported_tokens: number | null;
  reported_cost_usd: number | null;
};
export const metric = (value: number | null | undefined, suffix = "") =>
  value == null ? "Unavailable" : `${value}${suffix}`;
export function downloadReport(run: Run) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(run, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `agentbench-${run.id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
