"""Robust JSON extraction from LLM output + pydantic validation."""
from __future__ import annotations

import json
import re
from typing import Type, TypeVar

from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)


def parse_json_or_raise(text: str, model: Type[T]) -> T:
    """Parse `text` into `model`. Recovers the first balanced {...} block if the
    model wrapped the JSON in prose, then validates. Raises on failure so the
    caller can fall back to the Express stub (never return partial data)."""
    try:
        obj = json.loads(text)
    except json.JSONDecodeError:
        m = re.search(r"\{.*\}", text, re.DOTALL)
        if not m:
            raise ValueError("no JSON object in LLM output")
        obj = json.loads(m.group(0))
    return model.model_validate(obj)
