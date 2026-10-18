"""Definite-integral counterexamples and valid alternative transformations."""
import unittest

from backend.checking.integral_guard import integral_issue
from backend.models import CheckRequest

PROBLEM = r"\int_0^2\int_0^1 x^2 y^2\,dx\,dy"


def request(line, problem=PROBLEM, **changes):
    return CheckRequest(**({"problem": problem, "previous_step": problem,
                           "new_step": line, "input_format": "latex"} | changes))


class IntegralGuardTests(unittest.TestCase):
    def test_wrong_variable_bounds_and_coefficient_are_rejected(self):
        for line in (
            r"\left.\frac{x^2 y^3}{3}\right|_0^1",
            r"x^{2}\frac{y^{3}}{3}\Big|_{0}^{1}",
            r"\frac{x^3 y^2}{3}|_0^2",
            r"\frac{x^3 y^2}{3}|_1^0",
            r"\frac{x^3 y^2}{2}|_0^1",
            r"\int_0^2\frac{x^2 y^3}{3}|_0^1dy",
            r"\int_0^1\frac{x^2 y^3}{3}|_0^1dx",
        ):
            with self.subTest(line=line):
                self.assertIsNotNone(integral_issue(request(line)))

    def test_correct_partial_and_remaining_outer_integral_are_allowed(self):
        for line in (
            r"\left.\frac{x^3 y^2}{3}\right|_0^1",
            r"\left[\frac{x^{3}y^{2}}{3}\right]|^{1}_{0}",
            r"x^3\frac{y^2}{3}|_0^1",
            r"\int_0^2\left.\frac{x^3y^2}{3}\right|_0^1dy",
            r"\int_{0}^{2}\frac{x^3y^2}{3}|_0^1\mathrm{d}y",
        ):
            with self.subTest(line=line):
                self.assertIsNone(integral_issue(request(line)))

    def test_legitimate_reordering_and_rescaled_bounds_are_not_vetoed(self):
        for line in (
            r"\frac{x^2y^3}{3}|_0^2",
            r"\int_0^1\frac{x^2y^3}{3}|_0^2dx",
            r"\frac{8x^2y^3}{3}|_0^1",
            r"\int_0^1\frac{8x^2y^3}{3}|_0^1dx",
        ):
            with self.subTest(line=line):
                self.assertIsNone(integral_issue(request(line)))

    def test_equivalent_endpoint_value_is_allowed_even_with_a_different_primitive(self):
        # The added term vanishes at both endpoints. Do not reject an exact
        # endpoint rewrite merely because its derivative is not the integrand.
        line = r"\left(\frac{x^3y^2}{3}+x(x-1)y^5\right)|_0^1"
        self.assertIsNone(integral_issue(request(line)))

    def test_polynomial_sums_other_variables_and_constant_integrands(self):
        for problem, good, wrong in (
            (r"\int_0^2\int_0^1(x^2+y^2)dxdy", r"(x^3/3+xy^2)|_0^1", r"(x^3/3+y^3/3)|_0^1"),
            (r"\int_0^2\int_0^1 y^2z^2dydz", r"y^3z^2/3|_0^1", r"y^2z^3/3|_0^1"),
            (r"\int_0^2\int_0^1 2dxdy", r"2x|_0^1", r"x|_0^1"),
            (r"\int_{-1}^2\int_0^1 x^2y^2dxdy", r"x^3y^2/3|_0^1", r"x^2y^3/3|_0^1"),
        ):
            with self.subTest(problem=problem):
                self.assertIsNone(integral_issue(request(good, problem)))
                self.assertIsNotNone(integral_issue(request(wrong, problem)))

    def test_earlier_context_and_non_evaluation_steps_remain_with_gemini(self):
        line = r"x^2y^3/3|_0^1"
        self.assertIsNone(integral_issue(request(line, history=["earlier work"])))
        self.assertIsNone(integral_issue(request(line, previous_step="a substituted integral")))
        for other in (r"\frac{y^2}{3}", "8/9", r"\int_0^2\frac{y^2}{3}dy"):
            self.assertIsNone(integral_issue(request(other)))

    def test_unsupported_notation_and_large_inputs_never_get_a_local_verdict(self):
        for problem in (
            r"\int_0^1\sin(x)dx",
            r"\int_0^2\int_0^y x^2y^2dxdy",
            r"\int_0^1\int_0^2 x^2y^2dxdx",
            r"\int_0^1\int_0^1\int_0^1 xyz dxdydz",
            r"\int_0^0\int_0^1 x^2y^2dxdy",
        ):
            with self.subTest(problem=problem):
                self.assertIsNone(integral_issue(request(r"x^2y^3/3|_0^1", problem)))
        for line in (
            r"\sin(x)|_0^1", r"x^99|_0^1", r"x^(2^8)|_0^1",
            r"x/(y-1)|_0^1", r"1/0|_0^1", r"x|_0",
            "(" * 18 + "x" + ")" * 18 + "|_0^1",
            r"x^8y^8z^8|_0^1", r"u^3y^2/3|_0^1",
            "__import__('os').system('anything')|_0^1",
        ):
            with self.subTest(line=line):
                self.assertIsNone(integral_issue(request(line)))
