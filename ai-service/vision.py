"""
Crop photo diagnostics — identifies the crop, its growth stage, and any visible
problems, with a severity and a location on the plant for each one.

Provider note: this used to call DeepSeek, which cannot do it. DeepSeek's chat
API is text-only and rejects an image outright with
`unknown variant 'image_url', expected 'text'`, so every upload failed and fell
through to the "image unusable" stub. It now calls Groq, which serves a
multimodal model and is already the provider behind the KrishiBot assistant.

Two Groq quirks the request below works around:
  * the model emits <think> reasoning blocks, which break JSON-mode validation
    — `reasoning_effort: none` turns them off
  * images are token-expensive against a per-minute budget, so photos are
    downscaled hard before encoding
"""
from __future__ import annotations

import base64
import json
import os
import re
from io import BytesIO

import requests
from PIL import Image

_GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions"

# The only model on the account that accepts image content. Overridable so a
# better one can be swapped in without a code change.
_MODEL = os.environ.get("VISION_MODEL", "qwen/qwen3.6-27b")

# Images dominate the token budget, and crop symptoms stay legible well below
# camera resolution. 768px keeps lesions and leaf margins readable.
_MAX_EDGE = 768
_JPEG_QUALITY = 80

_REQUEST_TIMEOUT_S = 60

SEVERITIES = ("none", "low", "moderate", "severe")
STAGES = ("seedling", "vegetative", "flowering", "grain_filling", "mature", "unknown")

_SYSTEM_PROMPT = """You are an agricultural image analyst for Indian farmers. Analyse the crop photo and return ONLY valid JSON.

SCHEMA:
{
  "crop": string,                  // best guess, or "unknown"
  "confidence": number,            // 0.0-1.0, your confidence in the crop identification
  "stage": "seedling" | "vegetative" | "flowering" | "grain_filling" | "mature" | "unknown",
  "problems": [
    {
      "name": string,              // e.g. "leaf rust", "nitrogen deficiency", "stem borer damage"
      "severity": "low" | "moderate" | "severe",
      "location": string,          // WHERE on the plant, e.g. "lower leaves", "leaf tips", "stem base", "panicle"
      "coverage_pct": number,      // 0-100, roughly how much of the visible crop shows this
      "evidence": string           // what in the image made you say this, in one short clause
    }
  ],
  "overall_severity": "none" | "low" | "moderate" | "severe",
  "image_usable": boolean,
  "notes": string                  // one or two sentences for the farmer
}

RULES:
- Report only what is VISIBLE. Never infer a disease you cannot see evidence for.
- If the photo is blurred, too dark, not a crop, or an illustration rather than a
  photograph, set image_usable false, problems to [], and say why in notes.
- An empty problems list with overall_severity "none" is a valid, useful answer.
- Prefer a named nutrient deficiency or pest over a vague "discoloration".
- Keep notes plain and practical. No hedging paragraphs, no markdown."""


def _encode(image_bytes: bytes) -> str:
    """Downscale, flatten to RGB and base64-encode. Raises on an unreadable file."""
    img = Image.open(BytesIO(image_bytes))
    # Phone photos carry orientation in EXIF; without this a sideways photo is
    # analysed sideways.
    try:
        from PIL import ImageOps

        img = ImageOps.exif_transpose(img)
    except Exception:
        pass
    if img.mode != "RGB":
        img = img.convert("RGB")
    img.thumbnail((_MAX_EDGE, _MAX_EDGE))

    buffer = BytesIO()
    img.save(buffer, format="JPEG", quality=_JPEG_QUALITY)
    return base64.b64encode(buffer.getvalue()).decode("utf-8")


def _strip_wrappers(content: str) -> str:
    """Remove reasoning blocks and markdown fences the model may still emit."""
    content = re.sub(r"<think>.*?</think>", "", content, flags=re.S)
    content = re.sub(r"^```(?:json)?|```$", "", content.strip(), flags=re.M)
    return content.strip()


