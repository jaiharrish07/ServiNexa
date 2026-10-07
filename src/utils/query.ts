import { Request } from 'express';
import { z } from 'zod';

export interface ListParams {
  page: number;
  limit: number;
  from: number;
  to: number;
  sort: string;
  order: 'asc' | 'desc';
  q?: string;
}

interface ListOptions {
  defaultSort?: string;
  defaultOrder?: 'asc' | 'desc';
  defaultLimit?: number;
  maxLimit?: number;
  /** Columns searched by the `q` param (ilike OR). */
  searchColumns?: string[];
  /** Whitelist of sortable columns (prevents arbitrary column injection). */
  sortable?: string[];
}

/**
 * Parse standard list controls from the query string with safe defaults + caps.
 * Additive to the guide: list endpoints keep their data key and gain pagination.
 */
export function parseListQuery(req: Request, opts: ListOptions = {}): ListParams {
  const {
    defaultSort = 'created_at',
    defaultOrder = 'desc',
    defaultLimit = 50,
    maxLimit = 100,
    sortable,
  } = opts;

  const schema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(maxLimit).default(defaultLimit),
    sort: z.string().default(defaultSort),
    order: z.enum(['asc', 'desc']).default(defaultOrder),
    q: z.string().trim().min(1).optional(),
  });

  const parsed = schema.parse(req.query);
  const sort = sortable && !sortable.includes(parsed.sort) ? defaultSort : parsed.sort;
  const from = (parsed.page - 1) * parsed.limit;
  const to = from + parsed.limit - 1;

  return { page: parsed.page, limit: parsed.limit, from, to, sort, order: parsed.order, q: parsed.q };
}

/** Build the PostgREST `or(...)` ilike expression for a search term. */
export function searchExpr(columns: string[], q: string): string {
  const safe = q.replace(/[,()]/g, ' ');
  return columns.map((c) => `${c}.ilike.%${safe}%`).join(',');
}

export interface PageMeta {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export function buildMeta(lp: ListParams, total: number | null): PageMeta {
  const t = total ?? 0;
  return { page: lp.page, limit: lp.limit, total: t, total_pages: Math.max(1, Math.ceil(t / lp.limit)) };
}
