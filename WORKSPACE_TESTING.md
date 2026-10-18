# Test the writing workspace

**Model update:** GLM-OCR now reads handwriting/questions locally on the GPU
using 4-bit decoder and vision weights; Gemini 3.5 Flash-Lite handles checks
and hints. Install once with `setup-local-ocr.ps1`, then restart an older server
and refresh the browser. See [LOCAL_OCR_SETUP.md](LOCAL_OCR_SETUP.md).

The workspace uses local GLM-OCR to read questions/handwriting and Gemini to review **every**
submitted step, including simple and advanced math. Add your API key to the
laptop’s `.env` first; see [GEMINI_SETUP.md](GEMINI_SETUP.md). The laptop needs
internet access. Original offline tools remain at explicit `/api/local/` routes.

## 1. Start on Windows

Open PowerShell in C:\Users\aayus\Downloads\Swamphacks. If the earlier API server is
still running in another terminal, press Ctrl+C there before starting the updated
app. An already-running Python process will not load backend edits.

Dependencies and the built frontend are prepared on this laptop. Start with:

```powershell
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/ (the workspace). The explorer remains at /docs. Leave
the terminal running. If another process occupies the port, use --port 8001 and
http://127.0.0.1:8001/. Each origin has a separate browser draft.

Optional launcher: .\start-mathbuddy.ps1. It builds missing assets; use -Build to
rebuild. If local script policy prevents running it, use the direct Python command.
There is no need to change execution policy.

### Rebuild or recreate dependencies

After frontend source edits:

```powershell
Set-Location frontend
npm.cmd ci
npm.cmd run build
Set-Location ..
```

Reload the browser after building. Node 24.11.0/npm 11.6.1 were used here. Node/npm
are for building/developing; Python serves the built app for ordinary use.

If recreating the checker environment:

```powershell
py -3.10 -m venv .checker-venv
.\.checker-venv\Scripts\python.exe -m pip install -r backend/requirements-lock.txt
```

The optional legacy local reader uses the existing .venv and tools/UniMERNet/configs/demo.yaml. Its
model/tokenizer paths point at models/unimernet_tiny inside that vendor directory.
Do not install its PyTorch dependencies into .checker-venv. Model files and
dependencies must already be present. The worker forces Hugging Face offline mode.
The running setup was observed using CPU; no GPU performance is claimed.

## Interface update (October 17, 2026)

The workspace follows the latest minimal reference: a near-black page, one
centered column, a compact question header, charcoal step cards, and circular
check buttons. Correct steps have a green border and short feedback; explanations
and Gemini attribution remain under **Details**. Important warnings stay visible.
Handwriting pads now provide a full-width square writing surface, including on
iPad and phone layouts. Drawing and image-export coordinates use the same square
geometry so new pen strokes keep their proportions.
After a correct check, a handwriting square collapses to a compact card showing
the confirmed equation. Tap that equation or select the step in the toolbar to
expand its original ink for editing. The small up arrow collapses it again;
rechecking successfully also collapses it. Incorrect/unresolved work stays open.
The compact icon toolbar above the steps controls the selected box. A correct
intermediate check of the last box opens one new box. A final answer instead
shows **Question complete**; there is no Add next step button. The question editor collapses after **Use this question**; its pencil icon
reopens it. The plus icon starts a new question with confirmation.

The built frontend is already updated. Restart/start the server with the commands
above and reload Safari to load the new assets. Gemini runtime dependencies are
installed on this laptop; use backend/requirements.txt when recreating the environment.

## 2. Upload and confirm a question

1. Upload a PNG/JPEG/WebP screenshot under 8 MB and 16 megapixels. Prefer dark
   writing on a light background and one equation.
2. For multiple questions or prose, select **Select one question**, then drag
   around the equation. Select **Read question**. Reading the full image also works.
3. Review the rendered math and editable equation. Correct misread symbols by
   typing. Include task words such as differentiate/integrate and any assumptions
   so the reviewer knows what you are trying to do. Keep it under 256 characters.
4. Select **Use this question**. Variable defaults to x; select the actual letter
   if different. The variable is not the numerical answer.

Typing the question directly works without uploading an image.

## 3. Write and check

1. Write one equation in Step 1 with Apple Pencil or a mouse. Finger drawing is
   off by default so a finger can scroll. Turn it on to draw by touch.
   Inside a writing area, finger drags scroll the page explicitly so browser
   panning cannot interrupt a pen stroke. Scroll inertia/palm behavior still
   needs actual iPad verification; pinch zoom can be started outside the pad.
2. Tap a box or choose **Active step** in the shared top toolbar. **Pen** writes;
   **Eraser** removes an entire touched stroke; **Undo** restores the selected
   box's previous drawing action in this tab. Each box keeps its own undo history
   (up to 50 actions). **Clear** affects only that box and can also be undone.
3. Stop writing for **1.5 seconds**. GLM-OCR automatically reads that box locally; the
   delay starts when the pen lifts and restarts after further writing, erasing,
   undo, or clear. A held pen never triggers a reading. You can also select the
   **check button on the right** to read immediately.
4. Review **Math Buddy read**. Edit misread math; handwriting remains intact.
   Select the same side button, now labelled **Confirm**, for Gemini’s mathematical assessment.
   Confirmed readings collapse under **Reading** and can be reopened.
5. Once Gemini reviews the last step as a correct intermediate step with consistent earlier work,
   the next box opens and becomes selected automatically. It keeps the current
   Write/Type input mode. An issue, unclear reading, failed request, or stale reply
   does not add a box. Fix the current step and retry, or ask for a hint.
   Rechecking earlier steps preserves existing boxes without adding duplicates.
   A final answer stops automatic boxes and shows **Question complete**. The same
   review checks completion against the original task, with no second Gemini call.
   Existing written/edited boxes and undo history are retained. Untouched empty
   boxes after a newly checked final answer are removed. Editing premises clears
   completion; confirm earlier readings before rechecking. Restart an already
   running backend after this update, then refresh the browser.

Automatic reading transcribes the ink only. It does not grade, reveal hints,
or add another box. It runs after the question is confirmed and local GLM-OCR is
installed. Step-image reads share one request lane: edits during a
request replace the queued image, and outdated replies are ignored. A matching
reading already obtained in this tab is reused, including edits to its text.
Empty/typed boxes and merely reopening a saved draft make no automatic requests.
Failures do not retry in a loop; use the check button or **Read again**, or change
the ink. Frequent pauses can still make multiple local OCR requests; there is no extra
rate limit beyond the idle delay and one active step-image request per tab.

The **Type** button in the shared toolbar is a fallback for the selected box and
a way to test math separately from recognition.
Typed equations display once when you leave the field. Tap the equation to edit;
Enter also commits the display without checking. The side check button requests
review. Switching back with **Pen** retains ink and asks for a fresh reading.
Hover titles and accessible labels identify the toolbar icons. The hand icon
toggles finger drawing. Undo/clear always affect only the selected drawing box.

### A useful test sequence

Use 3(x+2)=15, then:

| Step / action | Expected |
|---|---|
| Step 1: 3x+6=15 | Expected valid, labelled Reviewed by Gemini; Step 2 opens |
| Step 2: 3x=11 | Incorrect-step verdict; no automatic hint or new box; correction hidden |
| Show one correction | Suggested next step, such as 3*x = 9; wording may vary |
| Change Step 2 to 3x=9 and check | Step verified; Step 3 opens |
| Step 3: x=3 | Question complete; no Step 4 |
| Change Step 1 to 3x+6=16 | Its feedback and all later feedback clear |
| Recheck later work without fixing Step 1 | Earlier-work warning remains |

For a different valid approach, start a new question and use x+2=5, then x=3.
For a harder test, use `Differentiate sin(x^2) with respect to x`; try `cos(x^2)`
and then `2x cos(x^2)`. Gemini feedback is not deterministic and requires live
evaluation; AI review does not establish a symbolic proof.

## On-demand hints

Checking either a correct or incorrect step must not automatically show a hint.
Only the verdict and important warnings appear; explanations are under **Details**.
Tap **Hint** to request guidance, or explicitly request a correction. The frontend
also ignores any legacy check-response hint field from an older server.

The compact **Hint** action beside **Show your work** opens progressive help. Choose the question
or the step you want help with, then try the first hint, **More help**, and the
explicit **Show one next step** action. Confirm unread handwriting first. Verify
that opening cached hints makes no request, editing relevant work clears them,
and hints do not grade a step. See [GEMINI_SETUP.md](GEMINI_SETUP.md#progressive-hints)
for the complete flow and cache limits.

## 4. Test on iPad

Stop the loopback server with Ctrl+C. Start it on the local network:

```powershell
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 0.0.0.0 --port 8000
```

In a second PowerShell tab run ipconfig and find the active Wi-Fi/Ethernet IPv4
address. On the same home network, open http://YOUR_LAPTOP_IP:8000/ in iPad Safari.
Use the laptop's address, not localhost. Keep the laptop awake. Windows may require
private-network firewall access; no firewall settings were changed here.

Test on the actual device:

- Upload from Photos/Files, select a region, read it, and confirm the equation.
- Write a complete line with Pencil; verify finger scrolling and palm behavior.
- Use eraser/undo and rotate the iPad; ink should stay aligned.
- Check a correct/incorrect line, request a correction, and continue.
- Stop the server briefly: ink should remain and checks should report a connection
  error. Restart and retry.

HTTP suffices for this first upload/drawing test. Trusted HTTPS, Home Screen
installation/caching, and device-specific Pencil tuning are later work. Desktop
responsive testing does not replace an actual iPad test.

## 5. Draft recovery and editing

The app automatically saves **one draft in this browser/device** using IndexedDB.
The footer distinguishes saving, saved, and failed saves. Wait for **Draft saved
on this device** before refreshing or closing. Restoring keeps the question image,
equations, and strokes; old results clear and must be rechecked.

- Drafts do not sync between devices, browsers, or different URLs/ports.
- Clearing site data/private browsing may remove a draft.
- Current crop selection and undo history are not restored; the original image
  and recognized equation are retained.
- **New question** prompts before replacing the current draft.
- This is browser draft recovery, not SQLite laptop session storage.
- Editing a question, variable, or earlier step invalidates dependent feedback.
  Replies for old writing are discarded.

## 6. Automated checks

```powershell
.\.checker-venv\Scripts\python.exe -m unittest discover -s backend/tests -v
Set-Location frontend
npm.cmd test
npm.cmd run build
npm.cmd audit
Set-Location ..
```

Unit/API tests mock expensive inference but exercise real image validation and
checker logic. Actual local inference is also exercised separately through the
live API/browser. This is a smoke test, not an accuracy benchmark.

## Recognition troubleshooting

- **Setup needed:** check .venv/Scripts/python.exe, demo.yaml, and the tiny
  model/tokenizer files in tools/UniMERNet/models/unimernet_tiny.
- **Model busy:** one worker reads one image at a time to bound CPU/memory. Retry
  after the current reading completes. Ordinary checking stays available.
- **Failure/timeout:** retry or type the equation; writing remains editable.
  Diagnostics are in artifacts/recognition.log. Each model response is limited to
  180 seconds. A failed worker restarts on a later request.
- **Wrong reading:** edit it before checking, or use a tighter crop. No calibrated
  recognition-confidence score is claimed.
- **Unsupported LaTeX:** type a supported equation. Fractions, grouping,
  single-atom font wrappers, and common operations/spacing are supported; general
  arrays, prose, functions, and TeX are not.

No external tutoring API, automatic checking, new curriculum group, or server-side
saved-session feature is part of this milestone.
