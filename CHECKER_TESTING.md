> Workspace update: the browser uses Gemini for every step. This guide describes
> the preserved offline CLI and explicit `/api/local/` tools. See [GEMINI_SETUP.md](GEMINI_SETUP.md).

# Testing Math Buddy's typed checker

This guide covers typed-checker testing. The dedicated writing workspace is now
available too: see [WORKSPACE_TESTING.md](WORKSPACE_TESTING.md). The recognition
demo/environment remains unchanged; an application adapter now calls its model
from the workspace. No paid services or internet connection are needed after
dependencies and model files are installed.

## Before testing

Open PowerShell in the project directory:

```powershell
Set-Location "C:\Users\aayus\Downloads\Mathbuddy"
```

The checker environment has already been created at .checker-venv. If recreating
it on this laptop, use Python 3.10 and the tested dependency lock:

```powershell
py -3.10 -m venv .checker-venv
.\.checker-venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
```

Do not install these into the recognition demo's .venv. No activation command or
PowerShell execution-policy change is necessary.

## 1. Easiest: interactive terminal

```powershell
.\.checker-venv\Scripts\python.exe -m backend.cli
```

Enter:

```text
Original problem: 3(x+2)=15
Variable letter to solve for [Enter for x]: [press Enter]
Previous step [same as problem]: 3x+6=15
New step: 3x=11
```

The variable is the letter you are solving for: enter x, or press Enter for the
default x. Do not enter the numerical answer (3 in this example). If you enter a
number or more than one letter, the CLI asks for the variable again and retains
your original problem. To load an updated CLI, type :quit and run the command
above again.

Expected: issue, a hint about applying the same addition/subtraction to both
sides, and no correction shown. Answer y to the correction question to reveal
one valid correction: 3*x = 9. This is a supported correction, not a claim to
know exactly what operation you intended.

Try again with new step 3x=9: expected verified. Type :quit to exit.
Each interactive check asks for its own problem and previous step; it does not
save a session or automatically carry history between checks.

## 2. One-command checks

Correct step:

```powershell
.\.checker-venv\Scripts\python.exe -m backend.cli --problem "3(x+2)=15" --previous "3x+6=15" --step "3x=9"
```

Mistake with correction explicitly requested:

```powershell
.\.checker-venv\Scripts\python.exe -m backend.cli --problem "3(x+2)=15" --previous "3x+6=15" --step "3x=11" --correction
```

Add --json to see the structured API-style result. Ordinary check outcomes all
exit successfully; malformed CLI arguments use exit code 2.

## 3. Browser API explorer

Start the server in PowerShell, leaving that window open:

