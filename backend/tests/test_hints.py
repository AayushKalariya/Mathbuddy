import json
import unittest
from unittest.mock import patch

from backend.config import GeminiSettings
from backend.tests import test_gemini as fixtures


def hint_reply(**changes):
    return {"kind": "hint", "hint": "Which rule applies to a composition of functions?",
            "next_step": None, "focus_step_number": None} | changes


class HintApiTests(unittest.IsolatedAsyncioTestCase):
    vendor = fixtures.GeminiApiTests.vendor
    asyncTearDown = fixtures.GeminiApiTests.asyncTearDown

    async def asyncSetUp(self):
        await fixtures.GeminiApiTests.asyncSetUp(self)
        self.hint_data = {"problem": "Differentiate sin(x^2) with respect to x", "current_step": "cos(x^2)",
                          "step_id": "step-a", "revision": 5, "context_revision": 2}

    async def test_question_hint_needs_no_written_steps_and_has_no_verdict(self):
        with self.vendor(hint_reply()):
            response = await self.client.post("/api/hint", json={"problem": "3x+8=20"})
        self.assertEqual(response.status_code, 200)
        result = response.json()
        self.assertEqual(result["step_id"], "question")
        self.assertEqual(result["level"], 1)
        self.assertEqual(result["reviewer"], "gemini")
        self.assertNotIn("status", result)
        self.assertNotIn("next_step", result)

    async def test_simple_and_calculus_hints_use_gemini(self):
        with self.vendor(hint_reply()):
            for problem in ("3x+8=20", self.hint_data["problem"]):
                response = await self.client.post("/api/hint", json=self.hint_data | {"problem": problem})
                self.assertEqual(response.status_code, 200)
                self.assertEqual(response.json()["revision"], 5)
                self.assertEqual(response.json()["context_revision"], 2)
        self.assertEqual(len(self.calls), 2)

    async def test_more_help_carries_prior_hint_and_complete_context(self):
        data = self.hint_data | {"history": ["d/dx sin(x^2)"], "level": 2, "previous_hints": ["Think about the chain rule."]}
        with self.vendor(hint_reply(hint="What factor comes from differentiating the inner expression?")):
            response = await self.client.post("/api/hint", json=data)
        self.assertEqual(response.status_code, 200)
        body = json.loads(self.calls[0].content)
        prompt = json.loads(body["contents"][0]["parts"][0]["text"])
        self.assertEqual(prompt["history"], data["history"])
        self.assertEqual(prompt["previous_hints"], data["previous_hints"])
        self.assertFalse(prompt["request_next_step"])

    async def test_suggested_line_only_on_explicit_third_level(self):
        data = self.hint_data | {"level": 3, "previous_hints": ["First nudge", "Second nudge"], "request_next_step": True}
        with self.vendor(hint_reply(kind="next_step", next_step=r"\cos(x^2)\cdot 2x")):
            response = await self.client.post("/api/hint", json=data)
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()["kind"], "next_step")
        self.assertIn("next_step", response.json())

    async def test_hidden_next_step_field_is_stripped(self):
        with self.vendor(hint_reply(next_step="DO NOT REVEAL THIS LINE")):
            response = await self.client.post("/api/hint", json=self.hint_data)
        self.assertEqual(response.status_code, 200)
        self.assertNotIn("next_step", response.json())
        self.assertNotIn("DO NOT REVEAL", response.text)

    async def test_wrong_kind_revealing_answer_is_rejected(self):
        with self.vendor(hint_reply(kind="next_step", next_step="DO NOT REVEAL")):
            response = await self.client.post("/api/hint", json=self.hint_data)
        self.assertEqual(response.status_code, 502)
        self.assertNotIn("DO NOT REVEAL", response.text)

    async def test_known_earlier_issue_suppresses_even_requested_next_step(self):
        data = self.hint_data | {"history": ["incorrect earlier line"], "earlier_issue_step": 1,
                                 "level": 3, "previous_hints": ["First nudge", "Second nudge"], "request_next_step": True}
        with self.vendor(hint_reply(kind="next_step", next_step="DO NOT REVEAL")):
            response = await self.client.post("/api/hint", json=data)
        result = response.json()
        self.assertEqual(result["kind"], "earlier_issue")
        self.assertEqual(result["focus_step_number"], 1)
        self.assertNotIn("next_step", result)
        self.assertNotIn("DO NOT REVEAL", response.text)

    async def test_discovered_earlier_issue_and_clarification_have_no_verdict(self):
        with self.vendor(hint_reply(kind="earlier_issue", focus_step_number=1)):
            response = await self.client.post("/api/hint", json=self.hint_data | {"history": ["prior line"]})
        self.assertEqual(response.json()["kind"], "earlier_issue")
        with self.vendor(hint_reply(kind="needs_clarification", hint="Is the exponent 2 or 3?")):
            response = await self.client.post("/api/hint", json=self.hint_data)
        self.assertEqual(response.json()["kind"], "needs_clarification")
        self.assertNotIn("status", response.json())

    async def test_invalid_scope_and_model_output_are_rejected(self):
        for reply in (hint_reply(kind="earlier_issue", focus_step_number=4), hint_reply(hint=""), {"bad": True}):
            with self.vendor(reply):
                response = await self.client.post("/api/hint", json=self.hint_data)
            self.assertEqual(response.status_code, 502)

    async def test_invalid_levels_and_history_never_call_gemini(self):
        for changes in ({"level": 3}, {"level": 2}, {"request_next_step": True}, {"level": 4},
                        {"level": 1, "previous_hints": ["not a first hint"]}, {"earlier_issue_step": 1},
                        {"history": [""]}, {"problem": " "}, {"revision": -1}):
            with self.vendor(hint_reply()):
                response = await self.client.post("/api/hint", json=self.hint_data | changes)
            self.assertEqual(response.status_code, 422)
        self.assertEqual(self.calls, [])

    async def test_hint_error_messages_are_safe_and_retryable(self):
        with self.vendor(code=429, raw={"error": {"message": fixtures.TEST_KEY}}):
            response = await self.client.post("/api/hint", json=self.hint_data)
        self.assertEqual(response.status_code, 429)
        self.assertNotIn(fixtures.TEST_KEY, response.text)
        with patch("backend.gemini.gemini_settings", return_value=GeminiSettings("")):
            response = await self.client.post("/api/hint", json=self.hint_data)
        self.assertEqual(response.status_code, 503)
        self.assertNotIn("hint", response.json())

    async def test_hint_request_size_is_bounded(self):
        response = await self.client.post("/api/hint", content=b" " * 32769)
        self.assertEqual(response.status_code, 413)
