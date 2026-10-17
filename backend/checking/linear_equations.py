"""Solution sets for affine equations over the real numbers only."""

from sympy import FiniteSet, S

from .parser import MathInputError, ParsedMath


def solution_set(parsed: ParsedMath):
    if parsed.right is None:
        raise MathInputError("Include both sides and an equals sign in this equation.",
                             issue_type="missing_equation")
    residual = parsed.left.affine - parsed.right.affine
    if residual.a == 0:
        return S.Reals if residual.b == 0 else S.EmptySet
    return FiniteSet(-residual.b / residual.a)
