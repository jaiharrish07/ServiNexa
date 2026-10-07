"""In-process priority rate limiter enforcing GroqCloud free-tier budgets.

Per-minute (rpm/tpm) windows via timestamp deques; per-day counters reset at the
UTC day boundary. On exhaustion we RAISE (BudgetExceeded) rather than block — the
caller returns HTTP 502 so Express falls back to its stub within its 5s timeout.

Priority (see config.PRIORITY):
  P0  user-blocking  → small grace over the minute budget to stay responsive
  P1  ops action     → strict minute budget
  P2  background     → shed early (80% of minute budget) so P0/P1 keep headroom
Daily budget is hard for every tier.
"""
from __future__ import annotations

import asyncio
import time
from collections import deque
from datetime import datetime, timezone

from config import GROQ_RPM, GROQ_TPM, GROQ_DAILY_REQUESTS, GROQ_DAILY_TOKENS


class BudgetExceeded(RuntimeError):
    def __init__(self, scope: str):
        super().__init__(f"Groq budget exceeded ({scope})")
        self.scope = scope


class RateLimiter:
    def __init__(self) -> None:
        self._req_times: deque[float] = deque()
        self._tok_events: deque[tuple[float, int]] = deque()
        self._day = self._today()
        self._day_req = 0
        self._day_tok = 0
        self._lock = asyncio.Lock()

    @staticmethod
    def _today() -> str:
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")

    def _prune(self, now: float) -> None:
        cutoff = now - 60.0
        while self._req_times and self._req_times[0] < cutoff:
            self._req_times.popleft()
        while self._tok_events and self._tok_events[0][0] < cutoff:
            self._tok_events.popleft()
        today = self._today()
        if today != self._day:
            self._day = today
            self._day_req = 0
            self._day_tok = 0

    async def acquire(self, priority: str, est_tokens: int) -> None:
        async with self._lock:
            now = time.monotonic()
            self._prune(now)

            minute_req = len(self._req_times)
            minute_tok = sum(t for _, t in self._tok_events)

            # Daily budget is hard for everyone.
            if self._day_req >= GROQ_DAILY_REQUESTS or self._day_tok + est_tokens > GROQ_DAILY_TOKENS:
                raise BudgetExceeded("daily")

            if priority == "P2":
                if minute_req >= GROQ_RPM * 0.8 or minute_tok + est_tokens > GROQ_TPM * 0.8:
                    raise BudgetExceeded("minute/P2")
            elif priority == "P0":
                if minute_req >= GROQ_RPM + 2 or minute_tok + est_tokens > GROQ_TPM * 1.1:
                    raise BudgetExceeded("minute/P0")
            else:  # P1
                if minute_req >= GROQ_RPM or minute_tok + est_tokens > GROQ_TPM:
                    raise BudgetExceeded("minute/P1")

            self._req_times.append(now)
            self._tok_events.append((now, est_tokens))
            self._day_req += 1
            self._day_tok += est_tokens

    def snapshot(self) -> dict:
        now = time.monotonic()
        self._prune(now)
        return {
            "minute_requests": len(self._req_times),
            "minute_tokens": sum(t for _, t in self._tok_events),
            "day_requests": self._day_req,
            "day_tokens": self._day_tok,
            "limits": {
                "rpm": GROQ_RPM,
                "tpm": GROQ_TPM,
                "daily_requests": GROQ_DAILY_REQUESTS,
                "daily_tokens": GROQ_DAILY_TOKENS,
            },
        }


limiter = RateLimiter()
