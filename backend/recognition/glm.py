"""Only prequantized Q4 GLM-OCR runs locally, with one small GPU worker."""
import asyncio
import base64
from contextlib import suppress
from io import BytesIO
import os
from pathlib import Path
import re
import secrets
import socket
import struct
import time
from typing import Literal

import httpx
from PIL import Image

from backend.config import gemini_settings, ocr_model
from backend.recognition.gpu_job import GPUJob
from backend.recognition.service import MAX_IMAGE_BYTES, RecognitionError, prepare_image

ROOT = Path(__file__).resolve().parents[2]
MODEL = ROOT / "models/glm-ocr-q4/glmocr-Q4_K_M.gguf"
VISION = ROOT / "models/glm-ocr-q4/mmproj-glmocr-Q4_1.gguf"
SERVER = ROOT / "tools/llama-glm-q4/llama-server.exe"
LOCAL_URL = "http://127.0.0.1:8078"


def quantization(path: Path) -> int:
    """Inspect GGUF before loading weights: 15=Q4_K_M, 3=Q4_1."""
    with path.open("rb") as source:
        def scalar(fmt):
            return struct.unpack("<" + fmt, source.read(struct.calcsize("<" + fmt)))[0]

        def string():
            size = scalar("Q")
            if size > 16_000_000:
                raise ValueError("Invalid GGUF string")
            return source.read(size).decode("utf-8")

        def value(kind):
            if kind == 8:
                return string()
            if kind == 9:
                element, length = scalar("I"), scalar("Q")
                if length > 1_000_000:
                    raise ValueError("Invalid GGUF array")
                for _ in range(length):
                    value(element)
                return None
            return scalar({0: "B", 1: "b", 2: "H", 3: "h", 4: "I", 5: "i", 6: "f", 7: "?", 10: "Q", 11: "q", 12: "d"}[kind])

        if source.read(4) != b"GGUF" or scalar("I") not in (2, 3):
            raise ValueError("Not a supported GGUF")
        scalar("Q")
        count = scalar("Q")
        if count > 100_000:
            raise ValueError("Invalid GGUF metadata")
        for _ in range(count):
            name, kind = string(), scalar("I")
            found = value(kind)
            if name == "general.file_type":
                return found
    raise ValueError("GGUF precision missing")


def clean_reading(text: str) -> str:
    text = text.strip()
    text = re.sub(r"^```(?:latex|math|text)?\s*\n?(.*?)\n?```$", r"\1", text, flags=re.S).strip()
    for left, right in ((r"\[", r"\]"), (r"\(", r"\)"), ("$$", "$$"), ("$", "$")):
        if text.startswith(left) and text.endswith(right):
            text = text[len(left):-len(right)].strip()
            break
    if not text or len(text) > 256 or "<|" in text or "\x00" in text:
        raise RecognitionError("GLM-OCR could not read one clear step. Edit the writing, crop the question, or type the math.", 422)
    return text


