/**
 * In-memory Supabase mock.
 *
 * Emulates the subset of the @supabase/supabase-js PostgREST query builder + auth
 * surface that the Dev B routes/services use. Backed by plain arrays so route logic
 * runs for real (filters, pagination, uniqueness, optimistic concurrency) with zero infra.
 *
 * ── How to use in a test file ────────────────────────────────────────────────
 *   import { mockSupabase, resetDb, seedTable, registerAuthUser, issueToken } from '../_mocks/supabase';
 *   vi.mock('../../src/config/supabase', () => ({
 *     supabase: mockSupabase,
 *     supabaseAnonUrl: 'http://x',
 *     supabaseAnonKey: 'anon',
 *   }));
 *   beforeEach(() => resetDb());
 *
 * Seed helpers let you set up state; registerAuthUser + issueToken give you a usable
 * Bearer token whose profile you also seed into the `users` table (match on auth_id).
 */
import { randomUUID } from 'node:crypto';

type Row = Record<string, any>;

// Composite unique keys per table (mirrors the SQL schema's UNIQUE constraints).
const UNIQUE_KEYS: Record<string, string[][]> = {
  users: [['email'], ['auth_id']],
  sites: [['code']],
  machines: [['code']],
  technicians: [['employee_code']],
  service_requests: [['request_number']],
  work_orders: [['order_number']],
  spare_parts: [['site_id', 'part_number']],
};

const db: Record<string, Row[]> = {};
const authUsers = new Map<string, { id: string; email: string; password: string }>();

const clone = <T>(v: T): T => (v == null ? v : JSON.parse(JSON.stringify(v)));
const nowIso = () => new Date().toISOString();

export function resetDb(seed: Record<string, Row[]> = {}) {
  for (const k of Object.keys(db)) delete db[k];
  authUsers.clear();
  for (const [table, rows] of Object.entries(seed)) {
    db[table] = clone(rows);
  }
}
export function seedTable(table: string, rows: Row[]) {
  db[table] = [...(db[table] ?? []), ...clone(rows)];
}
export function getTable(table: string): Row[] {
  return db[table] ?? (db[table] = []);
}
export function registerAuthUser(u: { id?: string; email: string; password?: string }) {
  const id = u.id ?? randomUUID();
  authUsers.set(id, { id, email: u.email, password: u.password ?? 'password' });
  return id;
}
export function issueToken(authId: string) {
  return `tok_${authId}`;
}

// ── Postgres-style duplicate error ──
const dupErr = (constraint: string) => ({
  code: '23505',
  message: `duplicate key value violates unique constraint "${constraint}"`,
  details: null,
  hint: null,
});
const notFoundErr = () => ({ code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: '0 rows' });

function violatesUnique(table: string, candidate: Row, ignoreRow?: Row): string | null {
  const keys = UNIQUE_KEYS[table];
  if (!keys) return null;
  const rows = getTable(table);
  for (const keyset of keys) {
    if (keyset.some((k) => candidate[k] === undefined || candidate[k] === null)) continue;
    const clash = rows.some(
      (r) => r !== ignoreRow && keyset.every((k) => r[k] === candidate[k]),
    );
    if (clash) return `${table}_${keyset.join('_')}_key`;
  }
  return null;
}

type Filter = (row: Row) => boolean;

class Query implements PromiseLike<{ data: any; error: any; count: number | null }> {
  private filters: Filter[] = [];
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: any = null;
  private returning = false;
  private singleMode: 'single' | 'maybe' | null = null;
  private orderBy: { col: string; asc: boolean } | null = null;
  private limitN: number | null = null;
  private rangeFromTo: [number, number] | null = null;
  private countMode = false;
  private headMode = false;

  constructor(private table: string) {}

