import json
from pathlib import Path
import subprocess
import sys
import unittest

ROOT = Path(__file__).resolve().parents[2]


class CliTests(unittest.TestCase):
    def run_cli(self, *args, input_text=None):
        return subprocess.run([sys.executable, "-m", "backend.cli", *args],
                              input=input_text, capture_output=True, text=True,
                              cwd=ROOT, timeout=20)

    def test_one_command_json(self):
        process = self.run_cli("--problem", "3x+6=15", "--step", "3x=9", "--json")
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertEqual(json.loads(process.stdout)["status"], "verified")

    def test_correction_flag_is_required(self):
        args = ("--problem", "3x+6=15", "--step", "3x=11", "--json")
        self.assertNotIn("correction", json.loads(self.run_cli(*args).stdout))
        self.assertEqual(json.loads(self.run_cli(*args, "--correction").stdout)["correction"], "3*x = 9")

    def test_repeatable_history_option(self):
        process = self.run_cli("--problem", "3x+6=15", "--history", "3x=11", "--previous", "x=3",
                               "--step", "3=x", "--json")
        self.assertEqual(json.loads(process.stdout)["context_status"], "earlier_issue")

    def test_latex_format(self):
        process = self.run_cli("--format", "latex", "--problem", r"\frac{x}{2}=3", "--step", "x=6", "--json")
        self.assertEqual(json.loads(process.stdout)["status"], "verified")

    def test_invalid_command(self):
        self.assertEqual(self.run_cli("--problem", "x=3").returncode, 2)

    def test_interactive_mode(self):
        process = self.run_cli(input_text="3x+6=15\nx\n\n3x=11\ny\n:quit\n")
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("Result: issue", process.stdout)
        self.assertIn("One valid correction: 3*x = 9", process.stdout)

    def test_interactive_reprompts_variable_without_losing_problem(self):
        for invalid in ("3", "xy", "é"):
            with self.subTest(variable=invalid):
                process = self.run_cli(input_text=f"3(x+2)=15\n{invalid}\nx\n3x+6=15\n3x=9\n:quit\n")
                self.assertEqual(process.returncode, 0, process.stderr)
                self.assertIn("Enter one letter", process.stdout)
                self.assertIn("Result: verified", process.stdout)
                self.assertNotIn("Input validation error", process.stdout)
                self.assertEqual(process.stdout.count("Variable letter to solve for"), 2)

    def test_interactive_default_variable(self):
        process = self.run_cli(input_text="3(x+2)=15\n\n3x+6=15\n3x=9\n:quit\n")
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertIn("Result: verified", process.stdout)

    def test_interactive_quit_at_variable_retry(self):
        process = self.run_cli(input_text="3(x+2)=15\n3\n:quit\n")
        self.assertEqual(process.returncode, 0, process.stderr)
        self.assertNotIn("Previous step", process.stdout)
        self.assertNotIn("Input validation error", process.stdout)


if __name__ == "__main__":
    unittest.main()
