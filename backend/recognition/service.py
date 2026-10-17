"""Single persistent worker with bounded uploads, queueing, and inference time."""

import asyncio
from contextlib import suppress
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import time
import warnings

from PIL import Image, ImageChops, ImageOps, UnidentifiedImageError

ROOT = Path(__file__).resolve().parents[2]
MAX_IMAGE_BYTES = 8 * 1024 * 1024
MAX_PIXELS = 16_000_000


class RecognitionError(Exception):
    def __init__(self, message: str, status_code: int = 503) -> None:
        super().__init__(message)
        self.status_code = status_code


def prepare_image(content: bytes) -> bytes:
    """Decode raster formats, flatten alpha, orient, and crop surrounding white."""
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            with Image.open(BytesIO(content)) as source:
                if source.format not in ("PNG", "JPEG", "WEBP"):
                    raise RecognitionError("Use a PNG, JPEG, or WebP image.", 415)
                if source.width * source.height > MAX_PIXELS:
                    raise RecognitionError("Image exceeds 16 megapixels. Crop to one question first.", 413)
                source.load()
                rgba = ImageOps.exif_transpose(source).convert("RGBA")
        image = Image.new("RGB", rgba.size, "white")
        image.paste(rgba, mask=rgba.getchannel("A"))
        difference = ImageChops.difference(image, Image.new("RGB", image.size, "white")).convert("L")
        bounds = difference.point(lambda value: 255 if value > 35 else 0).getbbox()
        if bounds is None:
            raise RecognitionError("This image is blank. Write a step before reading it.", 422)
        left, top, right, bottom = bounds
        image = image.crop((max(0, left - 20), max(0, top - 20), min(image.width, right + 20), min(image.height, bottom + 20)))
        image.thumbnail((2400, 1600))
        output = BytesIO()
        image.save(output, format="PNG")
        return output.getvalue()
    except RecognitionError:
        raise
    except (UnidentifiedImageError, OSError, ValueError, Image.DecompressionBombError, Image.DecompressionBombWarning) as error:
        raise RecognitionError("Could not read this image. Use a valid PNG, JPEG, or WebP.", 415) from error


class RecognitionService:
    def __init__(self) -> None:
        self.process: asyncio.subprocess.Process | None = None
        self.lock = asyncio.Lock()
        self.log = None

    def configuration(self) -> dict[str, object]:
        python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
        vendor = ROOT / "tools" / "UniMERNet"
        ready = python.is_file() and (vendor / "configs/demo.yaml").is_file() and (vendor / "models/unimernet_tiny/unimernet_tiny.pth").is_file()
        return {"configured": ready, "loaded": self.process is not None and self.process.returncode is None,
                "busy": self.lock.locked(), "engine": "UniMERNet (local demo configuration)",
                "max_image_bytes": MAX_IMAGE_BYTES}

    async def close(self) -> None:
        if self.process is not None and self.process.returncode is None:
            with suppress(ProcessLookupError):
                self.process.kill()
            await self.process.wait()
        self.process = None
        if self.log is not None:
            self.log.close()
            self.log = None

    async def recognize(self, content: bytes) -> dict[str, object]:
        if len(content) > MAX_IMAGE_BYTES:
            raise RecognitionError("Choose an image under 8 MB.", 413)
        if not self.configuration()["configured"]:
            raise RecognitionError("Local recognition is not configured. You can still type the question and steps.")
        image = await asyncio.to_thread(prepare_image, content)
        # Avoid an unbounded inference queue; other API routes remain available.
        try:
            await asyncio.wait_for(self.lock.acquire(), timeout=0.1)
        except asyncio.TimeoutError as error:
            raise RecognitionError("The local model is reading another image. Try again shortly.", 429) from error
        try:
            started = time.monotonic()
            if self.process is None or self.process.returncode is not None:
                await self.close()
                logs = ROOT / "artifacts"
                logs.mkdir(exist_ok=True)
                self.log = (logs / "recognition.log").open("ab")
                environment = os.environ.copy()
                environment.update({"HF_HUB_OFFLINE": "1", "TRANSFORMERS_OFFLINE": "1", "PYTHONUTF8": "1",
                                    "MATHBUDDY_PARENT_PID": str(os.getpid())})
                python = ROOT / ".venv" / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
                self.process = await asyncio.create_subprocess_exec(
                    str(python), "-u", str(ROOT / "backend/recognition/worker.py"),
                    cwd=ROOT / "tools/UniMERNet", stdin=asyncio.subprocess.PIPE,
                    stdout=asyncio.subprocess.PIPE, stderr=self.log, env=environment,
                    **({"creationflags": 0x08000000} if os.name == "nt" else {}))
            with tempfile.TemporaryDirectory(prefix="mathbuddy-") as directory:
                path = Path(directory) / "input.png"
                path.write_bytes(image)
                assert self.process.stdin is not None and self.process.stdout is not None
                self.process.stdin.write((json.dumps({"path": str(path)}) + "\n").encode())
                await self.process.stdin.drain()
                try:
                    line = await asyncio.wait_for(self.process.stdout.readline(), timeout=180)
                except asyncio.TimeoutError as error:
                    await self.close()
                    raise RecognitionError("Recognition timed out. Your writing is preserved; retry or enter the math manually.", 504) from error
                if not line:
                    await self.close()
                    raise RecognitionError("The recognition process stopped. Retry or enter the math manually.")
                result = json.loads(line)
                if "error" in result:
                    await self.close()
                    raise RecognitionError(result["error"])
                latex = result.get("latex")
                if not isinstance(latex, str) or not latex.strip():
                    raise RecognitionError("No equation was recognized. Try a closer crop or enter the math manually.", 422)
                return {"latex": latex, "device": result["device"],
                        "elapsed_ms": round((time.monotonic() - started) * 1000),
                        "requires_confirmation": True}
        except asyncio.CancelledError:
            # A cancelled read must never leave a response queued for a later image.
            await self.close()
            raise
        except (OSError, ValueError, BrokenPipeError) as error:
            await self.close()
            raise RecognitionError("Local recognition could not run. Check artifacts/recognition.log or type the math manually.") from error
        finally:
            self.lock.release()


recognition = RecognitionService()
