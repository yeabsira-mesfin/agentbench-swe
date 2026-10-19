"""Original fixture registry. Public serialization is an explicit allowlist.

Held-out cases stay out of HTTP responses and frontend bundles. As this repository
is public, these fixtures are NOT a secret or a contamination-resistant dataset.
"""
from copy import deepcopy
import hashlib
import json

DATASET_VERSION = "1.0.0"
POLICY_VERSION = "pro-1.0.0"


def task(id, title, category, description, specification, cases, language="Python"):
    return {"id": id, "title": title, "category": category, "language": language,
            "difficulty": "Medium", "description": description,
            "dataset_version": DATASET_VERSION, "input_specification": specification,
            "expected_behavior": description, "cases": cases,
            "timeout_seconds": 2, "resource_limits": {"memory_mb": 128, "cpu": 1, "pids": 32, "output_bytes": 16384},
            "scoring_criteria": {"functional_correctness": 0.6, "regression_safety": 0.25, "reliability": 0.15},
            "execution_support": "trusted_fixture" if language == "Python" else "import_only"}


def case(id, value, expected, dimension="functional_correctness", visible=True):
    return {"id": id, "input": value, "expected": expected, "dimension": dimension, "visible": visible}

BENCHMARKS = [
    task("PY-001", "Stable deduplication", "Python functions", "Remove duplicates while preserving first occurrence order.", "JSON array of integers -> array of integers", [
        case("ordered", [3, 1, 3, 2], [3, 1, 2]),
        case("empty", [], [], "regression_safety"),
        case("negative", [-2, 0, -2, 4], [-2, 0, 4], visible=False)]),
    task("API-001", "Order request contract", "REST API correctness", "Return 201 for a positive integer quantity, 422 for invalid input. Only POST is accepted (405 otherwise). This tests a pure request handler, not a deployed HTTP server.", "{method: string, body: {quantity: unknown}} -> {status: integer}", [
        case("create", {"method": "POST", "body": {"quantity": 2}}, {"status": 201}),
        case("method", {"method": "GET", "body": {}}, {"status": 405}, "regression_safety"),
        case("bool", {"method": "POST", "body": {"quantity": True}}, {"status": 422}, visible=False),
        case("zero", {"method": "POST", "body": {"quantity": 0}}, {"status": 422}, visible=False)]),
    task("AUTH-001", "Tenant access boundary", "Authentication and authorization", "Allow only authenticated users with matching nonempty tenant IDs. Missing identities and cross-tenant requests must be denied.", "{user: null | {tenant: string}, record: {tenant: string}} -> boolean", [
        case("owner", {"user": {"tenant": "a"}, "record": {"tenant": "a"}}, True, "regression_safety"),
        case("anonymous", {"user": None, "record": {"tenant": "a"}}, False, "security"),
        case("cross-tenant", {"user": {"tenant": "b"}, "record": {"tenant": "a"}}, False, "security", False),
        case("missing", {"user": {}, "record": {}}, False, "security", False)]),
    task("SQL-001", "Parameterized tenant lookup", "SQL query handling", "Return a SQLite query and separate parameters that fetch only matching tenant rows. User values must never become SQL syntax.", "{tenant: string} -> {query: string, params: array}", [
        case("lookup", {"tenant": "alpha"}, [[1]], "regression_safety"),
        case("injection", {"tenant": "alpha' OR 1=1 --"}, [], "security", False)]),
    task("VAL-001", "Bounded quantity validation", "Data validation", "Accept integer quantities from 1 through 100. Reject booleans, strings and out-of-range values.", "JSON value -> boolean", [
        case("valid", 20, True), case("upper", 100, True, "regression_safety"),
        case("bool", True, False, visible=False), case("string", "20", False, visible=False),
        case("overflow", 101, False, visible=False)]),
    task("REG-001", "Pagination boundaries", "Regression prevention", "Return a page slice, using zero-based page and positive size. Invalid page/size returns an empty list.", "{items: array, page: integer, size: integer} -> array", [
        case("first", {"items": [1, 2, 3], "page": 0, "size": 2}, [1, 2]),
        case("last", {"items": [1, 2, 3], "page": 1, "size": 2}, [3], "regression_safety", False),
        case("negative", {"items": [1, 2], "page": -1, "size": 2}, [], "regression_safety", False)]),
    task("JS-001", "Stable unique values", "JavaScript logic", "Implement solve(values) returning unique numbers in first occurrence order.", "number[] -> number[]", [case("ordered", [2, 1, 2], [2, 1])], "JavaScript"),
    task("TS-001", "Typed quantity guard", "TypeScript logic", "Implement solve(value: unknown): boolean accepting only integer quantities from 1 through 100.", "unknown -> boolean", [case("valid", 5, True), case("bool", True, False, visible=False)], "TypeScript"),
]
REGISTRY = {t["id"]: t for t in BENCHMARKS}


def public_task(t):
    fields = ("id", "title", "category", "language", "difficulty", "description", "dataset_version", "input_specification", "expected_behavior", "timeout_seconds", "resource_limits", "scoring_criteria", "execution_support")
    result = {k: deepcopy(t[k]) for k in fields}
    result["visible_tests"] = [deepcopy(c) for c in t["cases"] if c["visible"]]
    result["held_out_test_count"] = sum(not c["visible"] for c in t["cases"])
    return result


def benchmark_digest(t):
    return hashlib.sha256(json.dumps(t, sort_keys=True, separators=(",", ":")).encode()).hexdigest()
