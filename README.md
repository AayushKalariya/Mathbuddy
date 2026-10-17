# Math Buddy

A personal, local math-step assistant. Upload a question, write in separate step
areas, review recognized math, and check each step. The React/TypeScript workspace
uses the Python checker and the existing local UniMERNet recognition environment.

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

- Exact arithmetic and affine expression rewrites.
- One-variable linear equations over the real numbers, including alternative paths.
- Short hints, opt-in supported corrections, and warnings about earlier mistakes.
- CLI, stateless API, bounded input, and automated tests.
- Local image recognition with a persistent worker in the separate .venv.
- Upload and question selection, editable readings, separate drawing areas,
  pen/whole-stroke eraser/undo, typed fallback, manual checking, and optional corrections.
- Apple Pencil/mouse input by default, optional finger drawing, responsive layout.
- One browser/device draft with stale-result invalidation and complete supplied history.
- A restricted LaTeX adapter including observed recognition formatting.

Laptop session storage/sync, installable Home Screen mode/HTTPS, automatic
checking, calculus verification, and an external AI help sidebar are future work.
Actual iPad/Pencil behavior still needs a device test. All current inference and
checking run locally, without a paid API. Drafts are specific to the browser,
device, and URL; they are not synced to the laptop or other devices.

See [project context](<CONTEXT/project-overview (2).md>) for the agreed product scope.
