"""Local writing workspace, recognition adapter, and mathematical checker."""

from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.openapi.docs import get_swagger_ui_html
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from backend.checking.checker import check_step
from backend.models import CheckRequest, CheckResult
from backend.recognition.service import MAX_IMAGE_BYTES, RecognitionError, recognition

MAX_BODY_BYTES = 32_768

@asynccontextmanager
async def lifespan(application: FastAPI):
    yield
    await recognition.close()


app = FastAPI(
    title="Math Buddy — typed checker",
    description=("Local prototype for arithmetic and one-variable linear math over the reals. "
                 "Hints appear first. Set request_correction=true to request a supported correction. "
                 "Set input_format=latex for the supported OCR-LaTeX subset. "
                 "Local handwriting recognition and a React writing workspace are available. "
                 "Drafts are stored only in the browser; no server-side saved sessions yet."),
    version="0.2.0",
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)


class BodySizeLimit:
    """Bound real body bytes, not just a possibly missing Content-Length header."""

    def __init__(self, app: ASGIApp, max_bytes: int = MAX_BODY_BYTES) -> None:
        self.application = app
        self.max_bytes = max_bytes

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http" or scope["method"] not in ("POST", "PUT", "PATCH"):
            await self.application(scope, receive, send)
            return
        chunks: list[Message] = []
        total = 0
        limit = MAX_IMAGE_BYTES if scope["path"] == "/api/recognize" else self.max_bytes
        while True:
            message = await receive()
            if message["type"] == "http.disconnect":
                return
            total += len(message.get("body", b""))
            if total > limit:
                response = JSONResponse({"detail": f"Request body exceeds {limit} bytes."}, status_code=413)
                await response(scope, receive, send)
                return
            chunks.append(message)
            if not message.get("more_body", False):
                break
        cursor = iter(chunks)

        async def replay() -> Message:
            return next(cursor, {"type": "http.request", "body": b"", "more_body": False})

        await self.application(scope, replay, send)


app.add_middleware(BodySizeLimit)
app.mount("/docs-assets", StaticFiles(directory=Path(__file__).parent / "static" / "swagger"), name="docs-assets")


@app.get("/", include_in_schema=False)
def home():
    index = Path(__file__).resolve().parents[1] / "frontend/dist/index.html"
    if not index.is_file():
        return JSONResponse({"detail": "Build the workspace first: cd frontend; npm install; npm run build. API explorer: /docs"}, status_code=503)
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


@app.get("/favicon.svg", include_in_schema=False)
def favicon():
    return FileResponse(Path(__file__).resolve().parents[1] / "frontend/public/favicon.svg", media_type="image/svg+xml")


@app.get("/docs", include_in_schema=False)
def local_docs():
    # Self-host assets so the explorer needs no CDN or internet connection.
    return get_swagger_ui_html(
        openapi_url="/openapi.json", title="Math Buddy — test the checker",
        swagger_js_url="/docs-assets/swagger-ui-bundle.js",
        swagger_css_url="/docs-assets/swagger-ui.css",
        swagger_favicon_url="data:,",
        swagger_ui_parameters={"defaultModelsExpandDepth": -1, "validatorUrl": None},
    )


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok", "component": "typed-checker", "version": "0.2.0"}


@app.get("/api/recognition-status")
def recognition_status() -> dict[str, object]:
    return recognition.configuration()


@app.post("/api/recognize")
async def recognize_image(request: Request):
    """Read a raw PNG/JPEG/WebP body. Recognition must be reviewed before checking."""
    if request.headers.get("content-type", "").split(";")[0] not in ("image/png", "image/jpeg", "image/webp"):
        return JSONResponse({"detail": "Use a PNG, JPEG, or WebP image."}, status_code=415)
    try:
        return await recognition.recognize(await request.body())
    except RecognitionError as error:
        return JSONResponse({"detail": str(error)}, status_code=error.status_code)


@app.post("/api/check-step", response_model=CheckResult, response_model_exclude_none=True)
def check(request: CheckRequest) -> CheckResult:
    """Check one transition; include all earlier lines in history to retain warnings.

    history is ordered and excludes previous_step. Return metadata/fingerprint
    lets the workspace discard results for an edited step or context. There is
    no server-side session state or automatic revision invalidation in this unit.
    """
    return check_step(request)


# check_dir=False permits API-only use before the first frontend build.
app.mount("/assets", StaticFiles(directory=Path(__file__).resolve().parents[1] / "frontend/dist/assets", check_dir=False), name="workspace-assets")
