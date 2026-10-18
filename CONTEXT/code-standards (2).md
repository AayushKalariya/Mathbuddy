# Math Buddy — Code Standards

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
Status: typed backend and first React/TypeScript workspace implemented; remaining standards apply as later units are built.

## General

- Keep recognition, mathematical checking, feedback, storage, and UI responsibilities distinct.
- Implement the confirmed behavior in [project overview](<project-overview (2).md>) and the planned boundaries in [architecture](<architecture-context (1).md>).
- Prefer small changes with meaningful verification.
- Do not invent product behavior, test results, current capabilities, or numerical performance claims.
- Clearly label proposed design choices until selected.
- Use free local dependencies by default. Respect the $10 total ceiling.
- Pin and document dependencies after compatibility testing. Do not assume latest packages work with the model.

These are project-specific engineering conventions, not claims about standards already implemented in the codebase.

## TypeScript and React

- Use TypeScript strict mode and explicit contracts for session, step, revision, and result state.
- Treat API JSON as unknown until validated. Avoid broad any types.
- Separate canvas editing/interaction state from API coordination and mathematical result display.
- Do not run handwriting recognition or authoritative symbolic verification inside display components.
- Clean up pointer listeners, requests, and timers.
- Preserve strokes when a request is pending or fails.
- Use revision-aware responses; an older reply cannot overwrite newer work.
- Share one consistent meaning for result states across all screens.

React/Vite is the selected interface. Next.js-specific server components, routing rules, and middleware are not part of this stack.

## Python

- Use an isolated environment compatible with recognition dependencies.
- Annotate public interfaces and validate API input with Pydantic.
- Keep FastAPI handlers focused on request validation and orchestration.
- Put model loading/preprocessing, checking, feedback, and persistence into their own modules.
- Reuse loaded model assets rather than reloading them for each image.
- Define computation limits and a measured inference execution strategy before handling concurrent work.
- Distinguish dependency errors, recognition failures, unresolved math, and confirmed mathematical issues.
- Do not execute generated Python or arbitrary uploaded content.

The checker was implemented with Python 3.10.11 in .checker-venv. Its exact dependency lock is backend/requirements-lock.txt. Preserve the recognition environment at .venv separately.

## Styling and Writing Interaction

- Optimize the solving workspace for iPad touch/pen use and Windows browser use.
- Keep the compact question header above the step areas in one centered column at every screen width.
- Use one shared icon toolbar for pen, eraser, per-box undo/clear, keyboard entry, and optional finger drawing. Keep circular Check controls beside each box and corrections on request.
- Show status with text/icons as well as color.
- Preserve layout when feedback appears; do not cover active writing with an unsolicited dialog.
- Automatically append one box only after a current, correct intermediate last-step assessment with consistent context. A verified, warning-free final answer to the original task marks completion without another box. Determine completion in the existing Gemini review, preserve existing written/edited boxes, and clear completion after relevant edits.
- Test actual pen, palm, scrolling, and rotation behavior.

The latest minimal reference supersedes the earlier blue/yellow palette and sidebar: near-black background (#09090b), charcoal cards (#18181b), quiet gray controls, and green correct states. Use one centered column, short step labels, a small checked count, and no motivational/helper paragraphs in the default solving view. Successful feedback stays to one line with an optional Details disclosure; warnings and errors remain visible. Typed math displays once and opens for editing on selection. System fonts, Lucide icons, and local KaTeX assets remain in use. Pencil writing with finger scrolling is the default; finger drawing remains optional. Keep handwriting readings editable and require review before a mathematical verdict. No component library is used.

## API

- Validate session/step identifiers, input representations, revisions, and uploaded image types before processing.
- Enforce the selected prototype limits: 32 KiB checker bodies, 8 MiB recognition uploads, 16 megapixels, and a 180-second model-response timeout. These are protective engineering choices, not achieved latency targets.
- Return consistent typed result and failure shapes.
- Distinguish transport failures from mathematical verdicts.
- Use relative /api URLs so iPad requests reach the laptop service through the configured origin/proxy.
- Return and verify the revision/context for every check.
- Do not introduce cloud authentication or paid API calls as incidental implementation details.

## Mathematics and Recognition

- Keep original strokes/images and interpreted math separate.
- Parse a supported mathematical grammar; reject or clarify unsupported syntax.
- Use exact rational/integer operations where the problem requires exact answers.
- Preserve assumptions, denominators, branches, and domain restrictions during simplification.
- Do not judge equations solely by equality of their raw left-minus-right expressions.
- Do not treat numerical sampling as proof.
- Support valid alternative paths and legitimate skipped steps.
- Generate a specific hint or requested correction only from evidence.
- An unclear reading must not be presented as a proven math mistake.

## Data and Storage

- Use SQLite for structured local records and local files for large session artifacts.
- Keep writes/revisions consistent and recover from interrupted saving.
- Do not overwrite original handwriting when recognition is corrected.
- Invalidate dependent results after earlier-step edits.
- Distinguish browser draft state from confirmed laptop persistence.
- Exclude personal sessions, model weights, environment directories, and private TLS keys from ordinary source control.
- Bundle runtime assets locally for ordinary operation without external services.

## Verification

- Test checking rules on correct and incorrect transitions, alternative methods, restrictions, and unsupported inputs.
- Test recognition separately against expected interpretations of actual handwriting.
- Verify stale-response handling, editing earlier steps, saving/reopening, and network interruptions.
- Test the real iPad and Windows browser, not just a desktop screenshot.
- Verify hint-first feedback and correction-on-request behavior.
- Do not mark an untested feature as complete.

The backend test runner is unittest, with HTTPX ASGITransport for API tests and subprocess CLI tests. Run python -m unittest discover -s backend/tests -v in .checker-venv. Frontend state/revision tests use Vitest; npm run build performs strict TypeScript checking and Vite bundling. Source was formatted with Prettier. No separate lint setup is selected.

## File Organization

The architecture file contains the proposed source layout. Name modules after their responsibilities and keep mathematical code out of UI components. Preserve the existing context filenames unless the user requests renaming.


On-demand hints replace static guidance. Hinting must remain separate from grading: first a concept, then more specific guidance, then a suggested line only on explicit request. Confirm unread ink before step-specific help. Cache displayed hints per target and premise revision in the open tab; clear stale context and reject old replies. Keep the question/selected-step target explicit, and retain earlier-error warnings.

Step checking must not automatically display hints or next-step guidance. Gemini
review hints are suppressed server-side and ignored by the feedback view. Normal
feedback shows the verdict and important warnings, with assessment explanations
under Details. Tutoring guidance and corrected lines require an explicit Hint or
correction request. Keep next-operation suggestions out of ordinary review messages.
