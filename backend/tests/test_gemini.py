"""Exercise the real Gemini request/response boundary without spending API quota."""

from contextlib import contextmanager
from io import BytesIO
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import httpx
from PIL import Image

from backend.app import app
from backend.config import GeminiSettings, gemini_settings
from backend.gemini import GeminiService

REAL_CLIENT = httpx.AsyncClient
TEST_KEY = "test-secret-never-expose"


def assessment(**changes):
    return {"status": "verified", "transition_status": "valid", "context_status": "consistent",
            "message": "This transformation is valid.", "hint": None, "warnings": [],
            "correction_available": False, "correction": None} | changes


class SettingsTests(unittest.TestCase):
    def test_env_reload_precedence_and_secret_repr(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / ".env"
            with patch("backend.config.ENV_FILE", path), patch.dict(os.environ, {}, clear=True):
                self.assertEqual(gemini_settings().api_key, "")
                path.write_text('GEMINI_API_KEY="file-key"\nGEMINI_MODEL=gemini-3.8-flash\n')
                self.assertEqual(gemini_settings().api_key, "file-key")
                self.assertNotIn("file-key", repr(gemini_settings()))
                path.write_text("GEMINI_API_KEY=new-key\nGEMINI_MODEL=../../bad\n")
                self.assertEqual(gemini_settings().api_key, "new-key")
                self.assertEqual(gemini_settings().model, "gemini-3.8-flash")
                with patch.dict(os.environ, {"GEMINI_API_KEY": "environment-key"}):
                    self.assertEqual(gemini_settings().api_key, "environment-key")

    def test_status_never_returns_key(self):
        with patch("backend.gemini.gemini_settings", return_value=GeminiSettings(TEST_KEY)):
            result = GeminiService().configuration()
        self.assertTrue(result["configured"])
        self.assertTrue(result["all_steps_use_gemini"])
        self.assertNotIn(TEST_KEY, json.dumps(result))


class GeminiApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = REAL_CLIENT(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.payload = {"problem": "3x+8=20", "previous_step": "3x+8=20", "new_step": "3x=12",
                        "step_id": "s1", "revision": 4, "context_revision": 2}
        self.calls = []

    async def asyncTearDown(self):
        await self.client.aclose()

    @contextmanager
    def vendor(self, result=None, *, code=200, finish="STOP", raw=None, error=None):
        def handle(request):
            self.calls.append(request)
            if error:
                raise error
            data = raw if raw is not None else {"candidates": [{"finishReason": finish,
                "content": {"parts": [{"text": json.dumps(result or assessment())}]}}]}
            return httpx.Response(code, json=data)
        transport = httpx.MockTransport(handle)
        with patch("backend.gemini.gemini_settings", return_value=GeminiSettings(TEST_KEY)), \
             patch("backend.gemini.httpx.AsyncClient", side_effect=lambda **kwargs: REAL_CLIENT(transport=transport, **kwargs)), \
             patch("backend.app.check_step", side_effect=AssertionError("Gemini route must not use local fallback")):
            yield

    async def test_easy_and_hard_steps_both_call_gemini(self):
        cases = [self.payload,
                 self.payload | {"problem": "Differentiate sin(x^2) with respect to x",
                                 "previous_step": "d/dx sin(x^2)", "new_step": "2x cos(x^2)"}]
        with self.vendor():
            for payload in cases:
                response = await self.client.post("/api/check-step", json=payload)
                self.assertEqual(response.status_code, 200)
                data = response.json()
                self.assertEqual(data["reviewer"], "gemini")
                self.assertEqual(data["status"], "verified")
                self.assertEqual((data["step_id"], data["revision"], data["context_revision"]), ("s1", 4, 2))
                self.assertNotIn(TEST_KEY, response.text)
        self.assertEqual(len(self.calls), 2)
        for request in self.calls:
            self.assertEqual(request.headers["x-goog-api-key"], TEST_KEY)
            self.assertEqual(str(request.url), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent")
            body = json.loads(request.content)
            self.assertIn("responseJsonSchema", body["generationConfig"])
            self.assertNotIn("tools", body)

    async def test_full_history_and_task_are_forwarded(self):
        payload = self.payload | {"history": ["3x+8-8=20-8"], "previous_step": "3x=12", "new_step": "x=4"}
        with self.vendor():
            response = await self.client.post("/api/check-step", json=payload)
        self.assertEqual(response.status_code, 200)
        submitted = json.loads(json.loads(self.calls[0].content)["contents"][0]["parts"][0]["text"])
        self.assertEqual(submitted["history"], payload["history"])
        self.assertEqual(submitted["problem"], payload["problem"])
        self.assertNotIn("step_id", submitted)

    async def test_correction_cannot_leak_until_requested(self):
        review = assessment(status="issue", transition_status="invalid", hint="Check the chain rule.",
                            correction_available=True, correction="2x cos(x^2)")
        with self.vendor(review):
            hidden = (await self.client.post("/api/check-step", json=self.payload)).json()
            shown = (await self.client.post("/api/check-step", json=self.payload | {"request_correction": True})).json()
        self.assertNotIn("correction", hidden)
        self.assertTrue(hidden["correction_available"])
        self.assertEqual(shown["correction"], "2x cos(x^2)")

    async def test_earlier_issue_cannot_get_green_result(self):
        with self.vendor(assessment(context_status="earlier_issue", correction_available=True, correction="x=4")):
            data = (await self.client.post("/api/check-step", json=self.payload)).json()
        self.assertEqual(data["status"], "issue")
        self.assertEqual(data["transition_status"], "valid")
        self.assertTrue(data["warnings"])
        self.assertTrue(data["can_continue"])
        self.assertFalse(data["correction_available"])
        self.assertNotIn("correction", data)

    async def test_inconsistent_positive_is_not_verified(self):
        with self.vendor(assessment(transition_status="unresolved")):
            data = (await self.client.post("/api/check-step", json=self.payload)).json()
        self.assertEqual(data["status"], "needs_clarification")
        self.assertEqual(data["transition_status"], "unresolved")

    async def test_incomplete_and_unclear_are_non_verdicts(self):
        for status in ("incomplete", "needs_clarification", "unsupported"):
            with self.vendor(assessment(status=status, transition_status="unresolved", context_status="unresolved")):
                data = (await self.client.post("/api/check-step", json=self.payload)).json()
            self.assertEqual(data["status"], status)
            self.assertEqual(data["transition_status"], "unresolved")

    async def test_missing_key_does_not_fall_back_even_for_easy_math(self):
        with patch("backend.gemini.gemini_settings", return_value=GeminiSettings("")), \
             patch("backend.app.check_step", side_effect=AssertionError("No local fallback")):
            response = await self.client.post("/api/check-step", json=self.payload)
        self.assertEqual(response.status_code, 503)
        self.assertIn("GEMINI_API_KEY", response.json()["detail"])
        self.assertNotIn("status", response.json())

    async def test_browser_status_and_static_routes_never_expose_env(self):
        with patch("backend.gemini.gemini_settings", return_value=GeminiSettings(TEST_KEY)):
            response = await self.client.get("/api/recognition-status")
        self.assertTrue(response.json()["configured"])
        self.assertNotIn(TEST_KEY, response.text)
        for path in ("/.env", "/assets/.env"):
            self.assertEqual((await self.client.get(path)).status_code, 404)

    async def test_vendor_errors_are_safe_and_never_math_verdicts(self):
        for code, expected in [(400, 502), (401, 503), (403, 503), (404, 503), (429, 429), (500, 503)]:
            with self.vendor(code=code, raw={"error": {"message": TEST_KEY}}):
                response = await self.client.post("/api/check-step", json=self.payload)
            self.assertEqual(response.status_code, expected)
            self.assertNotIn(TEST_KEY, response.text)
            self.assertNotIn("status", response.json())

    async def test_network_and_timeout_errors_preserve_clear_failure(self):
        for error, expected in [(httpx.ConnectError(TEST_KEY), 503), (httpx.ReadTimeout(TEST_KEY), 504)]:
            with self.vendor(error=error):
                response = await self.client.post("/api/check-step", json=self.payload)
            self.assertEqual(response.status_code, expected)
            self.assertNotIn(TEST_KEY, response.text)

    async def test_blocked_truncated_malformed_and_wrong_schema_responses(self):
        for raw in ({"promptFeedback": {"blockReason": "SAFETY"}},
                    {"candidates": [{"finishReason": "MAX_TOKENS", "content": {"parts": [{"text": "{}"}]}}]},
                    {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "not JSON"}]}}]},
                    {"candidates": [{"finishReason": "STOP", "content": {"parts": [{"text": "{}"}]}}]}):
            with self.vendor(raw=raw):
                response = await self.client.post("/api/check-step", json=self.payload)
            self.assertEqual(response.status_code, 502)
            self.assertNotIn("status", response.json())

    async def test_step_and_question_images_use_gemini_and_require_confirmation(self):
        output = BytesIO()
        Image.new("RGB", (12, 12), "black").save(output, format="PNG")
        with self.vendor({"readable": True, "latex": r"2x\cos(x^2)", "message": ""}):
            for purpose in ("step", "question"):
                response = await self.client.post(f"/api/recognize?purpose={purpose}", content=output.getvalue(), headers={"Content-Type": "image/png"})
                self.assertEqual(response.status_code, 200)
                self.assertTrue(response.json()["requires_confirmation"])
                self.assertEqual(response.json()["engine"], "Gemini")
        first = json.loads(self.calls[0].content)
        self.assertEqual(first["contents"][0]["parts"][1]["inlineData"]["mimeType"], "image/png")
        second = json.loads(self.calls[1].content)
        self.assertIn("task words", second["systemInstruction"]["parts"][0]["text"])

    async def test_ambiguous_image_requests_clarification_without_verdict(self):
        output = BytesIO()
        Image.new("RGB", (12, 12), "black").save(output, format="PNG")
        with self.vendor({"readable": False, "latex": "", "message": "Is that x or y?"}):
            response = await self.client.post("/api/recognize", content=output.getvalue(), headers={"Content-Type": "image/png"})
        self.assertEqual(response.status_code, 422)
        self.assertNotIn("status", response.json())

    async def test_invalid_inputs_do_not_send_requests(self):
        with self.vendor():
            self.assertEqual((await self.client.post("/api/check-step", json=self.payload | {"revision": -1})).status_code, 422)
            self.assertEqual((await self.client.post("/api/check-step", content=b"x" * 32769)).status_code, 413)
            self.assertEqual((await self.client.post("/api/recognize", content=b"x", headers={"Content-Type": "image/svg+xml"})).status_code, 415)
            self.assertEqual((await self.client.post("/api/recognize", content=b"x", headers={"Content-Type": "image/png"})).status_code, 415)
            self.assertEqual((await self.client.post("/api/recognize", content=b"x" * (8 * 1024 * 1024 + 1))).status_code, 413)
        self.assertEqual(self.calls, [])


if __name__ == "__main__":
    unittest.main()
