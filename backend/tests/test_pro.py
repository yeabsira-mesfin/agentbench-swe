import json
import os
import pytest
from fastapi.testclient import TestClient
from app.main import app
from app.pro import storage
from app.pro.benchmarks import BENCHMARKS
from app.pro.engine import evaluate_submission
from app.pro.sandbox import DisabledSandbox
from app.pro.security import scan

TOKEN = "test-workspace-token-for-isolated-tests-only"


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("AGENTBENCH_API_TOKEN", TOKEN)
    monkeypatch.setenv("DATABASE_URL", os.getenv("TEST_DATABASE_URL", f"sqlite:///{tmp_path / 'test.db'}"))
    monkeypatch.delenv("VERCEL", raising=False)
    with storage.database().begin() as db:
        db.execute(storage.runs.delete())
    return TestClient(app, headers={"Authorization": f"Bearer {TOKEN}"})


def payload(**changes):
    return {"task_id": "PY-001", "dataset_version": "1.0.0", "mode": "trusted_fixture", "fixture_id": "reference", **changes}


def post(client, **changes):
    response = client.post("/api/pro/evaluations", json=payload(**changes))
    assert response.status_code == 201, response.text
    return response.json()


def test_disabled_and_unauthorized(monkeypatch, client):
    anonymous = TestClient(app)
    for endpoint in ("evaluations", "overview", "comparisons", "evaluations/missing"):
        assert anonymous.get(f"/api/pro/{endpoint}").status_code == 401
    assert anonymous.post("/api/pro/evaluations", json=payload()).status_code == 401
    monkeypatch.delenv("AGENTBENCH_API_TOKEN")
    assert client.post("/api/pro/evaluations", json=payload()).status_code == 503
    assert anonymous.get("/api/pro/benchmarks").status_code == 200


def test_public_catalog_redacts_hidden_cases(client):
    catalog = client.get("/api/pro/benchmarks").json()
    assert len(catalog) == 8
    assert all("cases" not in t for t in catalog)
    for public, private in zip(catalog, BENCHMARKS):
        assert public["held_out_test_count"] == sum(not c["visible"] for c in private["cases"])
        assert all(c["visible"] for c in public["visible_tests"])
    assert "alpha' OR" not in json.dumps(catalog)


@pytest.mark.parametrize("task_id", [t["id"] for t in BENCHMARKS if t["language"] == "Python"])
def test_reference_fixtures_pass_but_do_not_approve_release(client, task_id):
    run = post(client, task_id=task_id)
    assert run["status"] == "completed" and run["failed"] == 0
    assert run["passed"] == run["executed_tests"] > 0
    assert run["score"] == 100 and run["release_gate"] == "review_required"
    assert not run["release_ready"]
    assert run["dimensions"]["code_quality"]["score"] is None
    assert run["dimensions"]["documentation"]["score"] is None
    assert run["duration_ms"] >= 0 and run["tokens"] is None
    assert len(run["reproducibility"]["benchmark_sha256"]) == 64


@pytest.mark.parametrize("task_id", [t["id"] for t in BENCHMARKS if t["language"] == "Python"])
def test_faulty_fixtures_are_detected(client, task_id):
    run = post(client, task_id=task_id, fixture_id="broken")
    assert run["failed"] > 0 and run["release_gate"] == "rejected"


def test_security_veto_at_high_numeric_score(client):
    run = post(client, task_id="AUTH-001", fixture_id="broken")
    assert run["score"] == 100 and run["security_gate_failure"]
    assert run["release_gate"] == "rejected" and not run["release_ready"]


def test_imported_source_is_never_executed(client, tmp_path):
    marker = tmp_path / "MUST_NOT_EXIST"
    source = f"open({str(marker)!r}, 'w').write('unsafe')\nwhile True: pass\neval('1')"
    run = post(client, mode="imported", fixture_id=None, source=source, model_label="Model A", model_version="x", tokens=100, cost_usd=0.02)
    assert not marker.exists()
    assert run["status"] == "blocked" and run["score"] is None
    assert run["executed_tests"] == 0 and run["duration_ms"] is None
    assert run["security"]["findings"][0]["severity"] == "critical"
    assert run["security_gate_failure"]
    assert run["usage_provenance"] == "user_supplied_unverified"
    assert "submission" not in run
    assert client.get(f"/api/pro/evaluations/{run['id']}").json()["submission"]["source"] == source


def test_fixture_labels_cannot_impersonate_models(client):
    run = post(client, model_label="GPT invented benchmark", model_version="fake")
    assert run["model_label"] == "Bundled reference fixture"
    assert run["model_version"] == "1.0.0"


