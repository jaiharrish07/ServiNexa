"""Thin async wrapper around the GroqCloud OpenAI-compatible chat API."""
from __future__ import annotations

from openai import AsyncOpenAI, APITimeoutError, RateLimitError, APIError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from config import GROQ_API_KEY, GROQ_BASE_URL, GROQ_MODEL

# The client is created even without a key so the service boots; calls raise a clear
# error (→ router returns 502 → Express falls back to its TypeScript stub).
_client = AsyncOpenAI(api_key=GROQ_API_KEY or "missing-key", base_url=GROQ_BASE_URL)


class GroqNotConfigured(RuntimeError):
    pass


def is_configured() -> bool:
    return bool(GROQ_API_KEY)


@retry(
    stop=stop_after_attempt(2),
    wait=wait_exponential(multiplier=0.5, max=4),
    retry=retry_if_exception_type((APITimeoutError, RateLimitError, APIError)),
)
async def chat_json(
    system: str,
    messages: list[dict],
    max_tokens: int,
    temperature: float = 0.2,
) -> str:
    """Call the model in JSON mode and return the raw assistant content string."""
    if not GROQ_API_KEY:
        raise GroqNotConfigured("GROQ_API_KEY is not set")

    resp = await _client.chat.completions.create(
        model=GROQ_MODEL,
        temperature=temperature,
        max_tokens=max_tokens,
        response_format={"type": "json_object"},
        messages=[{"role": "system", "content": system}, *messages],
    )
    return resp.choices[0].message.content or ""
