"""A bounded negative-only check for first polynomial integral evaluations.

Gemini still reviews every step. This guard can veto a contradictory positive,
never approve work or claim support for general calculus. No eval/parse_expr,
model code, numeric sampling, or general symbolic integration is used.
"""
from dataclasses import dataclass
import re

from sympy import Poly, Rational, symbols

from backend.models import CheckRequest
from .latex_adapter import latex_to_text
from .parser import MathInputError

VARIABLES = symbols("x y z")
TOKEN = re.compile(r"\d+(?:\.\d+)?|[xyz]|[()+*/^\-]")


def bounded(poly: Poly) -> Poly:
    if poly.total_degree() > 12 or len(poly.terms()) > 256:
        raise ValueError("Polynomial complexity limit")
    for coefficient in poly.coeffs():
        if max(abs(int(coefficient.p)).bit_length(), int(coefficient.q).bit_length()) > 256:
            raise ValueError("Coefficient limit")
    return poly


class PolynomialReader:
    def __init__(self, text: str):
        self.text = re.sub(r"\s+", "", latex_to_text(text))
        self.tokens = TOKEN.findall(self.text)
        if "".join(self.tokens) != self.text or len(self.tokens) > 128:
            raise ValueError("Unsupported polynomial notation")
        if any(token[0].isdigit() and len(token) > 12 for token in self.tokens):
            raise ValueError("Number limit")
        self.position = 0

    def peek(self):
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def take(self):
        result = self.peek()
        if result is None:
            raise ValueError("Missing term")
        self.position += 1
        return result

    def read(self):
        result = self.sum(0)
        if self.peek() is not None:
            raise ValueError("Unexpected notation")
        return bounded(result)

    def sum(self, depth):
        result = self.product(depth)
        while self.peek() in ("+", "-"):
            operation, right = self.take(), self.product(depth)
            result = bounded(result + right if operation == "+" else result - right)
        return result

    def product(self, depth):
        result = self.unary(depth)
        while self.peek() in ("*", "/", "(", "x", "y", "z"):
            operation = self.take() if self.peek() in ("*", "/") else "*"
            right = self.unary(depth)
            if operation == "/":
                if right.total_degree() != 0 or right.is_zero:
                    raise ValueError("Only constant denominators")
                result = bounded(result.mul_ground(1 / right.as_expr()))
            else:
                if result.total_degree() + right.total_degree() > 12:
                    raise ValueError("Degree limit")
                result = bounded(result * right)
        return result

    def unary(self, depth):
        if depth > 16:
            raise ValueError("Depth limit")
        if self.peek() in ("+", "-"):
            sign, child = self.take(), self.unary(depth + 1)
            return child if sign == "+" else -child
        token = self.take()
        if token == "(":
            result = self.sum(depth + 1)
            if self.take() != ")":
                raise ValueError("Unbalanced grouping")
        elif token in ("x", "y", "z"):
            result = Poly(VARIABLES[("x", "y", "z").index(token)], *VARIABLES, domain="QQ")
        elif re.fullmatch(r"\d+(?:\.\d+)?", token):
            result = Poly(Rational(token), *VARIABLES, domain="QQ")
        else:
            raise ValueError("Missing polynomial term")
        if self.peek() == "^":
            self.take()
            grouped = self.peek() == "("
            if grouped:
                self.take()
            exponent = self.take()
            if not exponent.isdigit() or int(exponent) > 8:
                raise ValueError("Power limit")
            if grouped and self.take() != ")":
                raise ValueError("Unclear exponent")
            power = int(exponent)
            if result.total_degree() * power > 12:
                raise ValueError("Degree limit")
            result = bounded(result ** power)
        return result


def normalize(text):
    text = text.strip()
    for left, right in (("$$", "$$"), ("$", "$"), (r"\[", r"\]"), (r"\(", r"\)")):
        if text.startswith(left) and text.endswith(right):
            text = text[len(left):-len(right)]
            break
    text = text.replace(r"\left.", "").replace(r"\right.", "")
    text = re.sub(r"\\(?:mathrm|mathop)\{d\}", "d", text)
    text = re.sub(r"\\(?:displaystyle|limits|left|right|[Bb]igg?[lr]?|quad|qquad)(?![A-Za-z])", "", text)
    text = re.sub(r"\\[,;! ]", "", text)
    text = text.replace(r"\rvert", "|").replace(r"\vert", "|")
    return re.sub(r"\s+", "", text)