  // ── terminal-ish builders ──
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (this.op === 'select') this.op = 'select';
    this.returning = true;
    if (opts?.count) this.countMode = true;
    if (opts?.head) this.headMode = true;
    return this;
  }
  insert(payload: Row | Row[]) {
    this.op = 'insert';
    this.payload = payload;
    this.returning = false;
    return this;
  }
  update(patch: Row) {
    this.op = 'update';
    this.payload = patch;
    return this;
  }
  delete() {
    this.op = 'delete';
    return this;
  }

  // ── filters ──
  eq(col: string, val: any) {
    this.filters.push((r) => r[col] === val);
    return this;
  }
  neq(col: string, val: any) {
    this.filters.push((r) => r[col] !== val);
    return this;
  }
  gt(col: string, val: any) {
    this.filters.push((r) => r[col] > val);
    return this;
  }
  gte(col: string, val: any) {
    this.filters.push((r) => r[col] >= val);
    return this;
  }
  lt(col: string, val: any) {
    this.filters.push((r) => r[col] < val);
    return this;
  }
  lte(col: string, val: any) {
    this.filters.push((r) => r[col] <= val);
    return this;
  }
  in(col: string, arr: any[]) {
    this.filters.push((r) => arr.includes(r[col]));
    return this;
  }
  is(col: string, val: any) {
    this.filters.push((r) => (val === null ? r[col] == null : r[col] === val));
    return this;
  }
  not(col: string, op: string, val: any) {
    if (op === 'is' && val === null) this.filters.push((r) => r[col] != null);
    else this.filters.push((r) => r[col] !== val);
    return this;
  }
  ilike(col: string, pattern: string) {
    this.filters.push(ilikePred(col, pattern));
    return this;
  }
  or(expr: string) {
    // "col.op.val,col.op.val" → OR of terms (supports ilike, eq)
    const terms = expr.split(',').map((t) => {
      const [col, op, ...rest] = t.split('.');
      const val = rest.join('.');
      if (op === 'ilike') return ilikePred(col!, val);
      if (op === 'eq') return (r: Row) => String(r[col!]) === val;
      return () => false;
    });
    this.filters.push((r) => terms.some((fn) => fn(r)));
    return this;
  }

  // ── shaping ──
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, asc: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number) {
    this.rangeFromTo = [from, to];
    return this;
  }
  single() {
    this.singleMode = 'single';
    return this;
  }
  maybeSingle() {
    this.singleMode = 'maybe';
    return this;
  }

  private matched(): Row[] {
    return getTable(this.table).filter((r) => this.filters.every((f) => f(r)));
  }

  private resolveNow() {
    const table = this.table;
    try {
      if (this.op === 'insert') {
        const rowsIn = Array.isArray(this.payload) ? this.payload : [this.payload];
        const inserted: Row[] = [];
        for (const raw of rowsIn) {
          const row: Row = { ...raw };
          if (row.id === undefined) row.id = randomUUID();
          if (row.created_at === undefined) row.created_at = nowIso();
          if (row.updated_at === undefined) row.updated_at = nowIso();
          const v = violatesUnique(table, row);
          if (v) return { data: null, error: dupErr(v), count: null };
          getTable(table).push(row);
          inserted.push(row);
        }
        if (!this.returning) return { data: null, error: null, count: null };
        return this.shapeReturn(inserted);
      }

      if (this.op === 'update') {
        const rows = this.matched();
        for (const r of rows) {
          const next = { ...r, ...this.payload, updated_at: nowIso() };
          const v = violatesUnique(table, next, r);
          if (v) return { data: null, error: dupErr(v), count: null };
          Object.assign(r, next);
        }
        if (!this.returning) return { data: null, error: null, count: rows.length };
        return this.shapeReturn(rows);
      }

      if (this.op === 'delete') {
        const rows = this.matched();
        db[table] = getTable(table).filter((r) => !rows.includes(r));
        if (!this.returning) return { data: null, error: null, count: rows.length };
        return this.shapeReturn(rows);
      }

      // select
      let rows = this.matched();
      if (this.countMode) {
        const count = rows.length;
        if (this.headMode) return { data: null, error: null, count };
        rows = this.applyShape(rows);
        return { data: clone(rows), error: null, count };
      }
      rows = this.applyShape(rows);
      return this.shapeReturn(rows);
    } catch (e: any) {
      return { data: null, error: { code: 'MOCK_ERR', message: e?.message ?? 'mock error' }, count: null };
    }
  }

  private applyShape(rows: Row[]): Row[] {
    let out = [...rows];
    if (this.orderBy) {
      const { col, asc } = this.orderBy;
      out.sort((a, b) => {
        const av = a[col];
        const bv = b[col];
        if (av === bv) return 0;
        if (av == null) return 1;
        if (bv == null) return -1;
        return (av < bv ? -1 : 1) * (asc ? 1 : -1);
      });
    }
    if (this.rangeFromTo) {
      const [f, t] = this.rangeFromTo;
      out = out.slice(f, t + 1);
    } else if (this.limitN != null) {
      out = out.slice(0, this.limitN);
    }
    return out;
  }

  private shapeReturn(rows: Row[]) {
    if (this.singleMode === 'single') {
      if (rows.length !== 1) return { data: null, error: notFoundErr(), count: null };
      return { data: clone(rows[0]), error: null, count: null };
    }
    if (this.singleMode === 'maybe') {
      if (rows.length === 0) return { data: null, error: null, count: null };
      return { data: clone(rows[0]), error: null, count: null };
    }
    return { data: clone(rows), error: null, count: null };
  }

  then<TResult1 = any, TResult2 = never>(
    onfulfilled?: ((value: { data: any; error: any; count: number | null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.resolveNow()).then(onfulfilled, onrejected);
  }
}

function ilikePred(col: string, pattern: string): Filter {
  const needle = pattern.replace(/%/g, '').toLowerCase();
  return (r: Row) => String(r[col] ?? '').toLowerCase().includes(needle);
}

export const mockSupabase = {
  from(table: string) {
    return new Query(table);
  },
  auth: {
    async getUser(token?: string) {
      if (!token || !token.startsWith('tok_')) {
        return { data: { user: null }, error: { message: 'invalid token' } };
      }
      const id = token.slice(4);
      const u = authUsers.get(id);
      if (!u) return { data: { user: null }, error: { message: 'invalid token' } };
      return { data: { user: { id: u.id, email: u.email } }, error: null };
    },
    async signInWithPassword({ email, password }: { email: string; password: string }) {
      const u = [...authUsers.values()].find((x) => x.email === email && x.password === password);
      if (!u) return { data: { user: null, session: null }, error: { message: 'Invalid login credentials' } };
      return {
        data: {
          user: { id: u.id, email: u.email },
          session: { access_token: issueToken(u.id), refresh_token: `ref_${u.id}` },
        },
        error: null,
      };
    },
    admin: {
      async createUser({ email, password }: { email: string; password?: string; email_confirm?: boolean }) {
        if ([...authUsers.values()].some((x) => x.email === email)) {
          return { data: { user: null }, error: { message: 'A user with this email address has already been registered' } };
        }
        const id = randomUUID();
        authUsers.set(id, { id, email, password: password ?? 'password' });
        return { data: { user: { id, email } }, error: null };
      },
      async deleteUser(id: string) {
        authUsers.delete(id);
        return { data: {}, error: null };
      },
    },
  },
};
