# Math Buddy — Progress Tracker

Updated: October 17, 2026.

## Current Phase

Typed arithmetic/algebra checker and first writing workspace implemented. Actual iPad/Pencil testing and broader recognition evaluation are next.

The original recognition demo/environment is preserved. The workspace now calls its tiny-model configuration through a separate persistent worker. Inspected runtime: PyTorch 2.14.1+cpu, CUDA unavailable. User-reported handwriting samples and live recognition are smoke tests; broad accuracy remains unmeasured.

## Current Goal

Deliver the requested upload/write/check flow with clear test instructions, then verify it on the user's iPad. External AI API/sidebar work is deferred.

## Completed

### Confirmed product scope

- Dedicated local Math Buddy app, used primarily on iPad through the Windows laptop.
- React/TypeScript frontend and Python backend.
- Separate writing areas beneath the question.
- Hint first, correction on request.
- Check step button initially; automatic checking later.
- Continuing after errors with a visible warning.
- Free-first approach with a $10 total ceiling.
- Staged first-grade-through-basic-Calculus-I objective.
- Six context files rewritten for Math Buddy; protected MATH_BUDDY_PLAN.md retained unchanged.

### Recognition smoke test

- Screenshot evidence showed a handwritten integral recognized correctly.
- User reported that several other equation combinations were recognized correctly.
- This is smoke-test evidence, not a numerical recognition benchmark.

### Typed checker milestone

- Isolated .checker-venv created with Python 3.10.11; the recognition .venv was not changed.
- Restricted parser implements bounded exact arithmetic, affine expressions, and real one-variable linear equations.
- Alternative valid methods, skipped steps, identities, and contradictions are checked through exact values/solution sets.
- Unsupported/incomplete/unclear input remains explicit; variable denominators and nonlinear work are not silently simplified away.
- Hints appear first; supported correction candidates are independently checked and exposed only on request.
- Earlier supplied mistakes remain warnings even when the newest transition is locally valid.
- Stateless contracts include step/context revisions and an input fingerprint.
- Restricted LaTeX adapter accepts supported fractions/grouping/spacing/operations from manually pasted recognition output.
- CLI supports interactive, one-command, history, correction, JSON, and LaTeX modes.
- FastAPI exposes health and check-step endpoints plus a locally bundled browser API explorer.
- 86 automated unittest tests passed, including API/CLI, image validation, recognition boundaries/cleanup, and observed OCR-LaTeX cases.
- Dependency consistency and Python compilation checks passed.
- Live browser testing verified hint-first feedback, explicitly requested correction, and a supported OCR-LaTeX fraction check.
- Testing instructions and manual examples are in [CHECKER_TESTING.md](../CHECKER_TESTING.md).
- A screenshot of the live browser result is saved under artifacts/checker-browser.png.

### First writing workspace

- React/TypeScript/Vite app with locally bundled KaTeX/fonts and Lucide icons.
- Uploaded question image, selectable recognition region, editable reading, and question confirmation.
- Separate numbered writing areas, pen, whole-stroke eraser, undo, and typed fallback.
- User confirmed Apple Pencil input with finger scrolling; optional finger drawing toggle included.
- Manual Check step reads ink, requests reading confirmation, then calls the exact checker.
- Hint-first feedback, requested corrections, and adding another step despite a warning.
- Ordered prior history supplied on checks; question/variable/earlier edits invalidate dependent feedback and stale replies are discarded.
- One IndexedDB browser/device draft retains image/ink/math; restored mathematical feedback is cleared for rechecking.
- One isolated model worker, bounded uploads/queue/response time, and offline local inference. Original .venv/vendor files were not modified.
- 18 frontend state/ink/input-routing tests passed; strict TypeScript/build and npm audit passed (zero reported vulnerabilities).
- Live desktop browser verified upload/selected-region recognition, typed valid/invalid transitions, correction on request, misread-ink editing before checking, earlier-edit invalidation/history warnings, eraser/undo, and draft restoration with all eight test strokes retained.
- At a 600px browser viewport, page content fit without horizontal overflow. This is not actual iPad verification.
- A clean question image was recognized as 3 [ \\mathrm { x } + 2 ] = 1 5; bounded adapter support was added and tested. Rough angular mouse symbols were misread; confirmation/editing is essential and no recognition-accuracy claim is made.
- WORKSPACE_TESTING.md documents startup, browser/iPad/manual tests, and limitations; start-mathbuddy.ps1 is the optional launcher.
- Saved browser evidence: artifacts/workspace-verified.jpg.

Laptop session saving/sync, installation, automatic checking, and wider curriculum support remain unimplemented.

## In Progress

Writing workspace is ready for user device testing. Actual iPad/Pencil and LAN access remain unverified; see WORKSPACE_TESTING.md.

## Fixes

- Removed unrelated template scope and completion claims.
- Implemented a separate checker environment to preserve the working recognition setup.
- Locally vendored compatible API explorer assets; browser testing needs no CDN.
- API tests use HTTPX ASGITransport directly, avoiding the installed framework's deprecated TestClient/HTTPX integration.
- Clarified that the CLI variable prompt expects a letter; invalid entries now prompt again immediately without losing the original problem. Default x and quitting during a retry are regression tested.
- No fix was made to the recognition demo's non-blocking display warning.

## Next Up

