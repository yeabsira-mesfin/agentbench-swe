from copy import deepcopy
import hashlib
from pathlib import Path
import platform
import time
from .benchmarks import POLICY_VERSION, benchmark_digest
from .fixtures import execute_fixture
from .security import scan

ENGINE_DIGEST = hashlib.sha256(b"".join(Path(__file__).with_name(f).read_bytes() for f in ["engine.py", "fixtures.py", "security.py", "benchmarks.py"])).hexdigest()


def evaluate_submission(submission, task):
    source = submission["source"] or ""
    imported = submission["mode"] == "imported"
    base = {
        "mode": submission["mode"], "status": "blocked" if imported else "completed",
        "passed": 0, "failed": 0, "executed_tests": 0, "timed_out": None,
        "execution_errors": [], "tests": [], "duration_ms": None, "score": None,
        "dimensions": {key: {"score": None, "evidence": "unavailable"} for key in ["functional_correctness", "regression_safety", "security", "reliability", "code_quality", "documentation"]},
        "release_gate": "blocked", "release_ready": False,
        "security": scan(source, task["language"]) if imported else {"status": "behavior_tests_only", "findings": [], "limitation": "Only curated security behavior checks run. No comprehensive vulnerability scan."},
        "reproducibility": {"dataset_version": task["dataset_version"], "benchmark_sha256": benchmark_digest(task), "policy_version": POLICY_VERSION, "engine_sha256": ENGINE_DIGEST, "python_version": platform.python_version(), "source_sha256": hashlib.sha256(source.encode()).hexdigest() if imported else None, "fixture_id": submission["fixture_id"] if not imported else None},
        "explanations": [], "security_gate_failure": False, "regression_failure": False,
    }
    if imported:
        base["security_gate_failure"] = bool(base["security"]["findings"])
        base["explanations"] = ["Imported source was stored and statically inspected, never executed. A verified sandbox is unavailable. Release approval is blocked."]
        return base
    start = time.perf_counter()
    for i, test in enumerate(task["cases"]):
        error = False
        try:
            actual = execute_fixture(task["id"], submission["fixture_id"], deepcopy(test["input"]))
            passed = type(actual) is type(test["expected"]) and actual == test["expected"]
        except Exception:
            passed, error = False, True
        # No candidate output, hidden inputs, assertion text or stack traces leave the engine.
        base["tests"].append({"id": test["id"] if test["visible"] else f"held-out-{i + 1}", "visibility": "visible" if test["visible"] else "held_out", "dimension": test["dimension"], "passed": passed, "error": error})
    base["duration_ms"] = round((time.perf_counter() - start) * 1000, 3)
    base["timed_out"] = False  # trusted bounded functions only, not a sandbox deadline claim
    base["executed_tests"] = len(base["tests"])
    base["passed"] = sum(t["passed"] for t in base["tests"])
    base["failed"] = base["executed_tests"] - base["passed"]
    base["execution_errors"] = ["Trusted fixture raised an exception"] if any(t["error"] for t in base["tests"]) else []
    for dimension in ["functional_correctness", "regression_safety", "security"]:
        checks = [t for t in base["tests"] if t["dimension"] == dimension]
        if checks:
            base["dimensions"][dimension] = {"score": round(100 * sum(t["passed"] for t in checks) / len(checks), 2), "evidence": "measured_trusted_fixture"}
    base["dimensions"]["reliability"] = {"score": 0 if base["execution_errors"] else 100, "evidence": "single_run_completion_only"}
    weights = task["scoring_criteria"]
    available = {k: w for k, w in weights.items() if base["dimensions"][k]["score"] is not None}
    base["score"] = round(sum(base["dimensions"][k]["score"] * w for k, w in available.items()) / sum(available.values()), 2)
    base["security_gate_failure"] = any(not t["passed"] and t["dimension"] == "security" for t in base["tests"])
    for test in base["tests"]:
        if test["dimension"] == "security" and not test["passed"]:
            base["security"]["findings"].append({"rule": "security-behavior", "severity": "critical", "line": 0, "message": "A curated security boundary assertion failed."})
    base["regression_failure"] = any(not t["passed"] and t["dimension"] == "regression_safety" for t in base["tests"])
    base["release_gate"] = "rejected" if base["failed"] else "review_required"
    base["explanations"] = ["Any failed test overrides the weighted score." if base["failed"] else "All fixture assertions passed. Independent code quality, documentation and comprehensive security review remain unavailable.", "Trusted fixture results measure the bundled implementation only, never an imported model solution. Duration is local harness time, not model inference latency.", "Score renormalizes available weighted dimensions; security is a separate veto. Fixture evidence alone never grants production approval."]
    return base
