from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field, field_validator
from .evaluator import evaluate
from .tasks import TASKS, public_tasks
import os

app = FastAPI(title="AgentBench Pro API", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://yeabsira-mesfin.github.io").split(","), allow_methods=["GET","POST"], allow_headers=["Content-Type", "Authorization"])

class Scores(BaseModel):
    correctness: float = Field(ge=0, le=100)
    security: float = Field(ge=0, le=100)
    tests: float = Field(ge=0, le=100)
    maintainability: float = Field(ge=0, le=100)
    documentation: float = Field(ge=0, le=100)

@app.get("/health")
def health(): return {"status":"ok","service":"agentbench-swe"}

@app.post("/evaluate")
def score(scores: Scores): return evaluate(scores.model_dump())

@app.get("/api/tasks")
def tasks(): return public_tasks()

class Submission(BaseModel):
    task_id: str = Field(max_length=30)
    satisfied_checks: list[str] = Field(max_length=5)
    explanation: str = Field(min_length=20, max_length=4000)
    maintainability: bool
    documentation: bool

    @field_validator("explanation")
    @classmethod
    def evidence_not_whitespace(cls, value):
        if len(value.strip()) < 20:
            raise ValueError("Provide at least 20 non-padding characters of review evidence")
        return value.strip()

@app.post("/api/evaluate")
def structured_score(submission: Submission):
    from fastapi import HTTPException
    task = next((t for t in TASKS if t["id"] == submission.task_id), None)
    if not task:
        raise HTTPException(404, "Unknown task")
    checks = set(submission.satisfied_checks)
    if not checks.issubset({"c0", "c1", "c2", "c3", "c4"}) or len(checks) != len(submission.satisfied_checks):
        raise HTTPException(422, "Checks must be known and unique")
    result = evaluate({"correctness": 50 * sum(c in checks for c in ["c0", "c1"]), "security": 100 if "c2" in checks else 0, "tests": 50 * sum(c in checks for c in ["c3", "c4"]), "maintainability": 100 if submission.maintainability else 0, "documentation": 100 if submission.documentation else 0})
    # Server-only release policy, separate from the public rubric. These are
    # structural gates, not claimed hidden executable tests.
    result.update({"task_id": task["id"], "rubric_version": "1.1", "mode": "reviewer_attested", "explanation": submission.explanation, "release_ready": all(c in checks for c in ["c0", "c1", "c2", "c4"]), "gates": {"security": "c2" in checks, "regression_safety": "c4" in checks}, "executed_tests": 0, "limitation": "Reviewer-attested criteria. No candidate code or model was executed."})
    return result

# Pro endpoints are additive; legacy scoring/reviewer endpoints keep their contract.
from .pro.api import router as pro_router
app.include_router(pro_router)
from .pro.limits import ProBodyLimit
app.add_middleware(ProBodyLimit)

@app.middleware("http")
async def private_evidence_headers(request, call_next):
    response = await call_next(request)
    if request.url.path.startswith("/api/pro/"):
        response.headers["Cache-Control"] = "no-store"
        response.headers["X-Content-Type-Options"] = "nosniff"
    return response
