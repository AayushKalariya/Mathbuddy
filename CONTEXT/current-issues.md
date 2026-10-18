# Math Buddy — Current Issues and Unknowns

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
Status: first writing workspace and manual image recognition integrated; actual iPad testing and laptop session persistence pending.

## Confirmed Runtime Issues

All 86 backend and 18 frontend tests passed, plus the strict frontend build. This is evidence for the tested subset, not universal mathematical correctness or recognition accuracy.

Live recognition correctly read the clean test question with presentation formatting. Rough angular mouse-drawn symbols were misread as other math symbols. The workspace requires an editable reading confirmation before a handwriting verdict; a representative handwriting benchmark and actual iPad test remain needed.

The user entered 3 at the CLI variable prompt, which expects the letter x. The
prompt now explains this and retries invalid variable input immediately while
retaining the original problem. Existing CLI processes must be restarted to load
the improvement.

The recognition-demo screenshot showed a non-blocking display compatibility warning about use_column_width. That third-party demo was not edited in this milestone.

## Implemented Scope and Limits

- Exact arithmetic, affine expression rewrites, and one-variable linear equations over the reals.
- Restricted OCR-LaTeX adapter for manually pasted model output.
- Short hints and supported, independently checked corrections only on request.
- Visible warnings when supplied earlier work contains a mistake.
- CLI, stateless API, and offline local API explorer.
- Bound expression/request sizes; malformed and unsupported input do not receive fabricated verdicts.
- Manual local image recognition, writing UI, confirmation, stale-result handling, and browser/device draft recovery are implemented.
- Laptop saved sessions/sync, installable app mode, automatic checking, external AI tutoring, and calculus checking are not implemented.

## Known Limitations

| ID | Limitation | Next action |
|---|---|---|
| L1 | Broader recognition accuracy/latency is unmeasured; rough mouse symbols were misread | Benchmark actual Pencil samples. Current tiny-model setup runs on CPU, CUDA unavailable |
| L2 | Image readings need explicit review/confirmation; prose/general LaTeX are unsupported | Edit misread equations or use typed fallback |
| L3 | Variable denominators, nonlinear equations, inequalities, calculus, graphs, and prose are unsupported | Add separate verified topic rules in later milestones |
| L4 | API is stateless and cannot remember omitted earlier lines | Future session service must supply relevant history |
| L5 | Browser draft recovery and stale handling exist, but laptop session persistence/sync do not | Implement SQLite/files as a separate unit |
| L6 | Unknown error causes may have no offered correction | Keep a broad hint; add diagnostic rules only with evidence |
| L7 | Actual iPad/Pencil/palm/scrolling/rotation and LAN use remain unverified | Test the documented workspace LAN mode; desktop responsive check passed |
| L8 | Laptop sleep/network loss prevents new checks | Workspace preserves ink, shows errors/connection state, and keeps one browser draft; verify actual interruption behavior on-device |
| L9 | Single-browser draft does not sync and replaces the prior draft on New question | Wait for saved indicator; use same browser/device/origin; laptop saved sessions remain future work |

An integral may be recognized by the demo while remaining unsupported by the mathematical checker. Reading notation and verifying its mathematics are different capabilities.

## Decisions Confirmed

- Separate step areas below the question.
- Hint first; correction on request.
- Manual Check step first; automatic checking later.
- Allow continuing with a visible warning.
- Python backend/specialist tools, React/TypeScript frontend.
- Personal local use, free-first, $10 total ceiling.

## Details Not Yet Selected

- Actual device interaction refinements, based on iPad testing.
- Laptop session storage schema and full recognition dependency lock.
- Numerical recognition/latency quality targets.
- Additional supported topic/notation groups.

Checker/frontend dependency locks, API contracts, upload limits, one-worker inference bounds, and test runners are selected and documented. Existing recognition dependencies are preserved.

## Constraints

- Laptop must remain awake/reachable for iPad checking.
- Initial dependency/model downloads need internet; checker operation and its local explorer do not.
- Full curriculum coverage is a staged objective.
- A locally valid step after an earlier error must not imply that the overall work is correct.
- A correction is never invented when the checker cannot justify it.
- MATH_BUDDY_PLAN.md remains excluded from modification.

## Next Unit

Test upload/write/check on the user's iPad using WORKSPACE_TESTING.md. Address measured device/recognition issues before expanding scope.

Continue the recognition benchmark separately. No paid fallback is selected.

Manual and automated test instructions: [CHECKER_TESTING.md](../CHECKER_TESTING.md).


## Progressive hints — October 17, 2026

