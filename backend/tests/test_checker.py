import unittest

from pydantic import ValidationError

from backend.checking.checker import check_step
from backend.models import CheckRequest


def check(problem: str, previous: str, current: str, **kwargs):
    return check_step(CheckRequest(problem=problem, previous_step=previous, new_step=current, **kwargs))


class ArithmeticTests(unittest.TestCase):
    def test_arithmetic_values(self):
        for problem, current in [("7+8", "15"), ("1/2+1/4", "3/4"),
                                 ("0.1+0.2", "0.3"), ("-3*(-4)", "12"),
                                 ("-2^2", "-4"), ("(-2)^2", "4"),
                                 ("2^-2", "1/4"), ("(7-3)/2", "2"),
                                 ("8÷2", "4"), ("3×4−2", "10")]:
            with self.subTest(problem=problem):
                self.assertEqual(check(problem, problem, current).status, "verified")

    def test_incorrect_arithmetic(self):
        result = check("2+2", "2+2", "5")
        self.assertEqual(result.status, "issue")
        self.assertEqual(result.issue_type, "arithmetic_mismatch")
        self.assertIsNone(result.correction)

    def test_numeric_equality_as_work(self):
        self.assertEqual(check("2+2", "2+2", "2+2=4").status, "verified")
        self.assertEqual(check("2+2", "2+2", "2+2=5").status, "issue")

    def test_true_numeric_problem(self):
        self.assertEqual(check("2+2=4", "4", "8/2").status, "verified")

    def test_false_original_statement_needs_clarification(self):
        self.assertEqual(check("2+2=5", "2+2=5", "5").status, "needs_clarification")

    def test_false_previous_equality_is_not_a_trusted_value(self):
        result = check("2+2", "2+2=5", "5")
        self.assertEqual(result.context_status, "earlier_issue")
        self.assertEqual(result.transition_status, "unresolved")

    def test_exact_decimals_not_tolerance(self):
        self.assertEqual(check("0.1+0.2", "0.1+0.2", "0.30000001").status, "issue")


class LinearTests(unittest.TestCase):
    def test_distribution(self):
        self.assertEqual(check("3(x+2)=15", "3(x+2)=15", "3x+6=15").status, "verified")

    def test_alternative_method_and_skipped_steps(self):
        for current in ("x+2=5", "3x=9", "x=3", "15=6+3x", "-3x=-9"):
            with self.subTest(current=current):
                self.assertEqual(check("3(x+2)=15", "3(x+2)=15", current).status, "verified")

    def test_fraction_and_negative_coefficients(self):
        for problem, current in [("x/2=3", "x=6"), ("-2x=6", "x=-3"),
                                 ("(x+2)/3=5", "x=13"), ("x/3+1/2=5/6", "x=1"),
                                 ("3y+6=15", "y=3")]:
            with self.subTest(problem=problem):
                self.assertEqual(check(problem, problem, current,
                                       variable="y" if "y" in problem else "x").status, "verified")

    def test_variables_on_both_sides(self):
        self.assertEqual(check("3x+2=x+8", "3x+2=x+8", "2x=6").status, "verified")

    def test_no_solution_and_identity(self):
        for problem, current in [("x+1=x+2", "0=1"), ("x+1=x+1", "0=0")]:
            self.assertEqual(check(problem, problem, current).status, "verified")

    def test_identity_does_not_replace_unique_solution(self):
        self.assertEqual(check("x=3", "x=3", "0=0").status, "issue")

    def test_contradiction_does_not_replace_unique_solution(self):
        self.assertEqual(check("x=3", "x=3", "0=1").status, "issue")

    def test_expression_rewrite(self):
        self.assertEqual(check("2x+3x", "2x+3x", "5x").status, "verified")
        self.assertEqual(check("2x+3x", "2x+3x", "6x").status, "issue")

    def test_task_type_changed(self):
        self.assertEqual(check("x=3", "x=3", "3").status, "needs_clarification")
        self.assertEqual(check("2x+3x", "2x+3x", "5x=0").status, "needs_clarification")

    def test_family_of_equivalent_and_wrong_answers(self):
        for coefficient in (-5, -2, 1, 3, 8):
            for answer in (-4, 0, 7):
                problem = f"{coefficient}x+6={coefficient * answer + 6}"
                with self.subTest(problem=problem):
                    self.assertEqual(check(problem, problem, f"x={answer}").status, "verified")
                    self.assertEqual(check(problem, problem, f"x={answer+1}").status, "issue")


