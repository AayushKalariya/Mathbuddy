"""Stateless verification with separate transition and earlier-work judgments."""

from dataclasses import dataclass
import hashlib
import json

from backend.feedback.templates import diagnose
from backend.models import CheckRequest, CheckResult
from .arithmetic import arithmetic_value, expression_value
from .linear_equations import solution_set
from .latex_adapter import latex_to_text
from .parser import MathInputError, ParsedMath, parse_math


@dataclass(frozen=True)
class Fact:
    signature: object
    consistent: bool = True

    def equivalent(self, other: "Fact") -> bool | None:
        if not self.consistent:
            return None
        return other.consistent and self.signature == other.signature


def fact(parsed: ParsedMath, mode: str) -> Fact:
    if mode == "equation":
        return Fact(solution_set(parsed))
    if mode == "expression":
        return Fact(expression_value(parsed))
    value = arithmetic_value(parsed)
    return Fact(value.value, value.consistent)


def check_step(request: CheckRequest) -> CheckResult:
    snapshot = request.model_dump(exclude={"request_correction"})
    fingerprint = hashlib.sha256(json.dumps(snapshot, sort_keys=True).encode()).hexdigest()
    common = dict(step_id=request.step_id, revision=request.revision,
                  context_revision=request.context_revision, input_fingerprint=fingerprint)
    interpretation: dict[str, str] = {}
    label = "problem"

    def read_line(source: str) -> ParsedMath:
        translated = latex_to_text(source) if request.input_format == "latex" else source
        return parse_math(translated, request.variable)

    try:
        problem = read_line(request.problem)
        interpretation["problem"] = problem.source
        mode = ("equation" if problem.right is not None and problem.has_variable
                else "expression" if problem.has_variable else "arithmetic")
        reference = fact(problem, mode)
        if not reference.consistent:
            raise MathInputError("The original arithmetic equality is false. Enter the calculation to evaluate or confirm the question.",
                                 issue_type="invalid_problem")

        earlier_issue = False
        for index, line in enumerate(request.history):
            label = f"history[{index}]"
            earlier = fact(read_line(line), mode)
            if not reference.equivalent(earlier):
                earlier_issue = True

        label = "previous_step"
        previous = read_line(request.previous_step)
        interpretation[label] = previous.source
        before = fact(previous, mode)
        earlier_issue |= not bool(reference.equivalent(before))

        label = "new_step"
        current = read_line(request.new_step)
        interpretation[label] = current.source
        after = fact(current, mode)
    except MathInputError as error:
        status = error.status
        if label != "new_step" and status == "incomplete":
            status = "needs_clarification"
        return CheckResult(status=status, transition_status="unresolved", context_status="unresolved",
                           message=f"{label}: {error}", issue_type=error.issue_type,
                           verification_basis="No mathematical verdict: input needs clarification or exceeds supported scope.",
                           interpretation=interpretation, **common)

    transition = before.equivalent(after)
    basis = ("Exact real solution-set comparison for one-variable linear equations."
             if mode == "equation" else "Exact rational arithmetic and affine-expression comparison.")
    if earlier_issue:
        message = ("This transition is valid, but earlier work still contains an issue."
                   if transition else "Earlier work contains an issue; this transition also needs review."
                   if transition is False else "The previous arithmetic equality is inconsistent, so this transition cannot be verified.")
        return CheckResult(status="issue", transition_status="valid" if transition else "invalid" if transition is False else "unresolved",
                           context_status="earlier_issue", message=message,
                           hint="Review the earlier warning before trusting the overall solution.",
                           issue_type="earlier_issue", verification_basis=basis,
                           warnings=["At least one supplied earlier line does not match the original problem. Continuing does not clear that warning."],
                           interpretation=interpretation, **common)

    if transition:
        return CheckResult(status="verified", transition_status="valid", context_status="consistent",
                           message="This step preserves the solutions." if mode == "equation" else "This step preserves the value of the expression.",
                           verification_basis=basis, interpretation=interpretation, **common)

    feedback = diagnose(mode, previous, current, request.variable)
    correction = feedback.correction
    if correction is not None:
        # Never reveal an unchecked suggested correction.
        try:
            candidate = fact(parse_math(correction, request.variable), mode)
            if not before.equivalent(candidate) or not reference.equivalent(candidate):
                correction = None
        except MathInputError:
            correction = None
    return CheckResult(status="issue", transition_status="invalid", context_status="consistent",
                       message="This step changes the mathematical result.", hint=feedback.hint,
                       issue_type=feedback.issue_type, verification_basis=basis,
                       correction_available=correction is not None,
                       correction=correction if request.request_correction else None,
                       interpretation=interpretation, **common)
