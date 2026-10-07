import dotenv from 'dotenv';
import { z } from 'zod';

// Load .env from project root (flat layout — Express lives at repo root).
dotenv.config();

const isProd = process.env.NODE_ENV === 'production';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3001),

  // Supabase — required in production, placeholder-tolerant elsewhere so dev/test boot.
  SUPABASE_URL: z.string().default('http://localhost:54321'),
  SUPABASE_ANON_KEY: z.string().default('placeholder-anon-key'),
  SUPABASE_SERVICE_KEY: z.string().default('placeholder-service-key'),

  AI_SERVICE_URL: z.string().default('http://localhost:8000'),
  AI_TIMEOUT_MS: z.coerce.number().default(5000),

  FRONTEND_URL: z.string().default('http://localhost:3000'),
  CORS_ORIGINS: z.string().optional(),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(60_000),
  RATE_LIMIT_MAX: z.coerce.number().default(300),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(20),

  LOG_LEVEL: z.string().default('info'),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('[env] Invalid environment configuration:\n', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;

// Fail fast if someone ships to production without real Supabase credentials.
if (isProd) {
  const placeholders = [
    /localhost|your-project-ref|xxxxx|placeholder/i.test(env.SUPABASE_URL),
    /your-|xxxxx|placeholder|example/i.test(env.SUPABASE_SERVICE_KEY),
    /your-|xxxxx|placeholder|example/i.test(env.SUPABASE_ANON_KEY),
  ];
  if (placeholders.some(Boolean)) {
    // eslint-disable-next-line no-console
    console.error('[env] Refusing to start in production with placeholder Supabase credentials.');
    process.exit(1);
  }
}

export const corsOrigins = (env.CORS_ORIGINS ?? env.FRONTEND_URL)
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

export const isTest = env.NODE_ENV === 'test';
export const isDev = env.NODE_ENV === 'development';
