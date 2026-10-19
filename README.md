# AgentBench Pro

An evidence-first coding-agent evaluation workspace built with React, TypeScript,
FastAPI and PostgreSQL. Extends AgentBench SWE in the same repository, preserving
its reviewer-attested APIs and Git history.

[![CI](https://github.com/yeabsira-mesfin/agentbench-swe/actions/workflows/ci.yml/badge.svg)](https://github.com/yeabsira-mesfin/agentbench-swe/actions)

**Execution boundary:** this release executes only bundled, developer-authored
Python fixtures. Imported model solutions are persisted and inspected, **never
executed**. There is no verified untrusted-code sandbox installed. A disabled
sandbox interface is provided for a future isolated worker. Docker application
containers are not an arbitrary-code security boundary.

The existing [hosted demo](https://agentbench-swe.vercel.app/) may still run the
previous reviewer workbench until this branch is deployed. No new production
deployment or model benchmark performance is claimed.

## What works

- Overview with persisted run counts, fixture pass rate, failures and recent runs.
- Eight original versioned benchmarks, searchable by task and language.
- Six executable Python fixture tasks: functions, pure REST handler contracts,
  tenant authorization, SQL parameter handling, validation and pagination regressions.
- JavaScript and TypeScript task specifications with import-only support.
- Reference and intentionally faulty fixtures exercise visible and held-out assertions.
- Imported solutions with model, version and provider labels; optional reported
  token/cost metadata stays explicitly unverified and missing values stay unavailable.
- Separate correctness, regression, security, reliability, code-quality and
  documentation evidence fields. Unmeasured dimensions never receive invented scores.
- Private history, report retrieval, JSON export and grouped comparison tables.
- Limited Python AST/source security inspection with explicit coverage limits.
- SQLite for native development; PostgreSQL via SQLAlchemy and Docker Compose.
- Original human-review workbench and `/evaluate`, `/api/evaluate`, `/api/tasks`
  contracts retained separately.

![Local AgentBench Pro comparison workspace](docs/screenshots/pro-desktop.png)

Screenshot contains local fixture/test submissions, not measured model performance.

## Evidence model

| Evidence | Meaning | What it cannot establish |
| --- | --- | --- |
| `trusted_fixture` | Actual assertions against bundled functions | Performance of an imported model solution |
| `imported` | Stored source, source hash, limited static inspection | Correctness, regression safety or execution time |
| `reviewer_attested` | Human assertions under the original rubric | Independently measured test results |
| `user_supplied_unverified` usage | Optional imported token/cost metadata | Provider-verified billing or telemetry |

Fixture model labels are assigned by the server so a caller cannot label a
bundled baseline as an independently evaluated AI model. Fixture durations measure
local harness execution only, not inference latency or general application speed.

### Scoring and release decisions

The Pro policy weights available measured dimensions: correctness 60%, regression
safety 25%, single-run reliability 15%. Weights renormalize across available
non-null dimensions. Security is a separate veto, not numeric compensation.
Code quality and documentation remain unavailable in executable reports; use the
separate human-review workbench for explicit reviewer attestations.

- Any failed assertion produces `rejected`, even with a score of 100.
- All fixture assertions passing produces `review_required`, not production approval.
- Imported code produces `blocked` with no executed tests, score or duration.
- Infrastructure errors produce `failed` and block approval.
- `release_ready` is always false for Pro runs because independent security and
  engineering reviews are not linked into a verified approval workflow.

Overview pass rate is **completed fixture runs with zero failures / completed
fixture runs**. Imported and infrastructure-failed runs are excluded from that
metric and counted separately. Comparisons never combine different tasks,
datasets, modes, models, providers, policies or engine hashes. These small original
fixtures are demonstration coverage, not a statistically representative leaderboard.

## Architecture

```mermaid
flowchart TD
  UI["React workspace"] --> API["FastAPI validation and token access"]
  API --> Registry["Versioned benchmark registry"]
  API --> DB["PostgreSQL or SQLite evidence store"]
  API --> Mode{"Submission mode"}
  Mode -->|Bundled fixture| Checks["Trusted functions and assertions"]
  Mode -->|Imported source| Scan["Static inspection; execution blocked"]
  Checks --> Report["Evidence and release gates"]
  Scan --> Report
  Report --> DB
```

`backend/app/pro/` contains the registry, trusted fixtures, engine, scanner,
persistence, API, request-size limit and disabled sandbox protocol.
`frontend/src/ReviewWorkbench.tsx` preserves the original human-review UI.
`frontend/src/RunReport.tsx` renders measured evidence and provenance.

## Run locally

Requirements: Python 3.12+, Node.js 22+. No model provider account is needed.

1. Generate a private workspace token and save it locally, never in source control:

   ```bash
   python -c 'import secrets; print(secrets.token_hex(32))'
   ```

2. Start the backend:

   ```bash
   cd backend
   python -m venv .venv
   source .venv/bin/activate
   pip install -r requirements.txt
   export AGENTBENCH_API_TOKEN='paste-your-generated-token-here'
   export DATABASE_URL='sqlite:///./agentbench.db'
   python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
   ```

3. In another terminal:

   ```bash
   cd frontend
   npm ci
   npm run dev
   ```

Open `http://localhost:5173`, expand **Connect private workspace** and enter the
same token. It stays in tab memory, not localStorage. Select **Benchmarks**, inspect
**Tenant access boundary**, and run the faulty fixture to see security failures
veto a high numeric score. Run the reference fixture, import a solution, then
compare and reopen the saved reports.

Without a server token of at least 32 characters, private APIs return 503. The
public catalog and legacy reviewer endpoints remain available. This is a single
trusted workspace, not multi-user authentication or tenant isolation.

### PostgreSQL and Compose

Copy `.env.example` to `.env`. Set independent random hexadecimal values for
`AGENTBENCH_API_TOKEN` and `POSTGRES_PASSWORD` (the password is embedded in a URL).
Then run:

```bash
docker compose up --build
```

Open `http://localhost:5173`. The database has a durable named volume and no
published port; web/API ports bind only to loopback. The API runs non-root with a
read-only filesystem, dropped capabilities and no Docker socket. Those protections
harden the application; they do not enable submitted-code execution.

Native PostgreSQL users can set
`DATABASE_URL=postgresql+psycopg://user:password@host:5432/agentbench`.
The additive `pro_evaluations_v1` table is initialized automatically. Future schema
changes require deliberate migrations; do not change the table contract in place.

## API

Catalog and capabilities are public. All other `/api/pro` routes require
`Authorization: Bearer <workspace-token>` and return `Cache-Control: no-store`.

| Endpoint | Purpose |
| --- | --- |
| `GET /api/pro/capabilities` | Execution boundary and workspace configuration state |
| `GET /api/pro/benchmarks` | Public task specifications and visible assertions only |
| `POST /api/pro/evaluations` | Validate, persist, evaluate or inspect, save report |
| `GET /api/pro/evaluations` | Search/paginate history using q, task_id, language, dataset_version, offset, limit |
| `GET /api/pro/evaluations/{id}` | Private complete report and original submitted source |
| `GET /api/pro/overview` | Totals with explicit fixture-only pass-rate denominator |
| `GET /api/pro/comparisons` | Grouped evidence with task/language/version filters |

Example request body for a trusted fixture:

```json
{"task_id":"AUTH-001","dataset_version":"1.0.0","mode":"trusted_fixture","fixture_id":"broken"}
```

Example imported solution (stored and statically inspected, never run):

```json
{"task_id":"PY-001","dataset_version":"1.0.0","mode":"imported","source":"def solve(values):\n    return list(dict.fromkeys(values))","model_label":"Human baseline","model_version":"v1"}
```

Submissions are bounded to 20,000 source characters and 100 KB streamed request
bodies. A mismatched dataset version returns 409. Tokens/costs are optional and
are rejected for bundled fixtures. Database failures return sanitized 503 errors.
No model-provider API keys are accepted or bundled into the browser.

## Security and limitations

- Imported code is never passed to `eval`, `exec`, subprocesses or SQL execution.
  SQL behavior tests use fixed developer-authored fixture queries against in-memory
  synthetic data only. Faulty fixtures are deliberate regression examples.
- Held-out inputs and expected outputs are omitted from catalog/report endpoints
  and frontend assets. Reports expose only opaque held-out IDs and outcomes.
  **The public Git repository contains these fixtures**, so they are not secret
  and cannot support contamination-resistant benchmark claims. A real private
  dataset must be provisioned outside the public repository.
- Python inspection detects a small set of direct dangerous calls and SQL
  interpolation patterns. It does not follow aliases/data flow; JavaScript and
  TypeScript scanning is explicitly unsupported. No findings is not a safety pass.
- No arbitrary runner ships. `sandbox.py` defines a fail-closed integration
  interface. Before enabling one, independently verify disposable non-root
  execution, no network/credentials/host mounts, read-only root, bounded writable
  space, CPU/memory/PID/output caps, external deadlines and cleanup. Prefer a
  microVM or hardened sandbox over bare Docker. Assertions must be controlled by
  the evaluator; never trust candidate-reported pass counts.
- Executions are short synchronous trusted checks. A server interruption can
  leave a persisted `running` record; there is no durable background queue or
  automatic retry. Such records never count as measured or approved.
- History uses application-side filtering over stored JSON and is suitable for a
  small private workspace. Large installations need indexed fields, database-side
  pagination/aggregation, retention, backups and migrations.
- Shared-token authorization is not a multi-user system. All token holders can
  read all stored submissions. Use a private network; add proper identity/RBAC,
  quotas, rate limiting and retention before shared public workspace exposure.
- Do not import secrets. Source is retained in the configured database until an
  operator removes it. Restrict database access and backups accordingly.

## Verification

```bash
PYTHONPATH=backend python -m pytest backend/tests -q
npm ci --prefix frontend
npm run build --prefix frontend
cd frontend
npx playwright install chromium
npm run test:e2e
```

The browser test starts its own local API/UI, uses an explicitly test-only token
and `backend/browser-test.db`, and checks fixture gates, blocked imports, history,
comparisons, mobile layout and the original reviewer workflow. Test data is not
production evidence. CI runs Python tests against SQLite and PostgreSQL, checks
the frontend build, and exercises browser flows.

See [QA evidence](docs/QA-PRO.md) for actual executed checks and unverified items.

## Deployment

Existing Vercel service routing and GitHub Pages publishing remain intact. Deploy
this branch only after provisioning backend `AGENTBENCH_API_TOKEN` and a persistent
PostgreSQL `DATABASE_URL` for private features. On Vercel, private APIs explicitly
reject SQLite or a missing PostgreSQL URL to prevent ephemeral-history claims.
Frontend-only hosting needs `VITE_API_BASE_URL` pointing to the backend. Never put
the workspace token or database credentials in a `VITE_` variable.

Public visitors can browse the catalog and use the legacy attestation workflow;
private reports require the workspace token. Arbitrary-code execution remains
disabled in every deployment, regardless of environment variables.

## Author

**Yeabsira Mesfin** · Full Stack Software Engineer · M.S. Cybersecurity in Computer
Science student. Demonstrates evaluation design, explicit provenance, secure API
boundaries, persistence, reproducible tests and a React evaluation workspace.
