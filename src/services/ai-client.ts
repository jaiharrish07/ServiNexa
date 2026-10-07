import { AI_SERVICE_URL, AI_TIMEOUT_MS } from '../config/ai-service';

/**
 * Standard envelope returned by every AI call. When the live Python AI
 * microservice succeeds, `source` is 'ai' and `data` holds its response.
 * On any failure (timeout / network / non-2xx) the caller is expected to
 * fall back to a local rule-based stub, hence `source: 'stub'`.
 */
export interface AIResponse<T> {
  data: T | null;
  error: string | null;
  source: 'ai' | 'stub';
}

/**
 * Attempt a POST call to the live AI microservice. Never throws — on any
 * error it logs a warning and returns a stub-signalling envelope so the
 * route handler can compute a deterministic local fallback instead.
 */
export async function callAIService<T>(
  endpoint: string,
  payload: any
): Promise<AIResponse<T>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_SERVICE_URL}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`AI service returned ${response.status}`);
    }

    const data = (await response.json()) as T;
    return { data, error: null, source: 'ai' };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `[AI Client] ${endpoint} failed: ${msg}. Falling back to stub.`
    );
    return { data: null, error: msg, source: 'stub' };
  } finally {
    // Always clear the timer so we never leak a pending timeout that would
    // keep the event loop alive after a fast success/failure.
    clearTimeout(timeout);
  }
}
