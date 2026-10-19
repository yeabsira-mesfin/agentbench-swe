"""Private single-workspace evaluation APIs, plus a public benchmark catalog."""
from datetime import datetime, timezone
import hmac
import os
from typing import Literal
from uuid import uuid4
from fastapi import APIRouter, Depends, Header, HTTPException, Query
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from sqlalchemy.exc import SQLAlchemyError
from .benchmarks import BENCHMARKS, REGISTRY, DATASET_VERSION, public_task
from .engine import evaluate_submission
from . import storage

router = APIRouter(prefix="/api/pro", tags=["AgentBench Pro"])


def authorize(authorization: str | None = Header(default=None)):
    token = os.getenv("AGENTBENCH_API_TOKEN", "")
    if len(token) < 32:
        raise HTTPException(503, "Private workspace disabled. Configure an API token of at least 32 characters.")
    if not hmac.compare_digest((authorization or "").encode(), f"Bearer {token}".encode()):
        raise HTTPException(401, "A valid workspace token is required.", headers={"WWW-Authenticate": "Bearer"})
    if os.getenv("VERCEL") and not os.getenv("DATABASE_URL", "").startswith(("postgres://", "postgresql://", "postgresql+psycopg://")):
        raise HTTPException(503, "A persistent PostgreSQL database is required on Vercel.")


@router.get("/capabilities")
def capabilities():
    return {"arbitrary_execution": False, "trusted_fixtures": True,
            "workspace_configured": len(os.getenv("AGENTBENCH_API_TOKEN", "")) >= 32,
            "dataset_version": DATASET_VERSION,
            "limitation": "Only bundled Python fixtures execute. Imported code is stored and inspected, never executed."}


@router.get("/benchmarks")
def benchmarks():
    return [public_task(t) for t in BENCHMARKS]


class Candidate(BaseModel):
    model_config = ConfigDict(extra="forbid")
    task_id: str = Field(min_length=1, max_length=30)
    dataset_version: str = Field(max_length=30)
    mode: Literal["trusted_fixture", "imported"]
    fixture_id: Literal["reference", "broken"] | None = None
    source: str | None = Field(default=None, min_length=1, max_length=20000)
    model_label: str = Field(default="Human baseline", min_length=1, max_length=100)
    model_version: str = Field(default="unspecified", min_length=1, max_length=100)
    provider: str | None = Field(default=None, max_length=100)
    tokens: int | None = Field(default=None, ge=0, le=100000000, strict=True)
    cost_usd: float | None = Field(default=None, ge=0, le=100000, allow_inf_nan=False)

    @field_validator("task_id", "dataset_version", "model_label", "model_version", "provider")
    @classmethod
    def trim_metadata(cls, value):
        if value is None:
            return None
        if not value.strip():
            raise ValueError("Metadata cannot be whitespace only")
        return value.strip()

    @model_validator(mode="after")
    def consistent_mode(self):
        if self.mode == "trusted_fixture":
            if self.fixture_id is None or self.source is not None:
                raise ValueError("Fixture mode requires fixture_id and disallows submitted source")
            if self.tokens is not None or self.cost_usd is not None or self.provider is not None:
                raise ValueError("Bundled fixtures have no provider, token usage or API cost")
            self.model_label = f"Bundled {self.fixture_id} fixture"
            self.model_version = DATASET_VERSION
        elif self.fixture_id is not None or not self.source or not self.source.strip():
            raise ValueError("Imported mode requires source and disallows fixture_id")
        return self


def summary(r):
    return {k: v for k, v in r.items() if k != "submission"}


@router.post("/evaluations", dependencies=[Depends(authorize)], status_code=201)
def create(candidate: Candidate):
    task = REGISTRY.get(candidate.task_id)
    if task is None:
        raise HTTPException(404, "Unknown benchmark")
    if task["dataset_version"] != candidate.dataset_version:
        raise HTTPException(409, "Dataset version mismatch; reload the benchmark catalog")
    if candidate.mode == "trusted_fixture" and task["execution_support"] != "trusted_fixture":
        raise HTTPException(422, "This language supports import and inspection only")
    payload = candidate.model_dump()
    record = {"id": str(uuid4()), "created_at": datetime.now(timezone.utc).isoformat(),
              "task_id": task["id"], "task_title": task["title"], "language": task["language"],
              "dataset_version": task["dataset_version"], "model_label": candidate.model_label,
              "model_version": candidate.model_version, "provider": candidate.provider,
              "tokens": candidate.tokens, "cost_usd": candidate.cost_usd,
              "usage_provenance": "user_supplied_unverified" if candidate.mode == "imported" else "unavailable",
              "submission": payload, "status": "running", "mode": candidate.mode}
    try:
        storage.save(record, new=True)
        try:
            record.update(evaluate_submission(payload, task))
        except Exception:
            record.update(status="failed", release_gate="blocked", release_ready=False,
                          execution_errors=["Evaluation infrastructure failed; no approval is possible."])
        storage.save(record)
    except SQLAlchemyError:
        raise HTTPException(503, "Evaluation storage unavailable. Check server configuration.") from None
    return summary(record)


