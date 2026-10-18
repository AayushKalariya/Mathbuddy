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


### October 17, 2026 — Blue, teal, and yellow theme

- Applied the latest user-supplied palette: blue page #162556, dark navy cards #060c24, yellow actions #ffb900, and teal reviewed-correct states #00d5be. Replaced purple accents throughout controls, reading/review panels, links, and drawing tools; updated browser theme color and favicon.
- Centralized the palette in CSS custom properties. Preserved all layout and checking/drawing behavior.
- Verification: strict TypeScript/Vite production build passed. Browser checks confirmed sampled colors and no horizontal overflow at desktop and 768px iPad portrait widths; checked a typed step and an empty handwriting box. No new Gemini review requests were needed for this appearance change. Preview: artifacts/workspace-color-theme.jpg.


### October 17, 2026 — On-demand progressive hints

- Removed A little guidance and replaced it with I need a hint: first concept, More help, then an explicit Show one next step action. Added question/selected-step targeting, in-panel reading editing/confirmation, inline math display, earlier-error redirection, cache reopening, and clear retries. Hints never set a mathematical verdict.
- Added bounded HintRequest/HintResult contracts and POST /api/hint through the existing server-only Gemini client. Structured next-step fields are stripped on hint requests and rejected by the frontend if leaked; revealing a line requires level 3 plus explicit consent and two previous hints. Known earlier errors suppress continuation suggestions.
- Hint context includes the original task, variable, full confirmed prior history, current confirmed line and prior hints. Per-target/per-revision caches exist only in the current tab. Editing premises invalidates hints and aborts/ignores stale responses; starting a new question resets hint state.
- Verification: 114 backend tests, 37 frontend tests, and strict TypeScript/Vite build passed. Mocked browser tests covered before-writing help, both hint levels, explicit reveal, no extra request when reopening, selected-step scope, quota/retry, edit-during-request cancellation, and handwriting reading/confirmation with ink preserved and no verdict.
- Live Gemini verification: algebra first hint and all three calculus stages succeeded for differentiating sin(x^2), including a targeted chain-rule hint and an explicitly requested 2x*cos(x^2) line. An initial provider-unavailable error was transient and was reported to the user. These smoke tests do not establish general mathematical or tutoring accuracy.

- Final browser layout check: 768px iPad portrait and 390px phone width had no horizontal overflow. Live first-hint preview saved at artifacts/progressive-hints.jpg. Real iPad/Pencil behavior remains a device test.

### October 17, 2026 — Shared tools and automatic next boxes

- Replaced repeated per-card controls with one sticky top toolbar for the selected step: Write/Type, pen, eraser, undo, clear, and finger drawing. Select by touching/focusing a card or choosing Active step; the selector scrolls that card into view. Undo history stays separate per box, is capped at 50 actions, and is excluded from saved drafts.
- Removed Add next step and its manual reducer action. A current verified check of the last box with valid transition and consistent context appends one blank box, preserves the input mode, selects it, and scrolls it into view. Issues, uncertainty, request failures, stale/duplicate replies, and earlier rechecks do not create boxes. Existing draft work and the 34-box limit are retained. This supersedes the earlier manual warning-only continuation preference.
- Verification: 54 frontend tests, 114 backend tests, and the strict TypeScript/Vite production build passed. Isolated simulated-provider browser tests covered correct/incorrect/error flows, handwriting reading versus checking, separate undo histories, eraser/clear recovery, draft reload, and one toolbar with no add button. Laptop, 768px iPad portrait, and 390px phone layouts had no horizontal overflow; actual iPad/Pencil testing remains open.
- A real Gemini check of 3x=12 for 3x+8=20 returned verified and opened Step 2 automatically. Screenshot: artifacts/seamless-workspace.jpg. Backend behavior and Gemini difficulty routing were unchanged by this layout update.

### October 17, 2026 — Minimal single-column reference

- Replaced the earlier blue/yellow theme and sidebar with a near-black page, a compact question header, one centered column, charcoal cards, and round gray/green check buttons. Removed repeated helper text and default footer copy; moved the checked count beside Show your work and put workspace information behind a small disclosure.
- Reduced the shared toolbar to labeled/title-accessible icons. Pen returns to handwriting, the keyboard icon enables typing, the hand icon toggles finger drawing, and per-box undo/clear remain independent. Existing drafts and automatic next-box behavior are retained.
- Added TypedStep.tsx so typed math renders once when not editing. Selecting the equation opens an input; blur/Enter returns to the preview without making a review request. Correct-step feedback is one short line; Details retains Gemini attribution, explanation, and verification basis. Warnings remain visible and requested corrections render as math.
- Verification: 54 frontend tests and strict TypeScript/Vite production build passed. Simulated-provider browser tests verified typed editing, correct/incorrect reviews, corrections, all hint levels, handwriting reading/confirmation for hints without grading, auto-next/no duplicate boxes, drawing/eraser/undo/clear, finger toggle, and draft recovery. Desktop, 768px tablet, and 390px phone layouts had no horizontal overflow, including a long calculus task and open hints. Browser console was clean.
- Final preview: artifacts/minimal-workspace.jpg. No backend/API/model changes or new live Google requests were needed; physical iPad/Pencil checks remain open.

### October 17, 2026 — Final-answer detection in the existing check

