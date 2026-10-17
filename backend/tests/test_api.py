import unittest
from io import BytesIO
from unittest.mock import AsyncMock, patch
from pathlib import Path

import httpx
from PIL import Image

from backend.app import app
from backend.recognition.service import RecognitionError


class ApiTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client = httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://testserver")
        self.payload = {"problem": "3(x+2)=15", "previous_step": "3x+6=15", "new_step": "3x=11"}

    async def asyncTearDown(self):
        await self.client.aclose()

    async def test_health_and_root(self):
        self.assertEqual((await self.client.get("/api/health")).json()["status"], "ok")
        response = await self.client.get("/")
        if (Path(__file__).resolve().parents[2] / "frontend/dist/index.html").is_file():
            self.assertEqual(response.status_code, 200)
            self.assertIn('id="root"', response.text)
        else:
            self.assertEqual(response.status_code, 503)
            self.assertIn("Build the workspace", response.json()["detail"])

    async def test_issue_and_explicit_correction(self):
        response = await self.client.post("/api/local/check-step", json=self.payload)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "issue")
        self.assertNotIn("correction", response.json())
        revealed = await self.client.post("/api/local/check-step", json=self.payload | {"request_correction": True})
        self.assertEqual(revealed.json()["correction"], "3*x = 9")

    async def test_verified_response_and_revisions(self):
        data = self.payload | {"new_step": "3x=9", "step_id": "step-2", "revision": 4, "context_revision": 3}
        result = (await self.client.post("/api/local/check-step", json=data)).json()
        self.assertEqual(result["status"], "verified")
        self.assertEqual((result["step_id"], result["revision"], result["context_revision"]), ("step-2", 4, 3))

    async def test_history_warning_and_continue(self):
        result = (await self.client.post("/api/local/check-step", json=self.payload | {
            "previous_step": "3x=11", "new_step": "x=11/3"})).json()
        self.assertEqual(result["context_status"], "earlier_issue")
        self.assertEqual(result["transition_status"], "valid")
        self.assertTrue(result["can_continue"])

    async def test_input_states_are_not_http_errors(self):
        for current, expected in [("3x=", "incomplete"), ("x^2=4", "unsupported"), ("x<3", "needs_clarification")]:
            response = await self.client.post("/api/local/check-step", json=self.payload | {"new_step": current})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()["status"], expected)

    async def test_bad_contracts_return_validation_error(self):
        for data in ({}, self.payload | {"new_step": 7}, self.payload | {"revision": -1},
                     self.payload | {"request_correction": "yes"}, self.payload | {"unknown": True}):
            self.assertEqual((await self.client.post("/api/local/check-step", json=data)).status_code, 422)

    async def test_large_request_is_bounded(self):
        response = await self.client.post("/api/local/check-step", content=b" "*32769,
                                          headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)

    async def test_chunked_request_is_also_bounded(self):
        async def chunks():
            yield b" "*20000
            yield b" "*20000

        response = await self.client.post("/api/local/check-step", content=chunks(),
                                          headers={"Content-Type": "application/json"})
        self.assertEqual(response.status_code, 413)

    async def test_docs_and_assets_are_local(self):
        html = (await self.client.get("/docs")).text
        self.assertIn('/docs-assets/swagger-ui-bundle.js', html)
        self.assertNotIn('src="https://', html)
        self.assertNotIn('href="https://', html)
        for path in ("swagger-ui-bundle.js", "swagger-ui.css"):
            self.assertEqual((await self.client.get("/docs-assets/" + path)).status_code, 200)

    async def test_openapi_is_valid(self):
        schema = (await self.client.get("/openapi.json")).json()
        self.assertIn("/api/local/check-step", schema["paths"])
        self.assertIn("history", schema["components"]["schemas"]["CheckRequest"]["properties"])

    async def test_recognized_latex_bridge(self):
        response = await self.client.post("/api/local/check-step", json={
            "problem": r"\frac{x}{2}=3", "previous_step": r"\frac{x}{2}=3",
            "new_step": "x=6", "input_format": "latex"})
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["status"], "verified")

    async def test_recognition_status(self):
        response = await self.client.get("/api/recognition-status")
        self.assertEqual(response.status_code, 200)
        self.assertIsInstance(response.json()["configured"], bool)

    async def test_image_upload_uses_recognition_boundary(self):
        output = BytesIO()
        Image.new("RGB", (12, 12), "black").save(output, format="PNG")
        with patch("backend.app.recognition.recognize", new=AsyncMock(return_value={
            "latex": "3x=9", "requires_confirmation": True, "device": "cpu", "elapsed_ms": 50
        })) as recognize:
            response = await self.client.post("/api/local/recognize", content=output.getvalue(), headers={"Content-Type": "image/png"})
            self.assertEqual(response.status_code, 200)
            self.assertTrue(response.json()["requires_confirmation"])
            recognize.assert_awaited_once_with(output.getvalue())

    async def test_recognition_error_is_not_math_verdict(self):
        with patch("backend.app.recognition.recognize", new=AsyncMock(side_effect=RecognitionError("Model unavailable"))):
            response = await self.client.post("/api/local/recognize", content=b"test", headers={"Content-Type": "image/png"})
            self.assertEqual(response.status_code, 503)
            self.assertNotIn("status", response.json())

    async def test_reject_non_image_upload(self):
        response = await self.client.post("/api/local/recognize", content=b"<svg/>", headers={"Content-Type": "image/svg+xml"})
        self.assertEqual(response.status_code, 415)

    async def test_image_body_limit(self):
        response = await self.client.post("/api/local/recognize", content=b"x" * (8 * 1024 * 1024 + 1), headers={"Content-Type": "image/png"})
        self.assertEqual(response.status_code, 413)

    async def test_image_allowance_does_not_expand_checker_limit(self):
        with patch("backend.app.recognition.recognize", new=AsyncMock(return_value={"latex": "x"})):
            response = await self.client.post("/api/local/recognize", content=b"x" * 40000, headers={"Content-Type": "image/png"})
            self.assertEqual(response.status_code, 200)
        response = await self.client.post("/api/local/check-step", content=b"x" * 40000)
        self.assertEqual(response.status_code, 413)


if __name__ == "__main__":
    unittest.main()
