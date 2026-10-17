# Math Buddy — Project Overview

## Current Gemini decision — October 17, 2026

The user explicitly selected the Gemini API hackathon track and authorized Gemini
for **all** submitted workspace steps, easy and hard, despite additional requests.
This supersedes earlier local-only inference/API-deferral decisions below.
The current default `/api/check-step` and `/api/recognize` use Gemini exclusively;
there is no automatic local fallback. `.env` stores the server-only API key,
`.env.example` is the blank template, and `GEMINI_SETUP.md` documents setup.
The legacy exact checker/recognizer remain at explicit `/api/local/` endpoints
and the CLI. The recognition environment and protected plan remain unchanged.

Handwriting is read, reviewed/edited by the student, then checked as confirmed
text against the question/task and full earlier history. Gemini returns bounded,
validated structured output. UI results are labelled Reviewed by Gemini; positive
AI assessments are not symbolic proofs. Hints come before corrections, earlier
errors retain warnings, and uncertain work must not receive a green verdict.
The key remains server-side; selected images/math are sent to Google. Browser
drafts remain device/origin-specific. Internet and the key’s Google quota apply.
No chat/voice sidebar, account system, paid subscription, or billing configuration
was added. Existing keyless servers must restart to load the changed backend.


Updated: October 17, 2026.
Status: typed checker and first writing workspace implemented; actual iPad testing and laptop session saving remain pending.

## Implemented Milestone

The local arithmetic/affine/linear-equation checker has a CLI, FastAPI endpoint, hints, requested corrections, and earlier-work warnings. The React/TypeScript workspace now connects question upload/selection, local recognition, editable readings, separate writing areas, pen/whole-stroke eraser/undo, typed fallback, and manual checks. Apple Pencil writing with finger scrolling is the confirmed default; finger drawing is optional. See [WORKSPACE_TESTING.md](../WORKSPACE_TESTING.md) and [CHECKER_TESTING.md](../CHECKER_TESTING.md).

One browser/device draft is recovered through IndexedDB. This does not mean laptop session saving/sync, all curriculum groups, automatic checking, installation, or actual iPad behavior are complete. An external AI tutoring sidebar was discussed and explicitly deferred. The sections below describe the agreed broader product scope.

## Overview

Math Buddy is a personal, local math-work assistant. The user opens Math Buddy, uploads a screenshot of a question, and writes solution steps in separate areas beneath it. Math Buddy checks submitted steps and displays feedback in the same workspace so mistakes can be noticed before they propagate.

Develop on Windows. Use the app on an iPad through its own installable web-app workspace, with Windows browser access also available. The laptop runs the recognition and mathematical checking over the home network.

This file records requirements confirmed in the conversation. Technical implementation proposals and unverified capabilities are identified as such in the architecture and issue files.

## Goals

1. Keep the problem, handwriting, checking, and feedback inside Math Buddy.
2. Recognize handwritten mathematical steps, with editable recognition when needed.
3. Check the validity of each submitted step, accepting different legitimate methods.
4. Explain a detected mistake with a short hint first.
5. Reveal a correction only when requested and supported by the checker.
6. Preserve work and reopen local sessions.
7. Expand support from first-grade math through basic Calculus I in tested groups.
8. Aim for $0 using existing hardware; stay within a $10 total ceiling for any necessary optional spending.

## Core User Flow

1. Start the local application on the Windows laptop.
2. Open Math Buddy on the iPad or in the laptop browser.
3. Create a session and upload a screenshot/photo, or type a problem.
4. Crop to one question and confirm or correct its recognized math and instructions.
5. Write a step in its own area below the question.
6. Select Check step.
7. View the interpreted equation and feedback beside the original writing.
8. Correct a reading error or the math; request a correction if desired.
9. Continue to another step. A flagged mistake remains visible but does not block continuing.
10. Save and later reopen the session.

## Features

### Problem Input and Sessions

- Screenshot/photo upload, cropping to one question, and typed input.
- Preserve the original question image.
- Allow confirmation/editing of the recognized equation.
- Initially allow typing or correction of prose that equation recognition cannot read.
- Save and reopen question images, handwritten steps, interpretations, and feedback locally.

### Writing Workspace

