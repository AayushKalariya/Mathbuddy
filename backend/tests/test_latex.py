import unittest

from backend.checking.checker import check_step
from backend.models import CheckRequest


def check(problem, current, previous=None, **kwargs):
    return check_step(CheckRequest(problem=problem, previous_step=previous if previous is not None else problem,
                                  new_step=current, input_format="latex", **kwargs))


class LatexTests(unittest.TestCase):
    def test_ocr_spaces_and_delimiters(self):
        self.assertEqual(check(r"$3\left(x+2\right)=15$", r"3 x+6=15").status, "verified")
        self.assertEqual(check(r"\(3x=9\)", r"\[x=3\]").status, "verified")

    def test_fractions(self):
        for problem in (r"\frac{x}{2}=3", r"\dfrac{x}{2}=3", r"\tfrac{x}{2}=3"):
            self.assertEqual(check(problem, "x=6").status, "verified")

    def test_actual_question_image_recognition_output(self):
        # Captured from the integrated local model, not a fabricated OCR sample.
        problem = r"3 [ \mathrm { x } + 2 ] = 1 5"
        self.assertEqual(check(problem, "3x+6=15").status, "verified")
        self.assertEqual(check(problem, "3x=11").status, "issue")

    def test_font_wrappers_do_not_add_function_support(self):
        for command in ("mathrm", "mathit", "mathbf"):
            self.assertEqual(check(f"\\{command}{{x}}=3", "x=3").status, "verified")
            self.assertEqual(check("x=3", f"\\{command}{{sin}}(x)=3").status, "unsupported")

    def test_spaced_digits_and_grouping_preserve_latex_meaning(self):
        self.assertEqual(check("1 5", "15").status, "verified")
        self.assertEqual(check("2[3+1]", "8").status, "verified")
        self.assertEqual(check("x=3", "x=[3").status, "incomplete")

    def test_nested_fraction(self):
        result = check(r"\frac{1}{\frac{2}{3}}", r"\frac{3}{2}")
        self.assertEqual(result.status, "verified")

    def test_arithmetic_latex(self):
        self.assertEqual(check(r"\frac{1}{2}+\frac{1}{4}", r"\frac{3}{4}").status, "verified")
        self.assertEqual(check(r"2\times 3+4\div 2", "8").status, "verified")
        self.assertEqual(check(r"2\cdot 3", "6").status, "verified")

    def test_exponents_retain_scope(self):
        self.assertEqual(check(r"2^{3}", "8").status, "verified")
        self.assertEqual(check("x=3", r"x^{2}=9").status, "unsupported")

    def test_denominator_restrictions_preserved(self):
        result = check("x=3", r"\frac{x}{x}=1")
        self.assertEqual(result.issue_type, "variable_denominator")

    def test_unknown_commands_are_not_executed(self):
        for line in (r"\int x dx", r"\sqrt{4}", r"\input{secret}", r"\begin{aligned}x&=3\end{aligned}"):
            self.assertEqual(check("x=3", line).status, "unsupported")

    def test_unfinished_fraction(self):
        self.assertEqual(check("x=3", r"x=\frac{1}{").status, "incomplete")
        self.assertEqual(check("x=3", r"x=\frac{1}").status, "incomplete")

    def test_correction_still_opt_in(self):
        hidden = check("3x=9", r"x=\frac{4}{1}")
        self.assertIsNone(hidden.correction)
        revealed = check("3x=9", r"x=\frac{4}{1}", request_correction=True)
        self.assertEqual(revealed.correction, "x = 3")

    def test_history_is_translated(self):
        result = check("3x+6=15", "3=x", previous="x=3", history=[r"x=\frac{11}{3}"])
        self.assertEqual(result.context_status, "earlier_issue")

    def test_empty_and_bad_groups(self):
        self.assertEqual(check("x=3", "$$").status, "incomplete")
        self.assertEqual(check("x=3", "x=3}").status, "needs_clarification")
        self.assertEqual(check("x=3", r"x=\frac12").status, "unsupported")


if __name__ == "__main__":
    unittest.main()
