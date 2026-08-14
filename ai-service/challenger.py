"""
DeepSeek Challenger — acts exclusively as an agricultural risk auditor.
Every objection must cite a field and value from the supplied evidence.
Returns valid JSON only (no markdown, no prose).
"""
from __future__ import annotations
import json
import os
import requests

_DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
_MODEL = "deepseek-chat"

_SYSTEM_PROMPT = """You are an agricultural risk auditor. Your only job is to find evidence-backed risks in the proposed recommendation.

RULES — NEVER BREAK THESE:
1. Every objection MUST cite a specific field name and its value from the evidence object you receive.
2. Never invent numbers or claim data not present in the evidence.
3. If you cannot find evidence-backed risk, return {"challenged": false, "severity": "none", "reason": "No evidence-backed risk found", "cited_evidence": [], "recommended_action": "PROCEED"}.
4. Allowed recommended_action values: WAIT, HOLD, REDUCE_DOSE, PROCEED.
5. Return ONLY valid JSON. No markdown. No prose before or after.

QUANTITATIVE THRESHOLDS — do not raise an objection below these:
  next3DayRainfall below 15mm       -> NOT a valid rainfall objection, whatever the probability
  temperature below the crop's upper limit -> NOT a valid heat objection
  soilTestedOn younger than 90 days -> NOT a valid staleness objection

Rain PROBABILITY alone is never sufficient. The AMOUNT must exceed the threshold.
A 95% chance of 5mm is a light shower, not a reason to delay fertiliser.
If nothing crosses a threshold, return challenged: false.

OUTPUT SCHEMA:
{
  "challenged": boolean,
  "severity": "none" | "low" | "medium" | "high",
  "reason": string,
  "cited_evidence": [{"field": string, "value": string | number}],
  "recommended_action": "WAIT" | "HOLD" | "REDUCE_DOSE" | "PROCEED"
}"""


def challenge(recommendation: str, evidence: dict) -> dict:
    """
    Call DeepSeek to challenge a recommendation.
    Falls back to a safe default if the API call fails.
    """
    api_key = os.environ.get("DEEPSEEK_API_KEY", "")
    if not api_key:
        return _no_challenge("DeepSeek API key not configured")

    user_content = json.dumps({
        "recommendation": recommendation,
        "evidence": evidence,
    }, ensure_ascii=False)

    payload = {
        "model": _MODEL,
        "messages": [
            {"role": "system", "content": _SYSTEM_PROMPT},
            {"role": "user", "content": user_content},
        ],
        "temperature": 0.1,
        "max_tokens": 512,
        "response_format": {"type": "json_object"},
    }

    try:
        resp = requests.post(
            _DEEPSEEK_API_URL,
            headers={"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"},
            json=payload,
            timeout=30,
        )
        resp.raise_for_status()
        raw_content = resp.json()["choices"][0]["message"]["content"]
        result = json.loads(raw_content)
        # Validate required keys
        _validate_challenger_output(result)
        return result
    except requests.RequestException as exc:
        return _no_challenge(f"API error: {exc}")
    except (KeyError, json.JSONDecodeError, ValueError) as exc:
        return _no_challenge(f"Parse error: {exc}")


def _validate_challenger_output(result: dict) -> None:
    required = {"challenged", "severity", "reason", "cited_evidence", "recommended_action"}
    missing = required - set(result.keys())
    if missing:
        raise ValueError(f"Challenger output missing keys: {missing}")
    valid_actions = {"WAIT", "HOLD", "REDUCE_DOSE", "PROCEED"}
    if result["recommended_action"] not in valid_actions:
        raise ValueError(f"Invalid recommended_action: {result['recommended_action']}")


def _no_challenge(reason: str) -> dict:
    return {
        "challenged": False,
        "severity": "none",
        "reason": reason,
        "cited_evidence": [],
        "recommended_action": "PROCEED",
    }