- Separate step areas beneath the question — explicitly selected by the user.
- Pen input for the iPad, with finger, mouse, and keyboard alternatives.
- Eraser and undo; retain raw strokes for editing.
- Keep the question visible in the solving workspace.
- Show pending checks and preserve writing during connection failures.
- Flagged errors do not lock the user out of adding another step.

### Step Checking

- First usable version: explicit Check step button — explicitly accepted by the user.
- Later: automatic checking after a writing pause, subject to pen-up/completeness handling and evaluation.
- Distinguish verified math, an actual issue, unclear recognition, unfinished writing, and unsupported/unresolved checking.
- Track problem instructions, relevant domains, restrictions, prior validated work, and revisions.
- Accept valid alternative paths and skipped intermediate steps where verification supports them.
- Do not confuse inefficient progress with an incorrect transformation.

### Hints and Corrections

- Default: a short hint — explicitly selected by the user.
- Provide the correction on request, rather than reveal it automatically.
- Only provide a specific correction when supported by the checker.
- Recognition clarification is different from a math correction.
- When the system cannot establish the result, communicate uncertainty instead of inventing an explanation.
- An external AI tutoring sidebar with requested worked solutions is deferred; no API/key integration is part of this milestone.

### Local Application and Installation

- React/TypeScript interface with a Python backend; the user confirmed retaining Python.
- App icon and standalone web-app window on iPad are planned.
- Local session storage on the Windows laptop.
- Local HTTPS and a Windows launcher are planned conveniences.
- Laptop stays on and reachable while the iPad uses the checker.
- After initial downloads, ordinary checking is intended to operate without external services, with local networking still required.

## Scope

### In Scope

- Personal local use on existing Windows/iPad hardware.
- Dedicated Math Buddy workspace with uploaded question and separate handwritten steps.
- Editable equation recognition, mathematical verification, hint-first feedback, and correction on request.
- Manual checking first and automatic checking later.
- Visible warnings with permission to continue.
- Local session saving, recovery, and revision-aware rechecking.
- Staged first-grade-through-basic-Calculus-I coverage.

### Staged Coverage

| Group | Intended coverage | Requirement |
|---|---|---|
| Initial | Written arithmetic, fractions, linear equations, basic simplification | Exact arithmetic and justified transformations |
| Elementary methods | Carrying/borrowing, column work, long division | Preserve layout and intermediate marks |
| Algebra/precalculus | Factoring, quadratics, inequalities, radicals, basic trig | Track domains and lost/extra solutions |
| Basic Calculus I | Common limits, derivative rules, tangent lines, simple integrals | Operation-aware checking |
| Further development | Word-problem reasoning, graphs, geometry, counting drawings | Separate representations and evaluation |

The curriculum is an objective, not a claim of current support. Equation recognition alone does not validate all elementary pictures, graphs, or prose.

### Outside the Current Scope

- Public hosting, paid subscriptions, billing, accounts, and real-time collaboration.
- Continuous surveillance of external note-taking applications.
- Native App Store distribution as a requirement.
- A compulsory correction gate before continuing.
- Mandatory paid AI APIs or model training.
- A promise that all grade levels or all handwriting styles work in the first prototype.

## Success Criteria

1. A complete session happens inside Math Buddy: upload, write, check, correct, and continue.
2. Separate step areas and hint-first/correction-on-request behavior match the user's choices.
3. A deliberate supported mathematical error is detected without treating misread handwriting as a proven error.
4. The user can continue after a warning.
5. Work can be saved and reopened locally.
6. Edits cannot leave outdated feedback presented as current.
7. Recognition and checking quality are measured separately on actual handwriting and typed equivalents.
8. The chosen stack stays local and within the agreed budget.

No numerical accuracy or latency target has been agreed or achieved yet. Establish those from the feasibility test rather than fabricate measurements.

## Related Context

- [Architecture](<architecture-context (1).md>)
- [Code standards](<code-standards (2).md>)
- [Development workflow](<ai-workflow-rules (2).md>)
- [Progress](<progress-tracker (2).md>)
- [Issues and unknowns](current-issues.md)
- [Existing plan](MATH_BUDDY_PLAN.md) — protected from modification in this task.