@pytest.mark.parametrize("changes", [
    {"source": "print(1)"}, {"fixture_id": None}, {"tokens": 10},
    {"mode": "imported", "fixture_id": None, "source": " "},
    {"task_id": "JS-001"}, {"fixture_id": "../../danger"},
    {"mode": "imported", "fixture_id": None, "source": "x" * 20001},
])
def test_validation(client, changes):
    assert client.post("/api/pro/evaluations", json=payload(**changes)).status_code == 422


def test_unknown_and_stale_dataset(client):
    assert client.post("/api/pro/evaluations", json=payload(task_id="missing")).status_code == 404
    assert client.post("/api/pro/evaluations", json=payload(dataset_version="old")).status_code == 409
    assert client.get("/api/pro/evaluations/missing").status_code == 404


def test_body_limit_before_parse(client):
    assert client.post("/api/pro/evaluations", content=b"x" * 100001, headers={"Content-Type": "application/json"}).status_code == 413


def test_persistence_filters_and_comparison_denominators(client):
    good = post(client)
    post(client, fixture_id="broken")
    post(client, mode="imported", fixture_id=None, source="def solve(x): return x", model_label="Model A")
    assert client.get("/api/pro/evaluations?limit=1").json()["total"] == 3
    assert len(client.get("/api/pro/evaluations?limit=1").json()["items"]) == 1
    assert client.get("/api/pro/evaluations?q=Model%20A").json()["total"] == 1
    assert client.get("/api/pro/evaluations?language=TypeScript").json()["total"] == 0
    stats = client.get("/api/pro/overview").json()
    assert stats["completed"] == 2 and stats["blocked"] == 1
    assert stats["pass_rate_denominator"] == 2 and stats["pass_rate"] == 50
    comparison = client.get("/api/pro/comparisons").json()
    imported = next(c for c in comparison if c["mode"] == "imported")
    assert imported["pass_rate"] is None and imported["duration_ms"] is None
    assert imported["reported_tokens"] is None
    assert client.get("/api/pro/comparisons?dataset_version=missing").json() == []
    # Reopen engine to verify a durable record, not process-local history.
    storage.connect.cache_clear()
    assert client.get(f"/api/pro/evaluations/{good['id']}").status_code == 200


def test_hidden_results_never_return_inputs_or_assertion_output(client):
    run = post(client, task_id="SQL-001", fixture_id="broken")
    for test in run["tests"]:
        assert "input" not in test and "expected" not in test and "actual" not in test
    assert "alpha' OR" not in json.dumps(run)


def test_exception_path_is_a_failed_check(monkeypatch):
    def broken(*args):
        raise RuntimeError("secret held-out input")
    monkeypatch.setattr("app.pro.engine.execute_fixture", broken)
    result = evaluate_submission({**payload(), "source": None}, BENCHMARKS[0])
    assert result["failed"] == result["executed_tests"]
    assert result["dimensions"]["reliability"]["score"] == 0
    assert "secret held-out input" not in json.dumps(result)


def test_scanner_limitations_and_disabled_adapter():
    assert scan("def broken(", "Python")["status"] == "parse_error"
    assert scan("function solve() {}", "JavaScript")["status"] == "unsupported"
    with pytest.raises(RuntimeError, match="disabled"):
        DisabledSandbox().execute("print(1)", "PY-001", "1.0.0")


def test_vercel_requires_postgres(client, monkeypatch):
    monkeypatch.setenv("VERCEL", "1")
    monkeypatch.setenv("DATABASE_URL", "sqlite:///unused.db")
    assert client.get("/api/pro/evaluations").status_code == 503


def test_infrastructure_failure_never_counts_as_measured(client, monkeypatch):
    def fail(*args):
        raise RuntimeError("sensitive diagnostic")
    monkeypatch.setattr("app.pro.api.evaluate_submission", fail)
    run = post(client)
    assert run["status"] == "failed" and run["release_gate"] == "blocked"
    assert "sensitive diagnostic" not in json.dumps(run)
    stats = client.get("/api/pro/overview").json()
    assert stats["failed"] == 1 and stats["pass_rate"] is None


def test_private_responses_not_cacheable(client):
    assert client.get("/api/pro/evaluations").headers["Cache-Control"] == "no-store"


def test_source_hash_preserves_exact_import(client):
    import hashlib
    source = "\n# original whitespace\ndef solve(x):\n    return x\n"
    run = post(client, mode="imported", fixture_id=None, source=source)
    assert run["reproducibility"]["source_sha256"] == hashlib.sha256(source.encode()).hexdigest()
    assert client.get(f"/api/pro/evaluations/{run['id']}").json()["submission"]["source"] == source
