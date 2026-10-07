import { Response } from 'express';
import { AppError } from '../middleware/error-handler';
import { PageMeta } from './query';

/**
 * Translate a Supabase `{ data, error }` result into either the data or a thrown
 * AppError, keeping status-code semantics the routes expect.
 * `notFoundIsNull`=false (default) turns PGRST116 (no rows) into a 404.
 */
export function unwrap<T>(
  result: { data: T | null; error: { code?: string; message?: string } | null },
  opts: { notFoundMessage?: string; serverMessage?: string } = {},
): T {
  const { data, error } = result;
  if (error) {
    if (error.code === 'PGRST116') throw new AppError(opts.notFoundMessage ?? 'Resource not found', 404, 'NOT_FOUND');
    if (error.code === '23505') throw new AppError('Resource already exists', 409, 'CONFLICT');
    if (error.code === '23503') throw new AppError('Referenced resource does not exist', 400, 'FK_VIOLATION');
    throw new AppError(error.message ?? opts.serverMessage ?? 'Database error', 400, 'DB_ERROR');
  }
  if (data === null || data === undefined) {
    throw new AppError(opts.notFoundMessage ?? 'Resource not found', 404, 'NOT_FOUND');
  }
  return data;
}

/** `{ <key>: data }` — matches the guide's response shape. */
export function wrap<T>(key: string, data: T): Record<string, T> {
  return { [key]: data };
}

/** `{ <key>: rows, meta }` — list shape with additive pagination meta. */
export function wrapList<T>(key: string, rows: T[], meta: PageMeta) {
  return { [key]: rows, meta };
}

export const created = (res: Response, body: unknown) => res.status(201).json(body);
export const ok = (res: Response, body: unknown) => res.status(200).json(body);
