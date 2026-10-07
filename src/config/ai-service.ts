import { env } from './env';

/**
 * AI microservice config. Dev A owns the AI client/wiring; this just centralizes the
 * URL + timeout so the config exists in Dev B's standalone slice and merges cleanly.
 */
export const AI_SERVICE_URL = env.AI_SERVICE_URL;
export const AI_SERVICE_TOKEN = env.AI_SERVICE_TOKEN;
export const AI_TIMEOUT_MS = env.AI_TIMEOUT_MS;
