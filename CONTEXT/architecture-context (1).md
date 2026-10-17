# Math Buddy — Architecture Context

Updated: October 15, 2026.
Status: typed checker, first React writing workspace, local recognition adapter, and browser draft recovery implemented. Laptop session storage and installation remain planned.

## Implemented Checker Boundary

- backend/checking/ contains a restricted parser, a supported OCR-LaTeX text adapter, and exact arithmetic/affine/real-linear equation checks.
- backend/feedback/ supplies short hints and independently verified correction candidates on explicit request.
- backend/models.py defines strict CheckRequest/CheckResult contracts.
- backend/cli.py supports interactive, one-command, history, correction, and JSON modes.
- backend/app.py exposes GET /api/health, POST /api/check-step, /openapi.json, and a local /docs explorer.
- backend/static/swagger/ vendors Swagger UI 5.33.3 and its license; explorer assets need no CDN.
- backend/tests/ uses unittest and HTTPX ASGITransport. Runtime/development pins and a complete tested dependency lock are in backend/requirements*.txt.
- .checker-venv is separate from the recognition demo's .venv, which was not modified.
- start-checker.ps1 is an optional local API launcher; direct Python commands also work.

The checker accepts math text and restricted OCR-LaTeX. A separate image endpoint now supplies proposed readings for confirmation; recognition is not itself a mathematical verdict. The built React app is served at /, with its locally bundled assets at /assets and API explorer at /docs.

## Implemented Workspace Boundary

- frontend/src/App.tsx coordinates question upload/selection, reading confirmation, independent step cards, feedback, and continuation.
- DrawingPad.tsx and ink.ts retain logical stroke coordinates, use Pointer Events/perfect-freehand, erase whole strokes, support undo, and rasterize clean images without the display grid.
- Writing surfaces disable native panning to prevent pen-stroke cancellation. With finger drawing off, one-finger drags explicitly scroll the page; additional contacts during an active stroke are ignored. Native inertia/actual Pencil palm behavior is not claimed and needs on-device testing.
- state.ts binds each response to a request token, step revision, and a snapshot of the question/variable/all preceding steps. Edits invalidate that step and later feedback. Full ordered history accompanies checks.
- api.ts validates response shapes and keeps transport/recognition errors separate from mathematical verdicts.
- draft.ts stores one draft in browser IndexedDB. Restoring keeps images/ink/math and clears old feedback. This is not laptop session persistence or cross-device sync.
- backend/recognition/service.py validates raw raster bodies, EXIF orientation, alpha, whitespace crops, and image limits. One persistent subprocess in .venv loads the model lazily; no vendor files or recognition dependencies were changed.
- worker.py runs the existing demo configuration from tools/UniMERNet with offline model loading, eval/inference mode, JSON-lines communication, stderr diagnostics, and Windows parent-exit cleanup.
- One inference at a time; overlapping requests return a retryable 429. Response timeout is 180 seconds. A failed/cancelled worker is discarded. Ordinary checker requests remain separate.
- Input limits: PNG/JPEG/WebP, 8 MiB/body, 16 megapixels; clean crops downsize to at most 2400 by 1600. These are prototype bounds, not performance claims.
- start-mathbuddy.ps1 optionally builds assets and starts FastAPI; start-checker.ps1 remains available.
- Actual inspected setup: .venv Python 3.10, PyTorch 2.14.1+cpu, CUDA unavailable; tiny model/config/tokenizer files present. Broader recognition accuracy remains unmeasured.

## Stack

| Layer | Technology | Planned role |
|---|---|---|
| Frontend | React + TypeScript + Vite | Dedicated Math Buddy interface |
| Writing | Canvas + Pointer Events + perfect-freehand | Capture and render editable strokes |
| Math display | KaTeX | Render recognized expressions and feedback |
| App installation | Web manifest and service worker | Icon, standalone workspace, cached UI assets |
| Backend | Python + FastAPI + Pydantic | Local API and orchestration |
| Recognition | UniMERNet-tiny + PyTorch | First free model to evaluate |
| Math verification | SymPy + custom topic rules | Parsed-math and transformation checking |
| Feedback | Hint/correction templates | Evidence-based explanations without a required LLM |
| Metadata | SQLite | Sessions, interpretations, revisions, and results |
| Large local artifacts | Local files | Question images, strokes, and optional step crops |
| Local HTTPS | mkcert and server TLS | Trusted local iPad connection |
| Startup | Windows PowerShell launcher | Start the app and show its LAN URL |

