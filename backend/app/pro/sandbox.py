"""Fail-closed integration contract, intentionally no executable adapter shipped."""
from typing import Protocol
from pydantic import BaseModel, Field


class SandboxResult(BaseModel):
    passed: int = Field(ge=0)
    failed: int = Field(ge=0)
    timed_out: bool
    duration_ms: float = Field(ge=0)
    runner_digest: str


class CandidateSandbox(Protocol):
    """Future worker must verify isolation before accepting any uploaded code.

    Requirements: disposable non-root runtime, no network/secrets/host mounts,
    read-only root, bounded tmpfs/CPU/memory/PIDs/output, external hard deadline,
    unconditional cleanup. Server-side evaluator owns assertions and gates.
    Runner output is untrusted; candidate-reported passes are never evidence.
    """
    def execute(self, source: str, benchmark_id: str, dataset_version: str) -> SandboxResult: ...


class DisabledSandbox:
    def execute(self, source: str, benchmark_id: str, dataset_version: str) -> SandboxResult:
        raise RuntimeError("Arbitrary-code execution disabled: no verified sandbox adapter installed")
