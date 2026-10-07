"""Thin async wrapper around the GroqCloud OpenAI-compatible chat API."""
from __future__ import annotations

from openai import (
    AsyncOpenAI,
    APITimeoutError,
    APIConnectionError,
    RateLimitError,
)
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL, GROQ_REASONING_EFFORT

# The client is created even without a key so the service boots; calls raise a clear
# error (→ router returns 502 → Express falls back to its TypeScript stub).
_client = AsyncOpenAI(api_key=GROQ_API_KEY or "missing-key", base_url=GROQ_BASE_URL)


class GroqNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(GROQ_API_KEY)


# Retry only on TRANSIENT failures. 4xx (e.g. BadRequestError) are deterministic —
# retrying them wastes budget and hides the real error, so they propagate immediately.
@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.5, max=4),
    retry=retry_if_exception_type((APITimeoutError, APIConnectionError, RateLimitError)),
)
async def chat_json(
    system: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.2,
) -> str:
    """Call the model and return the raw assistant content string.

    We deliberately do NOT use response_format={"type":"json_object"}: GPT-OSS is a
    reasoning model and Groq's strict JSON validator rejects its output
    (json_validate_failed). Instead the prompts instruct "JSON only" and
    json_utils.parse_json_or_raise recovers/validates the object.
    """
    if not GROQ_API_KEY:
        raise GroqNotConfigured("GROQ_API_KEY is not set")

    kwargs: dict = {
        "model": GROQ_MODEL,
        "temperature": temperature,
        "max_tokens": max_tokens,
        "messages": [{"role": "system", "content": system}, *messages],
    }
    if GROQ_REASONING_EFFORT:
        kwargs["reasoning_effort"] = GROQ_REASONING_EFFORT

    resp = await _client.chat.completions.create(**kwargs)
    return resp.choices[0].message.content or ""