```powershell
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs. Expand POST /api/local/check-step, select Try it out,
and use this request:

```json
{
  "problem": "3(x + 2) = 15",
  "previous_step": "3x + 6 = 15",
  "new_step": "3x = 11",
  "request_correction": false
}
```

Select Execute. Expected: status=issue, transition_status=invalid,
context_status=consistent, correction_available=true, and no correction field.
Here consistent describes the earlier work, not the incorrect new step.

Change request_correction to true and execute again. The response now includes
correction="3*x = 9". Change new_step to "3x = 9" to get verified.

The explorer's JavaScript/CSS is bundled locally; a CDN is not required. It is a
developer testing interface, not the planned writing workspace. Stop the server
with Ctrl+C. If port 8000 is occupied, choose --port 8001 and use that URL.

An optional launcher is available as .\start-checker.ps1. If local script policy
prevents running it, use the direct Python command above without changing policy.

### Optional iPad API testing

Stop the loopback server and restart with --host 0.0.0.0 instead of 127.0.0.1.
Use ipconfig to find the laptop's active LAN IPv4 address, then open
http://YOUR_LAPTOP_IP:8000/docs in iPad Safari on the same home network.
Allow the listening port through Windows Firewall on the private network if
needed. The laptop must stay awake. This provides typed API testing; open the
same server's root URL / for the new handwriting workspace.

Actual iPad interaction has not been verified during implementation.

## 4. Automated regression tests

```powershell
.\.checker-venv\Scripts\python.exe -m unittest discover -s backend/tests -v
```

A successful run ends with OK. Tests cover exact math, valid alternative paths,
lost solution sets, unsupported/unfinished input, hints and corrections, earlier
warnings, input limits, API contracts, local explorer assets, and the CLI.

## 5. Paste output from the recognition demo

Copy a supported equation's LaTeX from the existing UniMERNet demo. In the API
explorer set input_format to latex. Plain math is also accepted in this mode:

```json
{
  "problem": "\\frac{x}{2}=3",
  "previous_step": "\\frac{x}{2}=3",
  "new_step": "x=6",
  "input_format": "latex"
}
```

Expected: verified. Backslashes need doubling inside JSON strings. In PowerShell
arguments, use a single backslash:

```powershell
.\.checker-venv\Scripts\python.exe -m backend.cli --format latex --problem "\frac{x}{2}=3" --step "x=6"
```

The adapter supports grouped fractions (frac/dfrac/tfrac), left/right parentheses,
spacing, cdot/times/div, math delimiters, and braces. It never executes TeX. The
same mathematical limits still apply: an integral can be recognized by the demo
but cannot yet be mathematically verified by this checker. This is a text-output
bridge. The workspace now also connects image recognition; see WORKSPACE_TESTING.md.

## Suggested manual cases

Unless specified, use the original problem as previous_step.

| Original problem | Previous step | New step | Expected |
|---|---|---|---|
| 3(x+2)=15 | 3(x+2)=15 | 3x+6=15 | verified |
| 3(x+2)=15 | 3(x+2)=15 | x+2=5 | verified: different valid method |
| 3(x+2)=15 | 3x+6=15 | x=3 | verified: skipped steps |
| 3(x+2)=15 | 3x+6=15 | 3x=11 | issue |
| 3(x+2)=15 | 3(x+2)=15 | 3x+2=15 | distribution hint |
| 3x=9 | 3x=9 | x=4 | multiplication/division hint |
| 1/2+1/4 | 1/2+1/4 | 3/4 | verified |
| 0.1+0.2 | 0.1+0.2 | 0.3 | verified using exact decimals |
| -2x=6 | -2x=6 | x=-3 | verified |
| 3x=9 | 3x=9 | 3x= | incomplete |
| x=3 | x=3 | x^2=4 | unsupported, not a guessed verdict |
| x=3 | x=3 | x/x=1 | unsupported variable denominator |
| 4 | 4 | 1/0 | needs_clarification: undefined expression |
| 3x+6=15 | 3x=11 | x=11/3 | local transition valid, earlier_issue warning |

To preserve warnings from still earlier lines, include history (ordered, before
previous_step). For example:

```json
{
  "problem": "3x+6=15",
  "history": ["3x=11"],
  "previous_step": "x=3",
  "new_step": "3=x"
}
```

The latest transition is valid, but the supplied history still contains a
mistake. Submit corrected history after editing it to clear that warning. The
API is stateless: omitted history cannot be remembered for you.

## Supported notation and limits

- One selected single-letter variable (default x), real-valued linear equations.
- Numbers, exact decimals/fractions, parentheses, +, -, *, /, ^ and one = sign.
- Implicit multiplication: 3x, 3(x+2), and (x+1)(2).
- Unicode minus, multiplication/division signs, and superscript 2/3 normalize
  into typed notation; nonlinear variable powers remain unsupported.
- Variable denominators, inequalities, functions, calculus, word problems,
  multiple-variable math, and arbitrary LaTeX are not implemented yet. Supported
  OCR-LaTeX must be explicitly enabled with input_format=latex or --format latex.
- Use parentheses to make fractions unambiguous. 2/3x means (2/3)*x;
  2/(3x) is a variable denominator and is unsupported.
- Input limits: 256 characters/line, 128 tokens, 16 recursive nesting levels,
  12 digits/literal, 256-bit rational intermediates, integer numeric exponents
  from -8 to 8, 32 history lines, and 32 KiB/request. Exceeding supported
  expression limits produces an unresolved/unsupported response; malformed
  request contracts use HTTP 422 and oversized bodies HTTP 413.
- This is a bounded affine checker, not a general symbolic solver. An original
  false numerical equality needs clarification; use the expression to evaluate.
- status=verified means supported mathematical equivalence, not pedagogical
  efficiency or a unique preferred method. Unsupported does not mean wrong.
- Corrections are independently checked and only exposed on request. Some
  errors have no offered correction because the cause/intended operation is unclear.
- step_id, revision, context_revision, and input_fingerprint bind each response
  to submitted inputs. The API does not store sessions, reject old revisions,
  or automatically invalidate a client's saved results. The workspace now handles
  client-side invalidation; persisted laptop sessions remain future work.