- Added a strict is_final_answer field to the Gemini review schema, instructions for task-aware completion (all roots/branches, domains, complete derivatives, integration constants/bounds), and server normalization that forbids completion for nonverified, inconsistent, unresolved, or warning-bearing results. This uses the existing review request, with no extra provider call or local difficulty routing.
- Added runtime frontend field validation, conflicting-completion rejection, and an actionable restart message for an older running server. Completion is scoped to the last written step; Question complete replaces ordinary success feedback and Complete replaces the checked count. Correct intermediate last steps still append a box; final answers do not.
- Rechecking a final line removes only untouched trailing empty boxes. Later writing/edits/undo history are never discarded. Editing premises clears completion; stale and duplicate replies cannot restore it. Completion feedback is not persisted across draft reloads. Legacy local checking retains a default false completion flag.
- Verification: 117 backend and 70 frontend tests passed, plus the production build. Isolated browser tests covered intermediate continuation, wrong answers, typed and handwriting-confirmed final answers, no extra box on recheck, editing/reopening the flow, and cleanup of an unused box. Console was clean. Preview: artifacts/question-complete.jpg.
- Four live Gemini smoke tests passed: 3x=12 is intermediate for 3x+8=20; x=4 is final; 2x*cos(x^2) completes differentiating sin(x^2); x=2 alone does not complete solving x^2=4 over the reals. These checks do not prove general completion accuracy. Restart the user's running Python server and refresh/recheck to load the new contract; the user's server and draft on port 8000 were left intact.

### October 17, 2026 — Hints only on request

- Removed the automatic result.hint paragraph from step feedback, and moved all assessment explanations under Details. Correctness verdicts and important warnings remain visible. The separate Hint action and explicit Show one correction flow remain available.
- Gemini review instructions now require hint=null and forbid unsolicited next steps, rules to try, corrected equations, or numeric answers in ordinary assessment messages/warnings. The server suppresses review.hint even when the model ignores that instruction. Legacy local checker behavior is unchanged; its hints are also not rendered automatically by the workspace.
- Verification: 118 backend tests, 70 frontend tests, and production build passed. Backend regression tests inject hints into positive, incorrect, and unclear reviews, including correction requests. Isolated browser tests inject legacy hint/message guidance and confirm zero visible automatic guidance after correct/incorrect checks, then show guidance only on Hint and preserve opt-in corrections. Browser console was clean.
- Two live Gemini checks for 3x+1=16 returned no hint: 3x=15 was verified and 3x=14 was flagged as an issue. Preview: artifacts/hints-on-request.jpg. The user's running server and draft on port 8000 were preserved; restart that server to apply the new prompt/response suppression, and refresh to load the updated interface.

### October 18, 2026 — Automatic reading after a 2.5-second pause

- Added a shared step-image scheduler for automatic transcription and all existing manual reads. A pen/eraser gesture must finish before its idle timer starts; continued writing and undo/clear changes restart the timer. New edits replace queued work while one image request runs. Outdated responses never replace newer ink or edited readings.
- Reused matching in-tab readings, including manual corrections. Typed/empty boxes, text-only edits, and draft restoration do not spend automatic requests. Failed reads wait for changed ink or manual retry. Disposal clears timers and aborts the fetch; drawing state and caches are not saved.
- Reading remains separate from mathematical review: no automatic grading, completion, next box, or hint. There is no additional fixed rate throttle; multiple pauses can still consume quota.
- Verification: 83 frontend tests and the production build passed. Simulated browser tests verified automatic reading, single-flight updates with an 8-second provider delay, editable-reading protection, API error/retry, and explicit check completion. Metrics reported max_active=1 and no reviews until the check button was pressed. Browser console was clean. No new live Gemini or physical iPad validation was needed for this frontend change.
- Preview: artifacts/automatic-reading.jpg. Refresh the app to load the built frontend. The existing user server and draft on port 8000 were left intact.

### October 18, 2026 — GLM-OCR on GPU at 4 bits; Flash-Lite math review

- User requested local GLM-OCR and Gemini 2.5 Flash-Lite, then emphasized 4-bit-only GPU operation after computer instability. Stopped Ollama/download activity; installed checksum-verified prequantized Q4_K_M decoder and Q4_1 vision files with a pinned small llama.cpp Vulkan runtime. No BF16 model is loaded and the existing Python model environments remain unchanged.
- Added local OCR routing/status and a managed single-slot NVIDIA worker. Precision guards, free-VRAM checks, 2048 context, 512 image tokens, small batches, disabled large warm-up, a 3 GB Windows RAM job, parent-exit cleanup, and idle unloading limit resource use. No CPU/cloud OCR fallback or additional local model is started. Setup is reproducible with setup-local-ocr.ps1 and LOCAL_OCR_SETUP.md.
- Google's live API rejected 2.5 Flash-Lite as unavailable to new users of this key. The user explicitly selected 3.5 Flash-Lite; updated .env/default/example and preserved the key. Live algebra and calculus reviews succeeded.
- Verification: 127 backend tests, 83 frontend tests, and production build passed. GPU logs confirmed 18/18 decoder layers and CLIP on the RTX 4050; actual OCR used about 1.7–1.9 GB total GPU VRAM and a final 532 MB worker RAM sample. The app's real automatic read/edit/confirm/check flow passed. Printed math was read; a block-drawn digit needed manual correction, so general handwriting accuracy is not claimed.
- Restarted the running port-8000 app with the tested backend, preserving its binding/browser draft. Closed the isolated test server/tab. Preview: artifacts/local-glm-q4.jpg. Refresh the app; the model starts lazily and unloads after 60 idle seconds.
