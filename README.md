# Math Buddy

**Current model setup:** local 4-bit GLM-OCR on the laptop GPU reads images;
Gemini 3.5 Flash-Lite reviews confirmed math and supplies requested hints.
See [LOCAL_OCR_SETUP.md](LOCAL_OCR_SETUP.md) for installation and memory limits.

A personal math-step assistant hosted on your laptop. Upload a question, write in separate step
areas, review recognized math, and check each step. The React/TypeScript workspace
uses a Python backend, local GLM-OCR, and Gemini to review every submitted step, simple
or advanced. The original offline checker and recognition environment are preserved.

**First:** add your key to the local `.env` file; see [GEMINI_SETUP.md](GEMINI_SETUP.md).
Gemini requests need internet access. The key never goes to the frontend.

## Open the workspace

Start here: [WORKSPACE_TESTING.md](WORKSPACE_TESTING.md) for laptop/iPad setup and
end-to-end tests. From PowerShell in this project, after the first build:

```powershell
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/. Keep the terminal open. Stop an older server with
Ctrl+C before restarting after backend changes. The optional start-mathbuddy.ps1
launcher builds missing frontend assets and starts the server.

## Test the checker

Start here: [CHECKER_TESTING.md](CHECKER_TESTING.md).

From PowerShell in this project:

```powershell
.\.checker-venv\Scripts\python.exe -m backend.cli
```

Or start the local API explorer:

```powershell
.\.checker-venv\Scripts\python.exe -m uvicorn backend.app:app --host 127.0.0.1 --port 8000
```

Open http://127.0.0.1:8000/docs. Its assets are served locally, without a CDN.

The checker uses .checker-venv so the recognition demo's .venv is preserved.
Installation/recovery commands and examples are in the testing guide.

## Current scope

- Local 4-bit GLM-OCR image reading and Gemini review of all workspace steps, including advanced math.
- Short feedback, clarification states, and explicit Gemini attribution.
- Preserved offline exact arithmetic and affine expression rewrites.
- One-variable linear equations over the real numbers, including alternative paths.
- On-demand progressive hints for the question or selected step, with an explicit next-step reveal.
- Short check feedback, opt-in supported corrections, and warnings about earlier mistakes.
- CLI, stateless API, bounded input, and automated tests.
- Explicit legacy local recognition at `/api/local/recognize`, with its separate .venv.
- Upload and question selection, automatic handwriting reading after a 1.5-second
  pause, editable readings, separate drawing areas,
  a shared pen/whole-stroke eraser/undo toolbar, typed fallback, manual checking,
  automatic next boxes after correct intermediate steps, final-answer completion
  in the same Gemini review, and optional corrections.
- Apple Pencil/mouse input by default, optional finger drawing, and a minimal
  dark workspace with one column, a compact icon toolbar, and short feedback.
- One browser/device draft with stale-result invalidation and complete supplied history.
- A restricted LaTeX adapter including observed recognition formatting.

Laptop session storage/sync, installable Home Screen mode/HTTPS, automatic
checking, independent symbolic calculus verification, and an AI chat sidebar are future work.
Actual iPad/Pencil behavior still needs a device test. Confirmed mathematical context and checks
are sent to Gemini; images are transcribed locally, and AI reviews are not guaranteed mathematical proofs. The CLI and
explicit `/api/local/` endpoints still operate offline. Drafts are specific to the browser,
device, and URL; they are not synced to the laptop or other devices.

See [project context](<CONTEXT/project-overview (2).md>) for the agreed product scope.
