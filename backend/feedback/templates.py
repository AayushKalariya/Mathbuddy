"""Hints describe observed evidence, not a guessed student intention."""

from dataclasses import dataclass

from sympy import sstr

from backend.checking.parser import Affine, ParsedMath


@dataclass(frozen=True)
class Feedback:
    hint: str
    issue_type: str
    correction: str | None = None


def text(value: Affine, variable: str) -> str:
    return sstr(value.expression(variable))


def equation(left: Affine, right: Affine, variable: str) -> str:
    return f"{text(left, variable)} = {text(right, variable)}"


def diagnose(mode: str, previous: ParsedMath, current: ParsedMath,
             variable: str) -> Feedback:
    if mode == "arithmetic":
        return Feedback("Recheck the arithmetic; the value changed.", "arithmetic_mismatch",
                        text(previous.left.affine, variable))
    if mode == "expression":
        return Feedback("Check the signs, coefficients, and arithmetic in this rewrite.",
                        "expression_mismatch", text(previous.left.affine, variable))

    assert previous.right is not None and current.right is not None
    old_l, old_r = previous.left.affine, previous.right.affine
    new_l, new_r = current.left.affine, current.right.affine

    if (previous.left.contains_distribution() and not current.left.contains_distribution()
            and old_r == new_r and old_l != new_l):
        return Feedback("Check whether you multiplied every term inside the parentheses.",
                        "distribution_mismatch", equation(old_l, old_r, variable))
    if (previous.right.contains_distribution() and not current.right.contains_distribution()
            and old_l == new_l and old_r != new_r):
        return Feedback("Check whether you multiplied every term inside the parentheses.",
                        "distribution_mismatch", equation(old_l, old_r, variable))

    delta_l, delta_r = new_l - old_l, new_r - old_r
    if delta_l.a == 0 and delta_r.a == 0 and delta_l.b != delta_r.b:
        # Give ONE valid correction retaining the side the student changed.
        # The checker independently verifies it before offering it.
        corrected = (equation(new_l, old_r + delta_l, variable) if delta_l.b != 0
                     else equation(old_l + delta_r, new_r, variable))
        return Feedback("Check whether you added or subtracted the same amount on both sides.",
                        "unbalanced_addition", corrected)

    if old_l.a != 0 and new_l.a != 0:
        factor = new_l.a / old_l.a
        if factor != 1 and old_l.scale(factor) == new_l:
            return Feedback("Check whether you multiplied or divided both sides by the same nonzero factor.",
                            "unbalanced_scaling", equation(new_l, old_r.scale(factor), variable))
    if old_r.a != 0 and new_r.a != 0:
        factor = new_r.a / old_r.a
        if factor != 1 and old_r.scale(factor) == new_r:
            return Feedback("Check whether you multiplied or divided both sides by the same nonzero factor.",
                            "unbalanced_scaling", equation(old_l.scale(factor), new_r, variable))

    return Feedback("This line changes the possible solutions. Recheck the operations on both sides.",
                    "solution_set_changed")