class FeedbackTests(unittest.TestCase):
    def test_correction_opt_in(self):
        hidden = check("3(x+2)=15", "3x+6=15", "3x=11")
        revealed = check("3(x+2)=15", "3x+6=15", "3x=11", request_correction=True)
        self.assertTrue(hidden.correction_available)
        self.assertNotIn("correction", hidden.model_dump(exclude_none=True))
        self.assertEqual(revealed.correction, "3*x = 9")
        self.assertEqual(hidden.input_fingerprint, revealed.input_fingerprint)

    def test_distribution_hint_and_correction(self):
        result = check("3(x+2)=15", "3(x+2)=15", "3x+2=15", request_correction=True)
        self.assertEqual(result.issue_type, "distribution_mismatch")
        self.assertIn("every term", result.hint)
        self.assertEqual(result.correction, "3*x + 6 = 15")

    def test_right_hand_distribution(self):
        result = check("15=3(x+2)", "15=3(x+2)", "15=3x+2", request_correction=True)
        self.assertEqual(result.issue_type, "distribution_mismatch")
        self.assertEqual(check("15=3(x+2)", "15=3(x+2)", result.correction).status, "verified")

    def test_division_hint(self):
        result = check("3x=9", "3x=9", "x=4", request_correction=True)
        self.assertEqual(result.issue_type, "unbalanced_scaling")
        self.assertEqual(result.correction, "x = 3")

    def test_arithmetic_and_expression_corrections(self):
        self.assertEqual(check("1/2+1/4", "1/2+1/4", "1", request_correction=True).correction, "3/4")
        self.assertEqual(check("2x+3x", "2x+3x", "6x", request_correction=True).correction, "5*x")

    def test_unknown_intention_gets_no_invented_correction(self):
        result = check("3x+6=15", "3x+6=15", "2x+7=11", request_correction=True)
        self.assertEqual(result.issue_type, "solution_set_changed")
        self.assertFalse(result.correction_available)
        self.assertIsNone(result.correction)

    def test_valid_step_has_no_next_answer(self):
        result = check("3(x+2)=15", "3(x+2)=15", "3x+6=15", request_correction=True)
        self.assertEqual(result.status, "verified")
        self.assertIsNone(result.correction)
        self.assertFalse(result.correction_available)

    def test_prior_error_warns_despite_locally_valid_step(self):
        result = check("3x+6=15", "3x=11", "x=11/3", request_correction=True)
        self.assertEqual(result.status, "issue")
        self.assertEqual(result.transition_status, "valid")
        self.assertEqual(result.context_status, "earlier_issue")
        self.assertTrue(result.can_continue)
        self.assertTrue(result.warnings)
        self.assertIsNone(result.correction)

    def test_history_keeps_warning_after_apparent_recovery(self):
        result = check("3x+6=15", "x=3", "3=x", history=["3x=11"])
        self.assertEqual(result.context_status, "earlier_issue")
        self.assertEqual(result.transition_status, "valid")

    def test_changed_context_and_step_revisions_change_fingerprint(self):
        base = CheckRequest(problem="x=3", previous_step="x=3", new_step="3=x", step_id="s", revision=2)
        result = check_step(base)
        self.assertEqual(result.step_id, "s")
        self.assertEqual(result.revision, 2)
        for change in ({"revision": 3}, {"context_revision": 1}, {"history": ["x=4"]}, {"new_step": "x=4"}):
            self.assertNotEqual(result.input_fingerprint,
                                check_step(base.model_copy(update=change)).input_fingerprint)


class InputTests(unittest.TestCase):
    def test_incomplete_work(self):
        for current in ("", "3x=", "3x+", "(3x+2", "x=1/"):
            with self.subTest(current=current):
                self.assertEqual(check("3x=9", "3x=9", current).status, "incomplete")

    def test_incomplete_context_is_not_judged_as_new_work(self):
        self.assertEqual(check("", "3x=9", "x=3").status, "needs_clarification")
        self.assertEqual(check("3x=9", "3x=", "x=3").status, "needs_clarification")

    def test_nonlinear_and_unimplemented_topics(self):
        for current in ("x^2=4", "x²=4", "x*x=4", "sin(x)=0", "x+y=3"):
            with self.subTest(current=current):
                result = check("x=3", "x=3", current)
                self.assertEqual(result.status, "unsupported")
                self.assertIsNone(result.correction)

    def test_variable_denominators_not_cancelled_away(self):
        for current in ("x/x=1", "0/x=0", "x/(x-x+1)=3"):
            self.assertEqual(check("x=3", "x=3", current).issue_type, "variable_denominator")

    def test_undefined_values(self):
        for current in ("1/0", "0/0", "0^-1", "0^0"):
            self.assertEqual(check("2+2", "2+2", current).issue_type, "undefined_expression")

    def test_unsupported_power_limits(self):
        for current in ("2^9", "2^(1/2)", "2^x"):
            self.assertEqual(check("2+2", "2+2", current).status, "unsupported")

    def test_ambiguous_or_invalid_input(self):
        for current in ("2 3", "2..3", "3x==9", "3x=9=4", "()", "x<3", r"\frac{1}{2}"):
            with self.subTest(current=current):
                self.assertEqual(check("x=3", "x=3", current).status, "needs_clarification")

    def test_code_like_input_is_not_executed(self):
        for current in ("__import__('os').system('echo NO')", "x.__class__", "[1,2]", "open('a')"):
            result = check("x=3", "x=3", current)
            self.assertNotEqual(result.status, "verified")
            self.assertEqual(result.transition_status, "unresolved")

    def test_complexity_limits(self):
        for current in ("("*18 + "1" + ")"*18, "1234567890123", "+".join(["1"]*70), "((999999999999^8)^8)"):
            with self.subTest(current=current):
                self.assertEqual(check("4", "4", current).status, "unsupported")

    def test_input_contract(self):
        base = dict(problem="x=3", previous_step="x=3", new_step="3=x")
        for change in ({"variable": "xy"}, {"revision": -1}, {"revision": True},
                       {"request_correction": "true"}, {"problem": 3},
                       {"extra": "unknown"}, {"history": ["x=3"]*33}, {"new_step": "1"*257}):
            with self.subTest(change=change), self.assertRaises(ValidationError):
                CheckRequest(**(base | change))


if __name__ == "__main__":
    unittest.main()