def filtered(q="", task_id="", language="", dataset_version=""):
    try:
        records = storage.list_records()
    except SQLAlchemyError:
        raise HTTPException(503, "Evaluation storage unavailable.") from None
    return [r for r in records if
            (not task_id or r["task_id"] == task_id) and
            (not language or r["language"] == language) and
            (not dataset_version or r["dataset_version"] == dataset_version) and
            (not q or q.lower() in f"{r['id']} {r['task_title']} {r['model_label']}".lower())]


@router.get("/evaluations", dependencies=[Depends(authorize)])
def history(q: str = Query(default="", max_length=100), task_id: str = "", language: str = "", dataset_version: str = "", offset: int = Query(default=0, ge=0), limit: int = Query(default=25, ge=1, le=100)):
    records = filtered(q, task_id, language, dataset_version)
    return {"total": len(records), "items": [summary(r) for r in records[offset:offset + limit]]}


@router.get("/evaluations/{id}", dependencies=[Depends(authorize)])
def detail(id: str):
    try:
        record = storage.get(id)
    except SQLAlchemyError:
        raise HTTPException(503, "Evaluation storage unavailable.") from None
    if record is None:
        raise HTTPException(404, "Evaluation not found")
    return record


@router.get("/overview", dependencies=[Depends(authorize)])
def overview():
    records = filtered()
    measured = [r for r in records if r["status"] == "completed" and r.get("executed_tests", 0)]
    return {"total": len(records), "completed": sum(r["status"] == "completed" for r in records),
            "failed": sum(r["status"] == "failed" for r in records),
            "blocked": sum(r["status"] == "blocked" for r in records),
            "security_gate_failures": sum(bool(r.get("security_gate_failure")) for r in records),
            "pass_rate": round(100 * sum(r["failed"] == 0 for r in measured) / len(measured), 2) if measured else None,
            "pass_rate_denominator": len(measured), "pass_rate_scope": "completed_trusted_fixture_runs",
            "recent": [summary(r) for r in records[:5]]}


@router.get("/comparisons", dependencies=[Depends(authorize)])
def comparisons(task_id: str = "", language: str = "", dataset_version: str = ""):
    groups = {}
    for record in filtered(task_id=task_id, language=language, dataset_version=dataset_version):
        # Never combine different tasks, datasets, modes, policies or engine revisions.
        repro = record.get("reproducibility", {})
        key = (record["model_label"], record["model_version"], record.get("provider"), record["task_id"], record["dataset_version"], record["mode"], repro.get("engine_sha256"), repro.get("policy_version"))
        groups.setdefault(key, []).append(record)
    result = []
    for key, records in groups.items():
        measured = [r for r in records if r["status"] == "completed" and r.get("executed_tests", 0)]
        def average(field):
            values = [r[field] for r in measured if r.get(field) is not None]
            return round(sum(values) / len(values), 3) if values else None
        correctness = [r["dimensions"]["functional_correctness"]["score"] for r in measured if r["dimensions"]["functional_correctness"]["score"] is not None]
        result.append({"model_label": key[0], "model_version": key[1], "provider": key[2], "task_id": key[3], "dataset_version": key[4], "mode": key[5], "engine_sha256": key[6], "policy_version": key[7], "runs": len(records), "measured_runs": len(measured),
                       "pass_rate": round(100 * sum(r["failed"] == 0 for r in measured) / len(measured), 2) if measured else None,
                       "correctness_score": round(sum(correctness) / len(correctness), 2) if correctness else None,
                       "security_gate_failures": sum(bool(r.get("security_gate_failure")) for r in records),
                       "regression_failures": sum(bool(r.get("regression_failure")) for r in records),
                       "duration_ms": average("duration_ms"),
                       "reported_tokens": sum(r["tokens"] for r in records) if all(r.get("tokens") is not None for r in records) else None,
                       "reported_cost_usd": round(sum(r["cost_usd"] for r in records), 6) if all(r.get("cost_usd") is not None for r in records) else None,
                       "usage_provenance": "user_supplied_unverified" if key[5] == "imported" else "unavailable"})
    return result