| Milestone | Status | Completion evidence / next action |
|---|---|---|
| Recognition setup | Integrated tiny model on CPU | Complete recognition dependency lock/benchmark remains pending |
| Recognition benchmark | Initial smoke test only | Record samples and measured delay |
| Typed checker and image API | Implemented | 86 backend tests passed |
| Hints and requested corrections | Implemented for supported cases | Unit/API/CLI tests and live browser check |
| OCR text adapter | Implemented subset | Fractions/grouping/operations tested; manual paste supported |
| Writing workspace | Implemented, desktop verified | Actual iPad/Pencil test pending |
| Manual image recognition integration | Implemented | Live question and ink readings with confirmation/editing |
| Client stale-result handling/draft recovery | Implemented | 18 frontend tests and browser checks |
| Laptop session saving/sync | Not started | SQLite/files and cross-device recovery remain planned |
| Local HTTPS/Home Screen app | Not started | Actual iPad installation and device verification |
| Further curriculum groups | Not started | Topic-specific rules and evaluation |
| Automatic checking | Later, not started | Pause/completeness behavior |

## Open Questions

No unanswered core step-area, hint, manual-check, or continuation decision remains.

Still to establish:

- Actual Pencil/palm/scrolling/rotation behavior on the iPad.
- Recognition performance/coverage and a reproducible recognition environment record.
- Laptop session schema and persistence.
- Numerical quality targets based on measurements.
- Rules for additional curriculum groups.

Typed API names, contracts, grammar bounds, test runner, and checker dependencies are now selected and documented.

## Architecture Decisions

- .checker-venv is independent of the recognition demo's .venv.
- Exact SymPy rationals and bounded affine solution sets; no eval-based string parsing.
- POST /api/check-step is stateless; history must be supplied on each request.
- API revision metadata and client premise snapshots now support stale-reply rejection and dependent-feedback invalidation; no server-side session invalidation is claimed.
- Supported OCR-LaTeX translates into the same restricted grammar; arbitrary TeX is not executed.
- Default binding is laptop loopback; an explicit LAN binding is available for optional iPad API testing.
- All runtime assets for the API explorer are local.
- New direct user decisions govern alternatives in the retained protected plan.

## Session Notes

- October 15, 2026: User authorized implementation of the checker and requested different ways to test it, with writing-workspace planning afterward.
- Implemented and verified the typed checker milestone. No paid services were used.
- Original plan content was preserved; the recognition environment and third-party demo were not edited.
- Actual iPad testing of this new checker is not claimed; the browser explorer was verified on the desktop.
- User deferred the external AI API/sidebar and requested focusing on upload, separate writing areas, and manual checks. Those boundaries are now integrated; actual iPad behavior still needs testing.


### October 17, 2026 — Reference-based interface update

- Implemented the user-provided navy/purple/mint visual style, question sidebar, separate writing boxes, and right-side check buttons. Narrow screens stack the question above the work.
- Kept upload/crop, question editing, typed fallback, pen/eraser/undo, reading confirmation, warning continuation, correction-on-request, and browser draft handling. Confirmed readings collapse; new readings open for review.
- Built the frontend successfully with strict TypeScript checking; all 18 existing frontend tests passed.
- Live browser verification: typed correct/incorrect steps, hint and requested correction, recovery after fixing an equation, adding boxes, seven mouse-drawn strokes, clear/undo recovery, recognition and editable confirmation, and a verified handwritten result. The model read X = 4; the reading was corrected to x=4 before checking.
- Checked desktop, 768px iPad portrait, 390px phone, and 320px narrow widths; no horizontal document overflow or browser console errors observed. These browser checks do not establish actual Pencil/palm behavior.
- Preview: artifacts/workspace-redesign.jpg. Tests used a separate localhost:8001 draft origin, preserving existing 127.0.0.1 drafts.
- The user reports the existing application works. The redesigned interface still needs a real iPad/Pencil check. Backend, recognition model, dependencies, and the protected plan were unchanged.


### October 17, 2026 — Gemini on every workspace check

- User authorized Gemini for simple and advanced problems, superseding earlier external-API deferral. Added a local ignored `.env` with an empty key field and configurable model, blank `.env.example`, server-only dotenv settings, and setup documentation.
- Added asynchronous Gemini REST calls using pinned runtime HTTPX and python-dotenv; image preprocessing/limits, bounded structured Pydantic responses, safe error mapping, and server-owned revision metadata. API keys are sent in headers only and never returned by status endpoints or included in prompts.
- Default `/api/recognize` and `/api/check-step` always use Gemini. Preserved original offline tools at explicit `/api/local/` routes and the CLI; no automatic local fallback. Question reading preserves task instructions; confirmed readings remain editable and authoritative.
- Added Gemini attribution, cautious positive wording, setup notice, advanced-task presentation, cloud data-flow notice, and suggested-correction wording. Draft/ink recovery, reading confirmation, and stale-result protection remain in place.
- Automated verification: 102 backend tests and 22 frontend tests pass; strict TypeScript/Vite build succeeds; pip check reports no broken dependencies. Gemini HTTP traffic is mocked in automated tests, covering easy/hard requests, image reads, history, opt-in corrections, earlier-error guards, missing keys, quotas, malformed/blocked outputs, and credential redaction.
- Browser verification on the isolated localhost:8001 draft: restored writing, calculus task entry/confirmation, typed checking, setup notice, and actionable missing-key failure with work preserved. Preview: artifacts/gemini-setup-needed.jpg.
- Live Gemini accuracy/model access is NOT verified: GEMINI_API_KEY remained empty during this implementation. Real Google calls and actual iPad/Pencil checks require the user's configured key/device. The existing user server on port 8000 was left running; restart it to load backend changes.
