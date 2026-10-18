# Gemini-powered step review

## Polynomial integral safeguard

Every step still calls Gemini. A bounded independent comparison can additionally
veto a false positive on the first evaluated step of a rectangular double
integral with a small polynomial integrand and constant limits. It compares
exact polynomial endpoint/integral values and permits supported equivalent
forms, reordered integration, and rescaled bounds. It never approves work
itself, executes model code, or claims general calculus support. Unknown
notation, variable-dependent bounds, later steps, and other tasks still rely on
Gemini. Ordinary assessment supplies no unsolicited correction/hint.

This protects the reported case: the student's `x^2 y^3/3` evaluated from 0 to 1
cannot get a green verdict for the pictured double integral merely because
Gemini claims it integrated in x. Restart an older backend, refresh, and recheck
existing feedback to apply the safeguard.

**Current setup:** GLM-OCR transcribes images locally using 4-bit GPU weights.
Gemini **3.5 Flash-Lite** handles math checks and hints only. See
[LOCAL_OCR_SETUP.md](LOCAL_OCR_SETUP.md). Automatic readings no longer consume
Gemini API calls; checking/rechecking and hint requests do.

The workspace uses Gemini for **every submitted step**, simple and advanced.
There is no difficulty router and no silent local fallback. Handwritten steps
are read locally after a 1.5-second pause; checking the confirmed reading
is a Gemini call. Further ink edits can trigger additional local readings. Typed
steps use one review call. Rechecking and asking for a correction make another call.

## Configure the laptop

1. Open `.env` in the project root. It has already been created locally.
2. Set `GEMINI_API_KEY` to your key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Use `GEMINI_MODEL=gemini-3.5-flash-lite`, or choose a model supporting
   structured JSON output that is available to your key.
4. Save the file. The server rereads it on requests. Existing OS environment
   variables take precedence over `.env`; no interpolation is performed.

Do not use a `VITE_` prefix: the key belongs only to the Python server. `.env`
and `.env.*` are ignored by Git; `.env.example` is a blank shareable template.
The key is sent to Google's fixed HTTPS API host in the `x-goog-api-key` header.
It is not returned by status endpoints, embedded in URLs, or sent to the browser.

Install/recover runtime dependencies in the existing checker environment:

```powershell
.\.checker-venv\Scripts\python.exe -m pip install -r backend/requirements.txt
```

The current laptop's dependencies and frontend build are prepared. Stop an old
server with Ctrl+C, then start the updated backend from the project root:

```powershell
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

On the laptop open http://127.0.0.1:8000/. On the same Wi-Fi, use
`http://YOUR_LAPTOP_IP:8000/` in iPad Safari. Reload the page after restarting.
The laptop needs internet access for Gemini. Google project quota/billing applies;
there are no automatic retries or automatic mathematical checks. Handwriting
transcription runs locally after the idle delay.

## Try the feature

- Simple: question `3x+8=20`, then `3x=12`, then `x=4`.
- Harder: question `Differentiate sin(x^2) with respect to x`, then
  `cos(x^2)` to test incorrect-step feedback, or `2x cos(x^2)` for the correct derivative.
  Use **Hint** to request guidance; checking alone does not show a hint.
- Include the task, differentiation variable, domain, and conditions in the
  question. The question and each line are limited to 256 characters.
- Write in a box, then pause for 1.5 seconds. GLM-OCR reads the image locally.
  The side check button can also read immediately. Correct
  any misread symbols in **Math Buddy read**, then tap **Confirm** to review it.
  The confirmed text is authoritative; original ink remains intact.
- Writing again resets the pause and invalidates older replies. Step-image reads
  run one at a time per tab; changes during a request are combined into one
  queued reading of the latest ink. Unchanged ink reuses its last available
  reading in this tab. Empty/typed boxes and restoring a draft do not trigger
  automatic reads. A failed reading waits for changed ink or an explicit retry.
  Repeated pauses can still consume API quota. Reading alone never gives hints,
  grades the step, or creates the next box.
- **Type** sends the typed step straight to Gemini review.
- Normal checks return no hint. The interface shows the verdict and important
  warnings, with assessment explanations under **Details**. Review instructions
  forbid unsolicited next operations, corrected answers, or tutoring guidance in
  messages/warnings. **Hint** and explicitly requested corrections remain separate.
