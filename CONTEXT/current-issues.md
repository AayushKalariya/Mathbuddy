# Math Buddy — Current Issues and Unknowns

Updated: October 15, 2026.
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
