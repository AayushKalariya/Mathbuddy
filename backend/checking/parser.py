"""A bounded arithmetic grammar, not Python eval or SymPy's string parser.

Only exact rational arithmetic and one-variable affine expressions are converted
to SymPy objects. Variable denominators/nonlinear products are rejected before
they can be simplified away. Original expression trees remain available to hints.
"""

from dataclasses import dataclass
from functools import cached_property
import re

from sympy import Rational, Symbol

MAX_TOKENS = 128
MAX_DEPTH = 16
MAX_BITS = 256
TOKEN = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)|[a-zA-Z]+|[()+\-*/^=]")
NUMBER = re.compile(r"(?:\d+(?:\.\d*)?|\.\d+)\Z")


class MathInputError(ValueError):
    def __init__(self, message: str, status: str = "needs_clarification",
                 issue_type: str = "invalid_input") -> None:
        super().__init__(message)
        self.status = status
        self.issue_type = issue_type


def limited(value: Rational) -> Rational:
    if max(abs(int(value.p)).bit_length(), int(value.q).bit_length()) > MAX_BITS:
        raise MathInputError("This calculation is too large for the first checker.",
                             "unsupported", "complexity_limit")
    return value


@dataclass(frozen=True)
class Affine:
    a: Rational = Rational(0)
    b: Rational = Rational(0)

    def __add__(self, other: "Affine") -> "Affine":
        return Affine(limited(self.a + other.a), limited(self.b + other.b))

    def scale(self, factor: Rational) -> "Affine":
        return Affine(limited(self.a * factor), limited(self.b * factor))

    def __sub__(self, other: "Affine") -> "Affine":
        return self + other.scale(Rational(-1))

    def expression(self, variable: str):
        return self.a * Symbol(variable, real=True) + self.b


@dataclass(frozen=True)
class Node:
    op: str
    args: tuple["Node", ...] = ()
    value: Rational | str | None = None

    @cached_property
    def has_variable(self) -> bool:
        return self.op == "variable" or any(arg.has_variable for arg in self.args)

    @cached_property
    def affine(self) -> Affine:
        if self.op == "number":
            return Affine(b=self.value)
        if self.op == "variable":
            return Affine(a=Rational(1))
        left = self.args[0].affine
        if self.op == "neg":
            return left.scale(Rational(-1))
        right = self.args[1].affine
        if self.op == "add":
            return left + right
        if self.op == "sub":
            return left - right
        if self.op == "mul":
            if left.a and right.a:
                raise MathInputError("Products of variable expressions are not supported yet.",
                                     "unsupported", "nonlinear_expression")
            return left.scale(right.b) if not right.a else right.scale(left.b)
        if self.op == "div":
            if self.args[1].has_variable:
                raise MathInputError("Fractions with variables in the denominator are not supported yet.",
                                     "unsupported", "variable_denominator")
            if right.b == 0:
                raise MathInputError("Division by zero is undefined. Check the denominator.",
                                     issue_type="undefined_expression")
            return left.scale(Rational(1) / right.b)
        if self.op == "pow":
            if self.args[1].has_variable or right.b.q != 1 or abs(right.b) > 8:
                raise MathInputError("Only constant integer powers from -8 to 8 are supported.",
                                     "unsupported", "unsupported_power")
            exponent = int(right.b)
            if self.args[0].has_variable:
                if exponent == 1:
                    return left
                raise MathInputError("Variable powers are not supported by the linear checker yet.",
                                     "unsupported", "nonlinear_expression")
            if left.b == 0 and exponent <= 0:
                raise MathInputError("This power of zero is undefined in this checker.",
                                     issue_type="undefined_expression")
            return Affine(b=limited(left.b ** exponent))
        raise AssertionError("Unexpected internal grammar operation")

    def contains_distribution(self) -> bool:
        return (self.op == "mul" and any(a.op in ("add", "sub") for a in self.args)
                or any(a.contains_distribution() for a in self.args))