UniMERNet-tiny is integrated as the initial local recognizer. User handwriting smoke tests and live image recognition have been observed, but a representative accuracy benchmark is pending. Texo/pix2tex remain alternatives. The external AI sidebar/API is deferred.

Checker/image-validation dependencies are in backend/requirements-lock.txt; frontend dependencies in frontend/package-lock.json. The existing recognition environment is preserved; its complete reproducible dependency lock and the laptop database schema remain pending.

## System Boundaries

Organization below mixes implemented checker modules and planned application modules; the implemented boundary is listed above:

- frontend/: screens, writing areas, editing state, display, connection status, and optional unsent drafts.
- backend/app.py: local API and serving the built frontend.
- backend/recognition/: image preprocessing, model loading, recognition, and interpretation metadata.
- backend/checking/: restricted math parsing, domains, arithmetic/algebra/calculus rules, and verification evidence.
- backend/feedback/: short hint and requested-correction generation from checker evidence.
- backend/storage/: session persistence and revisions.
- models/: downloaded model/tokenizer assets, loaded locally.
- data/: SQLite database and personal session artifacts.
- sample_work/: real handwriting and expected interpretations for evaluation.
- certs/: local certificate material, excluded from version control.

Checker, recognition, and frontend modules now exist. backend/storage, SQLite schemas, data/models/certs setup, service worker, and manifest remain proposals.

## Local Runtime

During development, Vite can expose the interface on the LAN and proxy relative /api requests to FastAPI on the laptop. The iPad must use the laptop's LAN address, not its own localhost.

For daily use, build the frontend and serve its assets plus the API from the same FastAPI origin over trusted local HTTPS. Add the Math Buddy icon through iPad Safari.

The laptop must remain awake and reachable. Cached UI assets do not perform recognition or verification when the backend is unavailable. Bundle model files, scripts, fonts, and other assets locally for ordinary use without internet after installation.

Use private-network firewall access for the required port. Router port forwarding and external hosting are not part of this design. Native Windows Python is the first setup; WSL2 is a fallback to evaluate if model dependencies require it.

## Storage Model

- SQLite is intended for structured session and revision records.
- Local files retain the original question image, stroke data, and optional cropped step images.
- Preserve original handwriting separately from its recognized/editable representation.
- Treat confirmed/corrected interpretation as the input to verification; do not silently overwrite the original writing.
- Every result identifies the session, step, and input revision it checked.
- Editing an earlier step invalidates results that depend on that step.
- Browser-side unsent drafts are a recovery aid, not proof that a step is saved to the laptop.
- Keep model assets, personal sessions, evaluation data, and certificate keys out of ordinary source commits.

Deletion, export, and retention controls have not been requested as first-version features. Do not invent their behavior.

## User and Access Model

Personal local use is the current scope. No cloud identity provider, account system, project ownership hierarchy, or collaborator model is selected.

The iPad and laptop use the same local service. Do not interpret references to users as a requirement for multi-user accounts. If local access control becomes necessary, document the concrete requirement before adding it.

## Problem and Writing Model

- One uploaded/cropped question starts a session.
- Store its image, recognized mathematical statement, user corrections, instructions, topic context, and assumptions.
- Initially handle unrecognized prose through user typing/correction.
- Each solution step has its own writing area, stroke history, interpreted math, revision, and result.
- Allow pen/finger/mouse/keyboard inputs as appropriate to the device.
- Keep the original question above the step areas.
- The user can continue after an issue; maintain a visible warning and distinguish unvalidated work from validated context.

Do not assume an erroneous step becomes a trusted mathematical premise simply because the user proceeded. Track its state when assessing subsequent steps.

## Recognition Model

Input: a clean crop rasterized from the current step's strokes, or a selected question image.

Output: proposed math notation and recognition/parse evidence. Recognition is not a mathematical verdict.

Load the model once per backend lifetime where feasible. Run expensive inference without blocking writing or ordinary session interaction. Exact worker/process and concurrency design must follow measured latency and memory use.

Expose editable recognition. Ambiguous symbols, failed parsing, or conflicting interpretations should lead to clarification. A model's self-reported confidence is not a calibrated correctness score.