def _coerce(raw: dict) -> dict:
    """
    Normalise the model's output onto the documented schema.

    The UI renders severity as a colour and location as a caption, so an
    unexpected value has to become a known one here rather than reaching React.
    """
    stage = str(raw.get("stage", "unknown")).strip().lower().replace(" ", "_")
    if stage not in STAGES:
        stage = "unknown"

    problems = []
    for item in raw.get("problems") or []:
        if not isinstance(item, dict):
            continue
        severity = str(item.get("severity", "low")).strip().lower()
        if severity not in SEVERITIES:
            severity = "low"
        try:
            coverage = float(item.get("coverage_pct", 0) or 0)
        except (TypeError, ValueError):
            coverage = 0.0
        problems.append({
            "name": str(item.get("name", "unspecified")).strip(),
            "severity": severity,
            "location": str(item.get("location", "") or "").strip(),
            "coverage_pct": max(0.0, min(100.0, coverage)),
            "evidence": str(item.get("evidence", "") or "").strip(),
        })

    overall = str(raw.get("overall_severity", "none")).strip().lower()
    if overall not in SEVERITIES:
        overall = "none"
    # A model that lists problems but calls the whole thing "none" is
    # contradicting itself; trust the individual findings.
    if problems and overall == "none":
        overall = max((p["severity"] for p in problems), key=SEVERITIES.index)

    try:
        confidence = float(raw.get("confidence", 0) or 0)
    except (TypeError, ValueError):
        confidence = 0.0

    usable = bool(raw.get("image_usable", True))
    if not usable:
        problems = []
        overall = "none"

    # `str(None)` is the string "None", which would render as a crop name.
    crop = raw.get("crop")
    crop = str(crop).strip() if crop is not None else ""

    return {
        "crop": crop or "unknown",
        "confidence": max(0.0, min(1.0, confidence)),
        "stage": stage,
        "problems": problems,
        "overall_severity": overall,
        "image_usable": usable,
        "notes": str(raw.get("notes", "") or "").strip(),
        "model": _MODEL,
    }


def analyse_image(image_bytes: bytes) -> dict:
    """
    Diagnose a crop photo. Never raises — a failure returns an unusable result
    with the reason in `notes`, because a failed photo must not break the
    field-detail page it is uploaded from.
    """
    api_key = os.environ.get("GROQ_API_KEY", "")
    if not api_key:
        return _unusable("Vision service is not configured (GROQ_API_KEY missing)")

    try:
        encoded = _encode(image_bytes)
    except Exception as exc:
        return _unusable(f"Could not read that image file: {exc}")

    payload = {
        "model": _MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {
                "role": "user",
                "content": [
                    {"type": "image_url",
                     "image_url": {"url": f"data:image/jpeg;base64,{encoded}"}},
                    {"type": "text", "text": "Analyse this crop photo."},
                ],
            },
        ],
        "temperature": 0.1,
        "max_tokens": 1200,
        # Without this the model wraps its answer in <think>...</think> and
        # Groq's JSON validator rejects the whole generation.
        "reasoning_effort": "none",
        "response_format": {"type": "json_object"},
    }

    try:
        resp = requests.post(
            _GROQ_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=_REQUEST_TIMEOUT_S,
        )
        if resp.status_code == 429:
            return _unusable("Vision service is busy right now — try again in a minute")
        resp.raise_for_status()
        content = resp.json()["choices"][0]["message"]["content"]
        return _coerce(json.loads(_strip_wrappers(content)))
    except requests.RequestException as exc:
        return _unusable(f"Vision service unreachable: {exc}")
    except (KeyError, ValueError) as exc:
        return _unusable(f"Could not read the analysis result: {exc}")


def _unusable(reason: str) -> dict:
    return {
        "crop": "unknown",
        "confidence": 0.0,
        "stage": "unknown",
        "problems": [],
        "overall_severity": "none",
        "image_usable": False,
        "notes": reason,
        "model": _MODEL,
    }