The static guidance button has been replaced by on-demand Gemini hints. Hints
are cached in the current tab only; reloading does not restore hint progression.
A live test initially encountered a transient provider-unavailable response;
a later real request succeeded, and the live calculus flow completed concept,
stronger hint, and explicitly requested suggested-line stages. API failure/retry
and stale-response behavior are tested separately with simulated responses.
General hint quality/answer-leak avoidance remains model-dependent and needs
broader evaluation; structured output and instructions are not a proof of pedagogy.
Actual iPad/Pencil behavior still requires a device check.

## Shared toolbar and automatic boxes — October 17, 2026

The latest user choice replaces manual next-box creation. One sticky toolbar
controls the selected step's input mode, pen, eraser, undo, clear, and optional
finger drawing. Undo histories are separate per box and remain in memory only.
One blank box opens after the last box receives a current verified assessment
with a valid transition and consistent context. Issues and failures do not add
boxes; existing draft boxes remain available. The existing 34-box limit remains.

Verified with 54 frontend tests, 114 backend tests, a production build, and
browser checks at laptop, 768px tablet, and 390px phone widths. Simulated-provider
UI tests covered error/issue/no-duplicate behavior, reading before checking,
per-box eraser/undo/clear, selection, and draft recovery. A real Gemini review of
3x=12 from 3x+8=20 succeeded and automatically opened Step 2. Preview:
artifacts/seamless-workspace.jpg. Real Pencil/palm/rotation testing remains open.

## Minimal workspace — October 17, 2026

The latest reference replaces the blue/yellow sidebar layout with a near-black
single-column workspace, compact question header, charcoal cards, and circular
gray/green check buttons. Shared tools are icons with accessible labels/titles;
Pen and the keyboard icon switch the selected step's input mode. Hints open
inline from the small Hint action. Successful feedback is one line with review
details on demand; warnings, errors, and stale work remain visible. Typed math
now shows once and opens for editing when selected.

Verified with 54 frontend tests, the production build, and an isolated simulated
provider in the browser. Checks covered editing/rechecking, auto-added boxes,
corrections, progressive hints, handwriting confirmation without grading,
eraser/undo/clear, finger-drawing toggling, and saved draft recovery. Desktop,
768px iPad portrait, and 390px phone layouts had no horizontal overflow. No new
live Gemini accuracy or physical iPad/Pencil claims are made for this UI update.
Preview: artifacts/minimal-workspace.jpg.

## Final-answer completion — October 17, 2026

The existing Gemini step review now includes a required boolean is_final_answer
against the original task and full history. Completion is suppressed unless the
result is verified, valid, consistent, and warning-free. Intermediate correct
steps continue opening a box; final answers show Question complete instead.
Only untouched trailing empty boxes are removed from older drafts. Later edits,
writing, and undo history are retained. Editing premises invalidates completion;
saved drafts keep content but require fresh checks, as before.

Restart the running Python server, refresh, and recheck an existing final step.
The frontend reports an actionable restart message for an older backend without
the new field. No extra completion API request, automatic reading, or checking
was introduced. The explicit local checker defaults completion to false.

Verification: 117 backend tests, 70 frontend tests, production build, and isolated
browser tests for typed/handwritten completion, intermediate continuation,
wrong answers, final rechecks, edit/reopen, and unused-box cleanup. Four live
Gemini checks correctly classified an intermediate algebra line, a final algebra
answer, a complete chain-rule derivative, and an incomplete real root set.
These are smoke tests, not a general mathematical accuracy guarantee. Preview:
artifacts/question-complete.jpg. Actual Pencil/device checks remain open.

## No unsolicited hints — October 17, 2026

Removed automatic rendering of check-response hints. All assessment explanations
are under Details; ordinary checks show verdicts and important warnings. Gemini
review instructions now require hint=null and forbid next-operation guidance in
messages/warnings, and the backend strips the hint field even if the model
supplies one. The separate progressive Hint action and requested corrections remain.

Verification: 118 backend tests, 70 frontend tests, and the production build pass.
Two live Gemini checks (3x=15 and 3x=14 for 3x+1=16) returned no hints. Isolated
browser tests deliberately injected legacy guidance in both hint/message fields:
none was visible automatically after correct or incorrect checks; guidance appeared
when Hint was clicked, and explicit corrections still worked. Preview:
artifacts/hints-on-request.jpg. Refresh the app; restart the running Python server
to load the updated review instructions and server-side hint suppression.

## Automatic handwriting reading — October 18, 2026

