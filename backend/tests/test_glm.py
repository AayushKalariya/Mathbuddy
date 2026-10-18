"""Local OCR transport, GPU enforcement, image limits, and cloud separation."""
from contextlib import contextmanager
from io import BytesIO
import base64
import json
from pathlib import Path
import struct
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch, AsyncMock

import httpx
from PIL import Image

from backend.app import app
from backend.recognition.glm import GLMRecognitionService, clean_reading, quantization
from backend.recognition.service import RecognitionError

REAL_CLIENT = httpx.AsyncClient
MODEL = "glm-ocr-q4"


class GLMTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = REAL_CLIENT(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.calls = []
        output = BytesIO()
        Image.new("RGB", (20, 20), "black").save(output, format="PNG")
        self.image = output.getvalue()

    async def asyncTearDown(self):
        await self.client.aclose()

    @contextmanager
    def local(self, reading=r"\[3x=15\]", *, gpu=True, installed=True, code=200, done=True, reason="stop"):
        def handle(request):
            self.calls.append(request)
            self.assertEqual(request.url.host, "127.0.0.1")
            self.assertEqual(request.url.port, 8078)
            self.assertNotIn("x-goog-api-key", request.headers)
            if request.url.path == "/api/tags":
                return httpx.Response(200, json={"models": [{"name": MODEL}] if installed else []})
            if request.url.path == "/api/ps":
                return httpx.Response(200, json={"models": [{"name": MODEL, "size_vram": 500000000 if gpu else 0}]})
            return httpx.Response(code, json={"choices": [{"message": {"content": reading}, "finish_reason": reason if done else "length"}]})
        with patch("backend.recognition.glm.ocr_model", return_value=MODEL), \
             patch("backend.recognition.glm.GLMRecognitionService.installed", return_value=installed), \
             patch("backend.recognition.glm.GLMRecognitionService.ensure_worker", new=AsyncMock()), \
             patch("backend.recognition.glm.httpx.AsyncClient", side_effect=lambda *a, **kw: REAL_CLIENT(*a, **(kw | {"transport": httpx.MockTransport(handle)}))), \
             patch("backend.app.gemini.recognize", side_effect=AssertionError("OCR must never call Gemini")):
            yield

    async def test_steps_and_questions_use_local_gpu_and_remain_unconfirmed(self):
        with self.local():
            for purpose in ("step", "question"):
                response = await self.client.post(f"/api/recognize?purpose={purpose}", content=self.image, headers={"Content-Type": "image/png"})
                self.assertEqual(response.status_code, 200, response.text)
                data = response.json()
                self.assertEqual(data["latex"], "3x=15")
                self.assertEqual(data["quantization"], "Q4_K_M")
                self.assertEqual(data["vision_quantization"], "Q4_1")
                self.assertTrue(data["requires_confirmation"])
                self.assertNotIn("status", data)
        reads = [json.loads(call.content) for call in self.calls if call.method == "POST"]
        self.assertEqual([body["messages"][0]["content"][1]["text"] for body in reads], ["Formula Recognition:", "Text Recognition:"])
        for body in reads:
            self.assertFalse(body["stream"])
            self.assertEqual(body["max_tokens"], 512)
            self.assertTrue(base64.b64decode(body["messages"][0]["content"][0]["image_url"]["url"].split(",",1)[1]).startswith(b"\x89PNG"))

    async def test_status_checks_installed_model_without_inference(self):
        for installed in (False, True):
            with self.local(installed=installed):
                response = await self.client.get("/api/recognition-status")
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["configured"], installed)
                self.assertEqual(response.json()["model"], MODEL)
                self.assertIn("review_configured", response.json())
        self.assertTrue(all(call.method == "GET" for call in self.calls))

    async def test_higher_precision_is_rejected_before_starting_a_worker(self):
        service = GLMRecognitionService()
        with patch.object(service, "installed", return_value=False), self.assertRaises(RecognitionError) as caught:
            await service.ensure_worker(None)
        self.assertIn("Only 4-bit", str(caught.exception))
        self.assertIsNone(service.process)

    async def test_low_vram_prevents_loading_any_model(self):
        service = GLMRecognitionService()
        probe = SimpleNamespace(returncode=0, communicate=AsyncMock(return_value=(b"1024\n", b"")))
        with patch.object(service, "installed", return_value=True), \
             patch("backend.recognition.glm.asyncio.create_subprocess_exec", new=AsyncMock(return_value=probe)) as spawn, \
             self.assertRaises(RecognitionError) as caught:
            await service.ensure_worker(None)
        self.assertIn("2.3 GB", str(caught.exception))
        self.assertIsNone(service.process)
        self.assertEqual(spawn.await_count, 1)
        self.assertEqual(spawn.call_args.args[0], "nvidia-smi")

    def test_precision_is_checked_in_metadata_not_just_the_filename(self):
        with tempfile.TemporaryDirectory() as directory:
            model, vision, runtime = [Path(directory) / name for name in ("decoder.gguf", "vision.gguf", "server.exe")]
            runtime.touch()
            def gguf(path, precision):
                name = b"general.file_type"
                path.write_bytes(b"GGUF" + struct.pack("<IQQQ", 3, 0, 1, len(name)) + name + struct.pack("<II", 4, precision))
            gguf(model, 15)
            gguf(vision, 3)
            with patch("backend.recognition.glm.MODEL", model), patch("backend.recognition.glm.VISION", vision), patch("backend.recognition.glm.SERVER", runtime):
                self.assertEqual(quantization(model), 15)
                self.assertTrue(GLMRecognitionService().installed())
                for wrong in (0, 1, 7):
                    gguf(model, wrong)
                    self.assertFalse(GLMRecognitionService().installed())
                gguf(model, 15)
                gguf(vision, 7)
                self.assertFalse(GLMRecognitionService().installed())

    async def test_missing_model_and_truncated_readings_do_not_return_math(self):
        for kwargs, expected in (({"code": 404}, 503), ({"done": False}, 422), ({"reason": "length"}, 422), ({"reading": "a" * 257}, 422), ({"reading": ""}, 422)):
            with self.subTest(kwargs=kwargs), self.local(**kwargs):
                response = await self.client.post("/api/recognize", content=self.image, headers={"Content-Type": "image/png"})
                self.assertEqual(response.status_code, expected)
                self.assertNotIn("latex", response.json())

    async def test_invalid_and_blank_images_make_no_model_request(self):
        output = BytesIO()
        Image.new("RGB", (20, 20), "white").save(output, format="PNG")
        with self.local():
            for content, expected in ((b"invalid", 415), (output.getvalue(), 422), (b"x" * (8 * 1024 * 1024 + 1), 413)):
                response = await self.client.post("/api/recognize", content=content, headers={"Content-Type": "image/png"})
                self.assertEqual(response.status_code, expected)
        self.assertEqual(self.calls, [])

    async def test_busy_reader_rejects_unbounded_queue(self):
        service = GLMRecognitionService()
        await service.lock.acquire()
        try:
            with self.local(), self.assertRaises(RecognitionError) as caught:
                await service.recognize(self.image)
            self.assertEqual(caught.exception.status_code, 429)
            self.assertEqual(self.calls, [])
        finally:
            service.lock.release()

    def test_cleanup_preserves_wrong_math_without_solving_it(self):
        self.assertEqual(clean_reading("```latex\n3x=14\n```"), "3x=14")
        self.assertEqual(clean_reading("$x = -5$"), "x = -5")