def atom(text, position):
    if position >= len(text):
        raise ValueError("Missing bound")
    if text[position] != "{":
        return text[position], position + 1
    depth, end = 1, position + 1
    while end < len(text) and depth:
        depth += (text[end] == "{") - (text[end] == "}")
        end += 1
    if depth:
        raise ValueError("Unbalanced bound")
    return text[position + 1:end - 1], end


def bounds(text, position):
    values = {}
    for _ in range(2):
        if position >= len(text) or text[position] not in ("_", "^") or text[position] in values:
            raise ValueError("Missing definite limits")
        key = text[position]
        raw, position = atom(text, position + 1)
        value = PolynomialReader(raw).read()
        if value.total_degree() != 0 or abs(value.as_expr()) > 64:
            raise ValueError("Only small constant bounds")
        values[key] = value.as_expr()
    return (values["_"], values["^"]), position


@dataclass(frozen=True)
class Integral:
    variable: object
    low: object
    high: object


def integrals(text):
    limits, position = [], 0
    while text.startswith(r"\int", position):
        if len(limits) >= 2:
            raise ValueError("Only double integrals")
        pair, position = bounds(text, position + 4)
        limits.append(pair)
    if not limits:
        return [], text
    suffix = re.search(r"(?:d[xyz])+$", text)
    if not suffix or len(suffix[0]) != 2 * len(limits):
        raise ValueError("Unclear integration variables")
    variables = [VARIABLES[("x", "y", "z").index(letter)] for letter in re.findall(r"d([xyz])", suffix[0])]
    if len(set(variables)) != len(variables):
        raise ValueError("Repeated integration variables")
    entries = [Integral(variable, *pair) for variable, pair in zip(reversed(variables), limits)]
    return entries, text[position:suffix.start()]


def evaluate(poly, variable, low, high):
    return Poly(poly.as_expr().subs(variable, high) - poly.as_expr().subs(variable, low), *VARIABLES, domain="QQ")


def integrate(poly, entry):
    return evaluate(poly.integrate(entry.variable), entry.variable, entry.low, entry.high)


def integral_issue(request: CheckRequest) -> str | None:
    if request.history or len(request.problem) > 256 or len(request.new_step) > 256:
        return None
    try:
        problem = normalize(request.problem)
        if normalize(request.previous_step) != problem:
            return None
        entries, integrand = integrals(problem)
        if len(entries) != 2 or any(entry.low == entry.high for entry in entries):
            return None
        original = PolynomialReader(integrand).read()
        if original.as_expr().free_symbols - {entry.variable for entry in entries}:
            return None
        remaining, written = integrals(normalize(request.new_step))
        if len(remaining) > 1 or written.count("|") != 1:
            return None
        formula, suffix = written.split("|")
        limits, end = bounds(suffix, 0)
        if end != len(suffix):
            return None
        proposed = PolynomialReader(formula).read()
        if proposed.as_expr().free_symbols - {entry.variable for entry in entries}:
            return None  # New substitution variables need Gemini's broader review.
        total = integrate(integrate(original, entries[1]), entries[0])
        if remaining:
            outer = remaining[0]
            candidates = [entry for entry in entries if entry.variable != outer.variable]
            if outer.variable not in {entry.variable for entry in entries} or len(candidates) != 1:
                return None
            if integrate(evaluate(proposed, candidates[0].variable, *limits), outer) == total:
                return None
        else:
            # A bare evaluated inner step does not explicitly bind its variable.
            # Allow either integration order and correctly rescaled bounds.
            for index, entry in enumerate(entries):
                value = evaluate(proposed, entry.variable, *limits)
                if value == integrate(original, entry) or integrate(value, entries[1 - index]) == total:
                    return None
        return "This integral evaluation is not equivalent to the original integral. The submitted variables or bounds are inconsistent."
    except (ValueError, KeyError, IndexError, TypeError, MathInputError, ZeroDivisionError):
        return None  # Unsupported/ambiguous notation is never a local verdict.
