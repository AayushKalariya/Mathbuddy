"""Exact values for arithmetic and expression rewrites."""

from dataclasses import dataclass

from sympy import Rational

from .parser import Affine, MathInputError, ParsedMath


@dataclass(frozen=True)
class ArithmeticValue:
    value: Rational
    consistent: bool


def arithmetic_value(parsed: ParsedMath) -> ArithmeticValue:
    if parsed.has_variable:
        raise MathInputError("Keep this arithmetic calculation free of variables.",
                             "unsupported", "task_type_changed")
    left = parsed.left.affine.b
    return ArithmeticValue(left, parsed.right is None or parsed.right.affine.b == left)


def expression_value(parsed: ParsedMath) -> Affine:
    if parsed.right is not None:
        raise MathInputError("Rewrite the expression without introducing an equals sign.",
                             issue_type="task_type_changed")
    return parsed.left.affine