- Each review also returns `is_final_answer` in the same Gemini request. Correct
  intermediate steps open another box; a complete answer to the original task
  shows **Question complete** and stops automatic boxes. This is task-aware AI
  assessment, including full solution sets/conditions, not an independent proof.
  Earlier issues, unresolved work, and warnings cannot mark completion. Edits
  clear dependent completion, and suggested corrections do not complete work.
- Restart an already-running Python server after this update, then refresh the
  browser. A server without the completion field prompts a restart rather than
  silently continuing the old box-creation behavior.
- Feedback is labelled **Reviewed by Gemini**. A green result is an AI
  assessment, not an independent symbolic proof. Unclear/incomplete work can
  request clarification; unresolved work is not marked correct.
- The entire supplied history is reviewed. An earlier error must retain a warning,
  even if a later transformation follows it. Corrections are hidden until
  requested and are suppressed while an earlier issue remains.
- Editing a line/question invalidates dependent feedback and stale in-flight
  responses. Ink and draft content remain available after network/API errors.
- Selecting **Read question** also sends the selected image to Gemini. Question
  readings retain task words, not just an equation. Drafts remain browser-specific;
  images stay on the laptop; confirmed math context is sent to Google for review.

## Progressive hints

The former **A little guidance** button has been replaced by **I need a hint**.

1. Confirm the question, then tap **I need a hint**. Before writing, help is about
   getting started. Tapping or focusing a step selects that box for hints; the
   **Hint for** selector also lets you choose the question or another step.
2. The first hint suggests a concept or guiding question. **More help** requests
   a more specific pointer, using the previous hint so it can build on it.
3. Only **Show one next step**, after the two hints, requests a suggested line.
   Hints never change the card's correctness state; use **Check** for an assessment.
4. For unread ink, use **Read Step N**, review/edit the reading in the hint panel,
   then **Confirm reading & continue**. This confirms the text and requests help
   without grading the line. Earlier unread or empty boxes must be addressed,
   or choose question-only help instead.
5. Earlier flagged steps redirect help back to that line. A known earlier warning
   suppresses suggested lines that would extend an incorrect premise.
6. Close/reopen to see cached hints without another request. Each new hint or
   suggested-line request calls Gemini. Changing the relevant question/step clears
   outdated hints and cancels/ignores pending replies. Editing later boxes does
   not clear help about an unchanged earlier step.

Hints are cached per question/step revision in the current open tab, not saved
in the browser draft. Refreshing starts hint progression again. API/quota errors
keep existing hints and ink and offer **Retry hint** / **Retry next step**.
Long hint panels scroll with the page rather than covering the writing boxes.

The endpoint is `POST /api/hint`. It uses the existing server-only Gemini key,
bounded structured output, explicit level/next-step consent, original task and
complete confirmed prior history. Submitted context is sent to Google. A hint is
learning guidance, not mathematical verification.

## Errors and diagnostics

`GET /api/recognition-status` reports whether a key is configured, the selected
model, and `all_steps_use_gemini=true`. Configured means present, not validated.
No key means a visible setup notice and an actionable 503 on attempted checks.
Authentication/model-access errors, quota 429, timeouts 504, and invalid/blocked
model output have separate retry/setup messages. None produces a math verdict
or silently switches to local checking. Gemini requests have a 180-second timeout
and a bounded output; images retain the 8 MiB and 16-megapixel limits.

## Preserved offline tools

The exact checker and original recognition environment are preserved:

- `python -m backend.cli`: original offline arithmetic/affine/linear checker.
- `POST /api/local/check-step`: explicit exact checker endpoint.
- `POST /api/local/recognize`: explicit original UniMERNet image reader.

The workspace does not use those routes as fallbacks. Default `/api/check-step`
and `/api/recognize` always use Gemini, so existing API clients wanting the
original exact behavior should switch to the explicit `/api/local/` routes.

## Verification

```powershell
.\.checker-venv\Scripts\python.exe -m unittest discover -s backend/tests -v
npm.cmd test --prefix frontend
npm.cmd run build --prefix frontend
```

Automated Gemini tests use HTTPX MockTransport, not real Google calls. They check
both simple and calculus routing, image transcription/confirmation, full history,
metadata ownership, earlier-error guards, opt-in correction handling, missing-key
behavior, and safe errors. A live key/model call and real iPad/Pencil testing are
separate checks; mocked results do not establish mathematical accuracy.

Implementation follows Google's [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.5-flash-lite),
[GenerateContent API](https://ai.google.dev/api/generate-content),
[image inputs](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding),
and [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).