class GLMRecognitionService:
    def __init__(self) -> None:
        self.lock = asyncio.Lock()
        self.process: asyncio.subprocess.Process | None = None
        self.log = None
        self.device = ""
        self.job: GPUJob | None = None
        self.idle_timer: asyncio.TimerHandle | None = None
        self.worker_key = secrets.token_urlsafe(24)

    def installed(self) -> bool:
        try:
            return SERVER.is_file() and quantization(MODEL) == 15 and quantization(VISION) == 3
        except (OSError, ValueError, KeyError, struct.error):
            return False

    async def configuration(self) -> dict[str, object]:
        ready = self.installed()
        settings = gemini_settings()
        return {"configured": ready, "loaded": self.process is not None and self.process.returncode is None,
                "busy": self.lock.locked(), "engine": "GLM-OCR (local GPU)", "model": ocr_model(),
                "quantization": "Q4_K_M", "vision_quantization": "Q4_1", "device": self.device,
                "max_image_bytes": MAX_IMAGE_BYTES, "all_steps_use_gemini": True,
                "review_configured": bool(settings.api_key), "review_model": settings.model,
                "message": "" if ready else "Run setup-local-ocr.ps1 on the laptop to install 4-bit GLM-OCR."}

    async def close(self):
        if self.idle_timer:
            self.idle_timer.cancel()
            self.idle_timer = None
        if self.process and self.process.returncode is None:
            with suppress(ProcessLookupError):
                self.process.kill()
            await self.process.wait()
        self.process = None
        if self.job:
            self.job.close()
            self.job = None
        self.device = ""
        if self.log:
            self.log.close()
            self.log = None

    async def ensure_worker(self, client: httpx.AsyncClient):
        if self.process and self.process.returncode is None:
            return
        await self.close()
        if not self.installed():
            raise RecognitionError("Only 4-bit GLM-OCR is allowed. Run setup-local-ocr.ps1; higher-precision and cloud fallback are disabled.")
        try:
            probe = await asyncio.create_subprocess_exec("nvidia-smi", "--query-gpu=memory.free", "--format=csv,noheader,nounits", stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
            output, _ = await asyncio.wait_for(probe.communicate(), timeout=5)
            if probe.returncode != 0 or int(output.decode().strip().splitlines()[0]) < 2300:
                raise RecognitionError("Free at least 2.3 GB of GPU memory before starting local OCR. No model was loaded.")
        except (OSError, ValueError, asyncio.TimeoutError) as error:
            raise RecognitionError("Cannot verify free NVIDIA GPU memory. Local OCR was not started.") from error
        try:
            with socket.socket() as probe_port:
                if os.name == "nt":
                    probe_port.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
                probe_port.bind(("127.0.0.1", 8078))
        except OSError as error:
            raise RecognitionError("Another OCR server owns port 8078. Stop the other Math Buddy server before retrying.") from error
        logs = ROOT / "artifacts"
        logs.mkdir(exist_ok=True)
        log_path = logs / "glm-ocr.log"
        self.log = log_path.open("wb")
        self.process = await asyncio.create_subprocess_exec(
            str(SERVER), "-m", str(MODEL), "--mmproj", str(VISION),
            "--alias", ocr_model(), "--host", "127.0.0.1", "--port", "8078",
            "--api-key", self.worker_key,
            "--device", "Vulkan0", "-ngl", "99", "--fit", "off", "--flash-attn", "off",
            "--image-max-tokens", "512", "--mtmd-batch-max-tokens", "512", "--no-warmup", "-lv", "4",
            "-c", "2048", "-np", "1", "-b", "128", "-ub", "128", "-t", "2",
            stdout=self.log, stderr=self.log, cwd=SERVER.parent,
            **({"creationflags": 0x08000000} if os.name == "nt" else {}))
        try:
            self.job = GPUJob(self.process.pid)
            for _ in range(300):
                if self.process.returncode is not None:
                    break
                try:
                    response = await client.get("/health", timeout=2)
                    if response.is_success:
                        text = log_path.read_text(encoding="utf-8", errors="replace")
                        layers = re.search(r"offloaded (\d+)/(\d+) layers to GPU", text)
                        if not layers or layers[1] != layers[2] or int(layers[1]) == 0 or "Vulkan0" not in text or "NVIDIA" not in text:
                            raise RecognitionError("GLM-OCR did not fully offload to the GPU. It was stopped; no CPU fallback is allowed.")
                        self.device = "NVIDIA GPU (Vulkan)"
                        return
                except (httpx.ConnectError, httpx.TimeoutException):
                    pass
                await asyncio.sleep(0.2)
            raise RecognitionError("4-bit GLM-OCR could not start. See artifacts/glm-ocr.log; no other model was loaded.")
        except BaseException:
            await self.close()
            raise

    async def recognize(self, content: bytes, purpose: Literal["question", "step"] = "step") -> dict[str, object]:
        if len(content) > MAX_IMAGE_BYTES:
            raise RecognitionError("Choose an image under 8 MB.", 413)
        image = await asyncio.to_thread(prepare_image, content)
        with Image.open(BytesIO(image)) as source:
            source.thumbnail((1024, 512))
            output = BytesIO()
            source.save(output, format="PNG")
            image = output.getvalue()
        try:
            await asyncio.wait_for(self.lock.acquire(), timeout=0.1)
        except asyncio.TimeoutError as error:
            raise RecognitionError("GLM-OCR is reading another image. Try again shortly.", 429) from error
        if self.idle_timer:
            self.idle_timer.cancel()
            self.idle_timer = None
        try:
            started = time.monotonic()
            async with httpx.AsyncClient(base_url=LOCAL_URL, timeout=httpx.Timeout(180, connect=3), trust_env=False,
                                        headers={"Authorization": "Bearer " + self.worker_key}) as client:
                await self.ensure_worker(client)
                response = await client.post("/v1/chat/completions", json={
                    "model": ocr_model(), "stream": False, "temperature": 0, "max_tokens": 512,
                    "messages": [{"role": "user", "content": [
                        {"type": "image_url", "image_url": {"url": "data:image/png;base64," + base64.b64encode(image).decode("ascii")}},
                        {"type": "text", "text": "Formula Recognition:" if purpose == "step" else "Text Recognition:"},
                    ]}],
                })
                response.raise_for_status()
                choice = response.json()["choices"][0]
                if choice.get("finish_reason") != "stop" or not isinstance(choice["message"]["content"], str):
                    raise RecognitionError("GLM-OCR could not finish this reading. Use a closer crop or type the math.", 422)
                return {"latex": clean_reading(choice["message"]["content"]), "engine": "GLM-OCR (local GPU)",
                        "model": ocr_model(), "device": self.device, "quantization": "Q4_K_M", "vision_quantization": "Q4_1",
                        "requires_confirmation": True, "elapsed_ms": round((time.monotonic() - started) * 1000)}
        except httpx.TimeoutException as error:
            await self.close()
            raise RecognitionError("Local GLM-OCR timed out and was stopped. Your writing is preserved; retry or type the math.", 504) from error
        except (httpx.HTTPError, ValueError, KeyError, IndexError, TypeError) as error:
            raise RecognitionError("Local GLM-OCR could not read this image. Your writing is preserved; retry or type the math.") from error
        finally:
            self.lock.release()
            if self.process and self.process.returncode is None:
                self.idle_timer = asyncio.get_running_loop().call_later(60, lambda: asyncio.create_task(self.close()))


glm_recognition = GLMRecognitionService()
