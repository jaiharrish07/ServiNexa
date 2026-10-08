"""Per-endpoint TTL cache, keyed by a hash of the request payload."""
from __future__ import annotations

import hashlib
import json
from typing import Any, Optional

from cachetools import TTLCache

from config import CACHE_TTL

# One bounded cache per endpoint that declares a TTL.
_caches: dict[str, TTLCache] = {
    endpoint: TTLCache(maxsize=512, ttl=ttl) for endpoint, ttl in CACHE_TTL.items()
}


def _key(payload: Any) -> str:
    raw = json.dumps(payload, sort_keys=True, default=str)
    return hashlib.sha1(raw.encode()).hexdigest()


def is_cacheable(endpoint: str) -> bool:
    return endpoint in _caches


def get(endpoint: str, payload: Any) -> Optional[dict]:
    cache = _caches.get(endpoint)
    if cache is None:
        return None
    return cache.get(_key(payload))


def set(endpoint: str, payload: Any, value: dict) -> None:
    cache = _caches.get(endpoint)
    if cache is not None:
        cache[_key(payload)] = value
