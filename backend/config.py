"""Read server-only Gemini settings without exposing or logging credentials."""

from dataclasses import dataclass, field
import os
from pathlib import Path
import re

from dotenv import dotenv_values

ENV_FILE = Path(__file__).resolve().parents[1] / ".env"
DEFAULT_MODEL = "gemini-3.5-flash-lite"


def ocr_model() -> str:
    # Fixed precision: configuration cannot select a higher-precision model.
    return "glm-ocr-q4"


@dataclass(frozen=True)
class GeminiSettings:
    api_key: str = field(repr=False)
    model: str = DEFAULT_MODEL


def gemini_settings() -> GeminiSettings:
    # Re-read so saving .env works without restarting; process environment wins.
    values = dotenv_values(ENV_FILE, interpolate=False) if ENV_FILE.is_file() else {}
    key = (os.environ.get("GEMINI_API_KEY", values.get("GEMINI_API_KEY")) or "").strip()
    if key.lower() in {"your_api_key", "your_api_key_here", "paste_your_key_here"}:
        key = ""
    model = (os.environ.get("GEMINI_MODEL", values.get("GEMINI_MODEL")) or DEFAULT_MODEL).strip()
    if not re.fullmatch(r"gemini-[a-zA-Z0-9.\-]+", model):
        model = DEFAULT_MODEL
    return GeminiSettings(api_key=key, model=model)