@dataclass(frozen=True)
class ParsedMath:
    source: str
    left: Node
    right: Node | None = None

    @property
    def has_variable(self) -> bool:
        return self.left.has_variable or bool(self.right and self.right.has_variable)


class Parser:
    def __init__(self, text: str, variable: str) -> None:
        if len(text) > 256:
            raise MathInputError("Keep each line within 256 characters.", "unsupported", "complexity_limit")
        self.source = text.translate(str.maketrans({"−": "-", "×": "*", "÷": "/",
                                                  "²": "^2", "³": "^3"})).strip()
        self.variable = variable
        self.tokens: list[str] = []
        index = 0
        while index < len(self.source):
            if self.source[index].isspace():
                index += 1
                continue
            match = TOKEN.match(self.source, index)
            if not match:
                raise MathInputError("Use typed numbers, one variable, parentheses, +, -, *, /, ^ and =. LaTeX and other notation are not supported yet.")
            token = match.group()
            if token.isalpha() and token != variable:
                raise MathInputError(f"This check supports only the variable {variable}; functions and other symbols are not supported yet.",
                                     "unsupported", "unsupported_symbol")
            if NUMBER.fullmatch(token) and sum(c.isdigit() for c in token) > 12:
                raise MathInputError("Use numbers with at most 12 digits.", "unsupported", "complexity_limit")
            self.tokens.append(token)
            index = match.end()
        if len(self.tokens) > MAX_TOKENS:
            raise MathInputError("This line has too many operations.", "unsupported", "complexity_limit")
        self.position = 0

    def peek(self) -> str | None:
        return self.tokens[self.position] if self.position < len(self.tokens) else None

    def take(self) -> str:
        token = self.peek()
        if token is None:
            raise MathInputError("Finish writing this expression before checking it.", "incomplete", "unfinished_input")
        self.position += 1
        return token

    def parse(self) -> ParsedMath:
        left = self.sum(0)
        right = None
        if self.peek() == "=":
            self.take()
            right = self.sum(0)
        if self.peek() is not None:
            raise MathInputError("Check parentheses and operators. Use just one equation per step.")
        # Validate every node, including restrictions that simplification could hide.
        left.affine
        if right:
            right.affine
        return ParsedMath(self.source, left, right)

    def sum(self, depth: int) -> Node:
        node = self.product(depth)
        while self.peek() in ("+", "-"):
            op = self.take()
            node = Node("add" if op == "+" else "sub", (node, self.product(depth)))
        return node

    def product(self, depth: int) -> Node:
        node = self.unary(depth)
        while True:
            token = self.peek()
            if token in ("*", "/"):
                self.take()
                node = Node("mul" if token == "*" else "div", (node, self.unary(depth)))
            elif token == "(" or token == self.variable:
                node = Node("mul", (node, self.unary(depth)))
            else:
                return node

    def unary(self, depth: int) -> Node:
        if depth > MAX_DEPTH:
            raise MathInputError("There are too many nested operations.", "unsupported", "complexity_limit")
        if self.peek() in ("+", "-"):
            sign = self.take()
            child = self.unary(depth + 1)
            return child if sign == "+" else Node("neg", (child,))
        node = self.primary(depth)
        if self.peek() == "^":
            self.take()
            node = Node("pow", (node, self.unary(depth + 1)))
        return node

    def primary(self, depth: int) -> Node:
        token = self.take()
        if token == "(":
            if depth >= MAX_DEPTH:
                raise MathInputError("There are too many nested parentheses.", "unsupported", "complexity_limit")
            node = self.sum(depth + 1)
            if self.peek() is None:
                raise MathInputError("Close the parentheses before checking.", "incomplete", "unfinished_input")
            if self.take() != ")":
                raise MathInputError("Check the parentheses in this line.")
            return node
        if token == self.variable:
            return Node("variable", value=token)
        if NUMBER.fullmatch(token):
            return Node("number", value=Rational(token))
        raise MathInputError("An expression is missing or an operator is misplaced.")


def parse_math(text: str, variable: str = "x") -> ParsedMath:
    return Parser(text, variable).parse()
