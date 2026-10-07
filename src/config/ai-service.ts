import dotenv from 'dotenv';

dotenv.config();

export const AI_SERVICE_URL = process.env.AI_SERVICE_URL || 'http://localhost:8000';

// Timeout for every call to the Python AI microservice. If the service is slow
// or down, the ai-client aborts and the Express route falls back to a local stub.
export const AI_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS) || 5000;
