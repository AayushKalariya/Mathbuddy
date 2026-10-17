"""Validated, stateless contracts shared by the CLI and HTTP API."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field

MathText = Annotated[str, Field(max_length=256)]


class CheckRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True, json_schema_extra={
        "examples": [{"problem": "3(x + 2) = 15", "previous_step": "3x + 6 = 15",
                      "new_step": "3x = 11", "variable": "x", "history": [],
                      "request_correction": False, "step_id": "step-2",
                      "revision": 0, "context_revision": 0}]
    })

    problem: MathText
    previous_step: MathText
    new_step: MathText
    input_format: Literal["text", "latex"] = "text"
    variable: str = Field(default="x", pattern=r"^[a-zA-Z]$")
    # Earlier lines before previous_step, in order. Include them on each request.
    history: list[MathText] = Field(default_factory=list, max_length=32)
    request_correction: bool = False
    step_id: str = Field(default="step-1", min_length=1, max_length=80)
    revision: int = Field(default=0, ge=0, le=2_147_483_647)
    context_revision: int = Field(default=0, ge=0, le=2_147_483_647)


class CheckResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    status: Literal["verified", "issue", "needs_clarification", "incomplete", "unsupported"]
    transition_status: Literal["valid", "invalid", "unresolved"]
    context_status: Literal["consistent", "earlier_issue", "unresolved"]
    message: str
    hint: str | None = None
    issue_type: str | None = None
    verification_basis: str
    reviewer: Literal["local", "gemini"] = "local"
    model: str | None = None
    correction_available: bool = False
    correction: str | None = None
    warnings: list[str] = Field(default_factory=list)
    can_continue: Literal[True] = True
    interpretation: dict[str, str] = Field(default_factory=dict)
    step_id: str
    revision: int
    context_revision: int
    input_fingerprint: str