## Mathematical Verification Model

Input: confirmed interpreted math, requested operation/problem, prior validated work, domains, and restrictions.

Output: structured verdict, verification basis, issue category, and evidence suitable for feedback.

Checks include exact arithmetic, expression/equation transformations, division/cancellation restrictions, inequality signs, lost/extra solutions, derivatives, antiderivatives, and limits as their topic groups are implemented.

SymPy is a toolkit; custom rules must validate student transitions. Preserve domains and branches. Numerical samples may find counterexamples but do not prove equivalence.

Unsupported or unresolved verification must remain explicitly uncertain. Do not substitute a language-model opinion for a verified result.

## Feedback Model

- Present a short hint first.
- Expose correction on request only when supported by evidence.
- Do not automatically reveal a correction or a full worked solution.
- Keep recognition clarification separate from mathematical correction.
- Allow continuing with a visible warning; no compulsory correction gate.
- Repeatedly submitting the same revision should not produce contradictory status from stale or duplicate work.

## API and State Contracts

Implemented: GET /api/health, GET /api/recognition-status, POST /api/check-step, POST /api/recognize (raw raster body), local explorer/schema, and built frontend serving. Recognition returns latex, device, elapsed_ms, and requires_confirmation=true. Session load/save endpoints remain future work.

CheckRequest: problem, previous_step, new_step, input_format (text or latex; default text), variable (default x), ordered history before previous_step, request_correction (default false), step_id, revision, and context_revision. CheckResult: status, transition_status, context_status, message, hint, issue_type, verification_basis, correction_available, optional correction, warnings, can_continue=true, typed interpretation, step_id, revision, context_revision, and input_fingerprint.

transition_status describes the newest transition. context_status describes earlier supplied work. A locally valid transition after a mistake returns status=issue with transition_status=valid and context_status=earlier_issue. Corrections are suppressed while earlier work has unresolved issues.

The checker API is stateless: callers resubmit history. It echoes revisions and hashes the submitted snapshot, without storing sessions or rejecting old requests. The workspace now discards stale replies and invalidates dependent client feedback. The checker's interpretation field contains parsed text; the separate recognition response supplies the proposed image reading.

Bounds: 256 characters/line, 128 tokens, 16 recursive nesting levels, 12 digits/literal, 256-bit rational intermediates, constant integer powers from -8 to 8, 32 earlier lines, and 32 KiB/request. Nonlinear variable powers/products, variable denominators, inequalities, functions, and arbitrary LaTeX are not supported. Supported fractions, grouping, delimiters, spacing, and multiplication/division commands can be translated in latex mode. Checks use bounded affine operations rather than an unrestricted symbolic solver.

Semantic check states:

- verified: a supported check established validity.
- issue: evidence establishes a mathematical issue.
- needs_clarification: interpretation or assumptions need correction/confirmation.
- incomplete: the work is not ready to check.
- unsupported: the checker cannot establish a verdict.

Pending and stale are interaction/request states; do not display them as mathematical judgments. Discard stale replies. Bind results to both the step revision and the relevant context revisions.

## App Installation and Certificates

Local HTTPS is planned for secure-context web-app features. Generate certificates for the actual LAN address, configure the server, install only the public local CA certificate on the iPad, and enable trust. Keep private keys on the laptop.

An HTTP Safari page is sufficient for the earliest drawing/file-upload test. Installation and actual iPad behavior need verification; do not mark them complete from documentation alone.

## Invariants

1. Question upload, writing, checking, and feedback live inside Math Buddy.
2. The frontend is React/TypeScript; the local backend remains Python.
3. Separate step areas, hint-first feedback, correction on request, and warning-only continuation match confirmed choices.
4. Recognition and verification remain separate.
5. A result applies only to the revision and context that produced it.
6. An erroneous/unverified prior step does not become a trusted premise silently.
7. Different valid methods can pass; unsupported work does not receive fabricated certainty.
8. Sessions and inference remain local; no paid dependency or external service is added without explicit scope and budget review.
9. Automatic checking is later work; manual checking is the first usable version.
10. UI caching does not imply independent iPad inference.

## References

The existing [plan](MATH_BUDDY_PLAN.md) contains researched tool links and remains unchanged. Current user decisions in [project overview](<project-overview (2).md>) control product behavior where the earlier plan offered alternatives.
