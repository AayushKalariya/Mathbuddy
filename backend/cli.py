"""Interactive, one-command, and JSON testing without a running server."""

import argparse
import json
import re

from pydantic import ValidationError

from backend.checking.checker import check_step
from backend.models import CheckRequest, CheckResult


def show(result: CheckResult, as_json: bool = False) -> None:
    if as_json:
        print(json.dumps(result.model_dump(exclude_none=True), indent=2))
        return
    print(f"\nResult: {result.status}")
    print(f"Transition: {result.transition_status}; earlier work: {result.context_status}")
    print(result.message)
    if result.hint:
        print(f"Hint: {result.hint}")
    for warning in result.warnings:
        print(f"Warning: {warning}")
    if result.correction:
        print(f"One valid correction: {result.correction}")
    elif result.correction_available:
        print("A correction is available on request.")
    print("You may continue even when a warning is shown.")


def interactive(input_format: str = "text") -> None:
    print("Math Buddy: typed-step test. Type :quit at any input to exit.")
    print(f"Start with arithmetic or linear equations. Default variable is x. Format: {input_format}.")
    while True:
        problem = input("\nOriginal problem: ").strip()
        if problem == ":quit":
            return
        while True:
            variable = input("Variable letter to solve for [Enter for x]: ").strip() or "x"
            if variable == ":quit":
                return
            if re.fullmatch(r"[a-zA-Z]", variable):
                break
            print("Enter one letter, such as x, or press Enter to use x. This is not the numerical answer.")
        previous = input("Previous step [same as problem]: ").strip() or problem
        if previous == ":quit":
            return
        current = input("New step: ").strip()
        if current == ":quit":
            return
        try:
            request = CheckRequest(problem=problem, previous_step=previous,
                                   new_step=current, variable=variable, input_format=input_format)
            result = check_step(request)
            show(result)
            if result.correction_available:
                answer = input("Show one valid correction? [y/N]: ").strip().lower()
                if answer == ":quit":
                    return
                if answer in ("y", "yes"):
                    show(check_step(request.model_copy(update={"request_correction": True})))
        except ValidationError as error:
            print(f"Input validation error: {error}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Test Math Buddy's local typed checker.")
    parser.add_argument("--problem")
    parser.add_argument("--previous")
    parser.add_argument("--step")
    parser.add_argument("--variable", default="x")
    parser.add_argument("--format", choices=("text", "latex"), default="text", help="Format used by all math inputs, including history.")
    parser.add_argument("--history", action="append", default=[], help="Earlier line before --previous; repeat in order.")
    parser.add_argument("--correction", action="store_true", help="Explicitly request an evidence-backed correction.")
    parser.add_argument("--json", action="store_true", help="Print the structured result.")
    args = parser.parse_args()
    if args.problem is None and args.previous is None and args.step is None:
        try:
            interactive(args.format)
        except (EOFError, KeyboardInterrupt):
            print("\nFinished.")
        return
    if args.problem is None or args.step is None:
        parser.error("Supply both --problem and --step, or omit arguments for interactive mode.")
    try:
        request = CheckRequest(problem=args.problem, previous_step=args.previous if args.previous is not None else args.problem,
                               new_step=args.step, variable=args.variable, history=args.history,
                               request_correction=args.correction, input_format=args.format)
    except ValidationError as error:
        parser.error(str(error))
    show(check_step(request), args.json)


if __name__ == "__main__":
    main()