After the question is confirmed, new handwriting/eraser/undo changes are read
after 2.5 seconds of idle time. Further writing resets the timer; pen-down holds
block reading. Automatic, Check-button, Hint-panel, and Read again step-image
reads share one lane per tab, combining pending edits and rejecting stale
replies. Matching ink reuses its current in-tab reading, including text edits.
Reading does not grade, mark completion, add boxes, or request hints. Failures
remain visible with manual retry; no retry loop or draft-restore calls occur.
Frequent pauses can still use quota; there is no additional throttle.

Verification: 83 frontend tests and the production build passed. An isolated
simulated-provider browser session verified automatic reading, serialized reads
with edits during an 8-second request, preservation of text edits during a late
reply, rate-limit/retry recovery, and explicit confirmation/checking. Metrics
showed at most one active image request and zero reviews until the check button
was pressed. No new live Gemini accuracy or physical iPad claims are made.
Preview: artifacts/automatic-reading.jpg. Refresh the browser to load this
frontend update; the user's running server and port-8000 draft were preserved.

## Local GPU Q4 OCR and cheaper Gemini review — October 18, 2026

The user requested GLM-OCR transcription on the laptop GPU, then explicitly
required 4-bit operation after reporting computer instability. Ollama and its
unfinished full-precision download were stopped. No full-precision model is
used. The installed setup uses a dedicated pinned llama.cpp Vulkan worker on
the NVIDIA RTX 4050 (6 GB): decoder Q4_K_M and vision Q4_1. GGUF precision is
checked before launch; weights/runtime downloads are SHA-256 verified. No CPU
or cloud OCR fallback, no extra local model, no large PyTorch installation.

Bounded resources: 2048 context, one slot, 512 image-token cap, bounded raster,
small batches, no large warm-up, 2.3 GB free-VRAM preflight, a 3 GB Windows RAM
job limit, and 60-second idle unloading. The Windows job kills the worker when
the app exits. An initial runtime warm-up tried a large vision workspace; the
worker was stopped, image tokens were bounded, and subsequent tests succeeded.
All 18 decoder layers and the CLIP encoder used Vulkan0, the NVIDIA GPU. Real
OCR used approximately 1.7–1.9 GB total GPU memory including the desktop, with
about 532 MB worker RAM in the final sample.

Google rejected the requested gemini-2.5-flash-lite as unavailable to new users
of this key. The user explicitly chose gemini-3.5-flash-lite. The server-only
.env and default settings now select that model; the key was preserved. Live
algebra and calculus reviews succeeded. All image routes used by the interface
now go to local GLM-OCR; checks and hints remain Gemini and require confirmation.

Verification: 127 backend and 83 frontend tests, production build, actual GPU
inference, and the browser's 2.5-second automatic read -> edit -> explicit
Gemini check -> next box flow passed. Printed 3x=15 was read; a block-drawn 3
was misread as a Chinese character and corrected in the editable reading before
checking. This is a smoke test, not a handwriting accuracy guarantee. Preview:
artifacts/local-glm-q4.jpg. The existing port-8000 app was restarted with the
new backend, retaining its 127.0.0.1 binding and browser draft. The isolated
port-8002 test server/tab were closed. Setup/recovery: LOCAL_OCR_SETUP.md.

## Incorrect positive on a double-integral step — October 18, 2026

The screenshot displayed integral_0^2 integral_0^1 x^2 y^2 dx dy, followed by
x^2 y^3/3 evaluated from 0 to 1. The user confirmed Details claimed the inner
integration in x was correct with y constant, despite the changed y exponent.
The check route had trusted a single structured Gemini verdict without an
independent calculus comparison. Two fresh live reviews rejected the wrong
step and accepted x^3 y^2/3 at those limits, so the original raw response could
not be reproduced; the existing positive-review trust path was confirmed.

Added explicit integration-variable/bound instructions and a bounded negative-only
polynomial evaluation safeguard. Every request still calls Gemini once. A
contradictory positive on a supported first evaluation of a constant-bounds
rectangular double integral is overridden to issue/invalid, final=false, and no
correction/hint. Exact endpoint/full-integral comparisons allow supported
reordering, rescaled bounds, and equivalent forms. No unrestricted string
parser, eval, general symbolic integration, additional AI call, or GPU is used.
Unsupported notation and later steps remain with Gemini; general mathematical
accuracy is not guaranteed.

Verification: 136 backend and 83 frontend tests pass. An isolated browser test
intentionally supplied the same false AI-positive explanation: the screenshot's
wrong step was rejected, no extra box appeared, and the corrected x-integration
then passed and opened the next box. Console was clean. Preview:
artifacts/integral-false-positive-guard.jpg. The user's running backend/draft
were left intact; restart that backend, refresh, and recheck to load this fix.
