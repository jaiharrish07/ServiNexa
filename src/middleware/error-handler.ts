import { Request, Response, NextFunction, RequestHandler } from 'express';
import { ZodError } from 'zod';
import { env } from '../config/env';

/** Typed operational error. `code` is an optional machine-readable slug for the frontend. */
export class AppError extends Error {
  statusCode: number;
  code?: string;
  details?: unknown;
  constructor(message: string, statusCode = 500, code?: string, details?: unknown) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (msg = 'Resource not found') => new AppError(msg, 404, 'NOT_FOUND');
export const badRequest = (msg: string, details?: unknown) => new AppError(msg, 400, 'BAD_REQUEST', details);
export const forbidden = (msg = 'Insufficient permissions') => new AppError(msg, 403, 'FORBIDDEN');
export const unauthorized = (msg = 'Unauthorized') => new AppError(msg, 401, 'UNAUTHORIZED');
export const conflict = (msg: string) => new AppError(msg, 409, 'CONFLICT');

/**
 * Wrap an async route so any thrown error (or rejected promise) reaches the global
 * handler instead of crashing the process. Express 4 does NOT do this automatically.
 */
export const asyncHandler =
  (fn: RequestHandler): RequestHandler =>
  (req, res, next) =>
    Promise.resolve(fn(req, res, next)).catch(next);

/** 404 fallthrough for unmatched routes. */
export const notFoundHandler = (req: Request, _res: Response, next: NextFunction) =>
  next(new AppError(`Route not found: ${req.method} ${req.path}`, 404, 'NOT_FOUND'));

/** Global error handler — MUST be registered last. Keeps the guide's `{ error }` shape. */
export const errorHandler = (
  err: unknown,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction,
) => {
  let statusCode = 500;
  let message = 'Internal server error';
  let code: string | undefined;
  let details: unknown;

  if (err instanceof ZodError) {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed';
    details = err.flatten();
  } else if (err instanceof AppError) {
    statusCode = err.statusCode;
    message = err.message;
    code = err.code;
    details = err.details;
  } else if (err instanceof Error) {
    message = err.message || message;
  }

  const log = (req as any).log;
  if (log && statusCode >= 500) log.error({ err }, 'request failed');

  res.status(statusCode).json({
    error: message,
    ...(code ? { code } : {}),
    ...(details ? { details } : {}),
    ...(env.NODE_ENV === 'development' && err instanceof Error ? { stack: err.stack } : {}),
  });
};
