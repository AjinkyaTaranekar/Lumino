"""
Shared LLM call utilities.

Handles the Anthropic/non-Anthropic split:
  - Non-Anthropic models (Groq, Gemini, OpenAI, …): pass response_format=json_object
    so the model is constrained to output JSON.
  - Anthropic models (claude-*): use the prefill technique — inject an assistant
    turn starting with "{" so the model is forced to continue as JSON, then
    restore the leading brace before parsing.

Use `acompletion_json()` as a drop-in replacement for any acompletion call that
expects a JSON response. It returns the raw JSON string (no Pydantic parsing).
"""

from __future__ import annotations

import json
import logging
import re

logger = logging.getLogger(__name__)

_JSON_REMINDER = (
    "\n\nCRITICAL: Your response MUST be a single valid JSON object. "
    "No prose, no markdown, no explanation before or after. "
    "Start your response with { and end with }."
)


def is_anthropic(model: str) -> bool:
    """Return True for any Anthropic / Claude model identifier."""
    lower = model.lower()
    return "anthropic" in lower or lower.startswith("claude")


def extract_json(raw: str) -> str:
    """
    Extract a JSON object from a model response that may contain prose or markdown.

    Priority:
      1. Parse as-is (pure JSON — fastest path)
      2. Strip ```json … ``` fences
      3. Find outermost { … } in prose
      4. Return raw — caller will get a clear validation error
    """
    if not raw:
        return raw

    # 1. Try as-is
    try:
        parsed = json.loads(raw)
        if isinstance(parsed, list) and parsed:
            return json.dumps(parsed[0])
        return raw
    except json.JSONDecodeError:
        pass

    # 2. Fenced code block — greedy to handle nested braces inside the JSON
    fenced = re.search(r"```(?:json)?\s*(\{.+\})\s*```", raw, re.DOTALL)
    if fenced:
        candidate = fenced.group(1)
        try:
            json.loads(candidate)
            return candidate
        except json.JSONDecodeError:
            pass

    # 3. Outermost { … } — walk to find the matching closing brace
    start = raw.find("{")
    if start != -1:
        depth = 0
        in_string = False
        escape_next = False
        for i, ch in enumerate(raw[start:], start):
            if escape_next:
                escape_next = False
                continue
            if ch == "\\" and in_string:
                escape_next = True
                continue
            if ch == '"':
                in_string = not in_string
                continue
            if in_string:
                continue
            if ch == "{":
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0:
                    candidate = raw[start:i + 1]
                    try:
                        parsed = json.loads(candidate)
                        if isinstance(parsed, list) and parsed:
                            return json.dumps(parsed[0])
                        return candidate
                    except json.JSONDecodeError:
                        break

    logger.warning(
        "extract_json: could not find valid JSON in response (first 200 chars): %s",
        raw[:200],
    )
    return raw


async def acompletion_json(model: str, messages: list, temperature: float = 1.0, **kwargs) -> str:
    """
    Call acompletion and return a clean JSON string.

    For Anthropic models:
      - Appends a JSON-only reminder to the last system message (or adds one).
      - Uses the prefill technique: injects {"role": "assistant", "content": "{"}
        so the model is forced to start its response with "{".
      - Restores the leading brace and parses.

    For all other models:
      - Passes response_format={"type": "json_object"}.
    """
    from litellm import acompletion

    msgs = list(messages)  # don't mutate caller's list

    if is_anthropic(model):
        # 1. Inject JSON reminder into the system prompt
        injected = False
        for i, m in enumerate(msgs):
            if m.get("role") == "system":
                msgs[i] = {**m, "content": m["content"] + _JSON_REMINDER}
                injected = True
                break
        if not injected:
            msgs.insert(0, {"role": "system", "content": _JSON_REMINDER.strip()})

        # 2. Prefill: force the model to start its response with "{"
        msgs.append({"role": "assistant", "content": "{"})

        resp = await acompletion(model=model, messages=msgs, temperature=temperature, **kwargs)
        raw = resp.choices[0].message.content or ""
        # The prefilled "{" is NOT included in the completion — prepend it back
        raw = "{" + raw
    else:
        resp = await acompletion(
            model=model,
            messages=msgs,
            temperature=temperature,
            response_format={"type": "json_object"},
            **kwargs,
        )
        raw = resp.choices[0].message.content or ""

    return extract_json(raw)
