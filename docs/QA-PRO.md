# AgentBench Pro verification

Verified locally on 2026-10-19. These are software checks, not model benchmark
performance claims. The earlier QA/deployment files describe the previous release.

| Check | Observed result |
| --- | --- |
| Backend regression and Pro suite | 42 passed; 1 upstream Starlette/httpx deprecation warning |
| TypeScript and Vite production build | Passed |
| Browser end-to-end suite | 2 passed in local Chromium 138 using Playwright 1.56.1 |
| Existing hosted `/health` | Returned `{"status":"ok","service":"agentbench-swe"}`; does not prove this branch is deployed |
| Whitespace/diff validation | Passed |
| Docker/Compose build | Not run: Docker unavailable in this environment |
| PostgreSQL integration | CI job provided; not verified locally because no PostgreSQL server is installed |
| Arbitrary submitted-code isolation | Not available; execution remains disabled with no enabling environment toggle |
| Production deployment of this branch | Not performed |

## Browser to API to database evidence

The automated browser test starts a real Vite server and FastAPI server against
SQLite. It connects with an isolated test token, creates a faulty authorization
fixture and verifies rejection despite a high score, creates a reference run,
imports model-labeled source and verifies that it is blocked with no test results,
opens comparisons and reopens its persisted report from history. It checks that
reloading clears the in-memory workspace token, then exercises the original
reviewer-attestation API through its UI. No uncaught browser errors were observed.

A separate 390 x 844 viewport test filters to TypeScript, opens the import-only
workspace and verifies that the document does not overflow the viewport.

The default Playwright browser download returned invalid archives in this
execution environment. Local verification used Chromium 138 packaged in
`@sparticuz/chromium` through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`. This temporary
browser dependency is not part of the app. CI installs Playwright's normal browser.

## Backend evidence

Coverage includes:

- All original scoring and review API contracts.
- Six reference fixtures passing actual assertions and six faulty fixtures failing.
- Security failure vetoing a score of 100; no Pro fixture granting release approval.
- Imported code containing a file write and an infinite loop never being executed.
- Exact source hashes, persisted source retrieval and reopening the database engine.
- Public catalog and report redaction of held-out inputs and expected outputs.
- Authorization, disabled-by-default private workspace and no-store responses.
- Dataset mismatch, unknown tasks, inconsistent modes, source and streamed-body limits.
- Preventing fixture labels from impersonating model runs or claiming provider usage.
- Correct comparison and overview denominators, filters and history pagination.
- Sanitized fixture/infrastructure errors and failed-run exclusion from measured metrics.
- Vercel rejecting SQLite for persisted workspace features.

## Material limits

This is a verified trusted-fixture vertical slice with an import/inspection
workflow, not a production untrusted-agent runner. Python static inspection is
heuristic; JavaScript/TypeScript execution and comprehensive scanning are absent.
Code quality/documentation remain unmeasured. API-private held-out fixtures are
visible in this public repository and cannot establish uncontaminated benchmarking.
The shared-token workspace requires identity, quotas, retention and database-side
query optimization before a large public multi-user deployment.
