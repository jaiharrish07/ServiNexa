import rateLimit from 'express-rate-limit';
import { env } from '../config/env';

const disabled = env.NODE_ENV === 'test';

/** Global limiter — generous, protects against runaway clients. */
export const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  message: { error: 'Too many requests, please slow down', code: 'RATE_LIMITED' },
});

/** Stricter limiter for auth endpoints (brute-force protection). */
export const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skip: () => disabled,
  message: { error: 'Too many auth attempts, try again later', code: 'RATE_LIMITED' },
});
