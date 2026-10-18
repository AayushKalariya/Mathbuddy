"""Validated, stateless contracts shared by the CLI and HTTP API."""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

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
    is_final_answer: bool = False
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


class HintRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    problem: str = Field(min_length=1, max_length=256)
    variable: str = Field(default="x", pattern=r"^[a-zA-Z]$")
    # All confirmed lines BEFORE the selected box. Empty for question-only help.
    history: list[MathText] = Field(default_factory=list, max_length=33)
    current_step: MathText = ""
    level: Literal[1, 2, 3] = 1
    previous_hints: list[Annotated[str, Field(min_length=1, max_length=600)]] = Field(default_factory=list, max_length=2)
    request_next_step: bool = False
    earlier_issue_step: int | None = Field(default=None, ge=1, le=33)
    step_id: str = Field(default="question", min_length=1, max_length=80)
    revision: int = Field(default=0, ge=0, le=2_147_483_647)
    context_revision: int = Field(default=0, ge=0, le=2_147_483_647)

    @model_validator(mode="after")
    def validate_progression(self):
        if not self.problem.strip():
            raise ValueError("Confirm a question before asking for a hint.")
        if self.request_next_step != (self.level == 3):
            raise ValueError("A next step requires an explicit level-3 request.")
        if len(self.previous_hints) != self.level - 1:
            raise ValueError("Include the preceding hints before requesting more help.")
        if any(not line.strip() for line in self.history):
            raise ValueError("Earlier lines must have confirmed, nonempty readings.")
        if self.earlier_issue_step is not None and self.earlier_issue_step > len(self.history):
            raise ValueError("The earlier issue must refer to a supplied earlier line.")
        return self


class HintResult(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)
    kind: Literal["hint", "next_step", "needs_clarification", "earlier_issue", "unresolved"]
    hint: str
    next_step: str | None = None
    focus_step_number: int | None = None
    level: Literal[1, 2, 3]
    reviewer: Literal["gemini"] = "gemini"
    model: str
    step_id: str
    revision: int
    context_revision: int
