# Gemini-powered step review

The workspace uses Gemini for **every submitted step**, simple and advanced.
There is no difficulty router and no silent local fallback. Handwritten steps
use two calls: read the image, then review the confirmed reading. Typed steps
use one review call. Rechecking and asking for a correction make another call.

## Configure the laptop

1. Open `.env` in the project root. It has already been created locally.
2. Set `GEMINI_API_KEY` to your key from [Google AI Studio](https://aistudio.google.com/apikey).
3. Keep `GEMINI_MODEL=gemini-3.8-flash`, or choose an image/text model supporting
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
no automatic retries or background model checks are made.

## Try the feature

- Simple: question `3x+8=20`, then `3x=12`, then `x=4`.
- Harder: question `Differentiate sin(x^2) with respect to x`, then
  `cos(x^2)` to test a chain-rule hint, or `2x cos(x^2)` for the correct derivative.
- Include the task, differentiation variable, domain, and conditions in the
  question. The question and each line are limited to 256 characters.
- Write in a box and tap its side check button. Gemini reads the image. Correct
  any misread symbols in **Math Buddy read**, then tap **Confirm** to review it.
  The confirmed text is authoritative; original ink remains intact.
- **Type** sends the typed step straight to Gemini review.
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
  submitted images and math context are sent to Google for processing.

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

Implementation follows Google's [model documentation](https://ai.google.dev/gemini-api/docs/models/gemini-3.8-flash),
[GenerateContent API](https://ai.google.dev/api/generate-content),
[image inputs](https://ai.google.dev/gemini-api/docs/generate-content/image-understanding),
and [structured output documentation](https://ai.google.dev/gemini-api/docs/structured-output).
