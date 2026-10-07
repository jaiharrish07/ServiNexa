/**
 * Lightweight chainable mock of the Supabase JS client, good enough for the
 * query shapes used by workflow.ts, audit.ts and notifications.ts.
 *
 * Terminal values are looked up by `${table}:${op}` (e.g. 'service_requests:select').
 * The builder is awaitable directly (for `await query` after .order()/.eq())
 * AND exposes .single()/.maybeSingle() terminals — both resolve the same value.
 */
type Terminal = { data: any; error: any };

let responses: Record<string, Terminal> = {};
let rpcResult: { data?: any; error: any } = { error: null };
export const rpcCalls: Array<{ fn: string; args: any }> = [];
export const inserts: Array<{ table: string; payload: any }> = [];
export const updates: Array<{ table: string; payload: any }> = [];

export function setResponses(r: Record<string, Terminal>) {
  responses = r;
}
export function setRpc(result: { data?: any; error: any }) {
  rpcResult = result;
}
export function resetMock() {
  responses = {};
  rpcResult = { error: null };
  rpcCalls.length = 0;
  inserts.length = 0;
  updates.length = 0;
}

function makeBuilder(table: string) {
  let op: string | undefined;

  const terminal = (): Terminal => responses[`${table}:${op}`] ?? { data: null, error: null };

  const builder: any = {
    select(_cols?: string) {
      if (!op) op = 'select';
      return builder;
    },
    insert(payload: any) {
      op = 'insert';
      inserts.push({ table, payload });
      return builder;
    },
    update(payload: any) {
      op = 'update';
      updates.push({ table, payload });
      return builder;
    },
    delete() {
      op = 'delete';
      return builder;
    },
    upsert(payload: any) {
      op = 'insert';
      inserts.push({ table, payload });
      return builder;
    },
    eq() {
      return builder;
    },
    neq() {
      return builder;
    },
    in() {
      return builder;
    },
    not() {
      return builder;
    },
    order() {
      return builder;
    },
    limit() {
      return builder;
    },
    single() {
      return Promise.resolve(terminal());
    },
    maybeSingle() {
      return Promise.resolve(terminal());
    },
    // Make the builder itself awaitable (for `await query` without .single()).
    then(resolve: (v: Terminal) => any, reject?: (e: any) => any) {
      return Promise.resolve(terminal()).then(resolve, reject);
    },
  };
  return builder;
}

export const supabase: any = {
  from(table: string) {
    return makeBuilder(table);
  },
  rpc(fn: string, args: any) {
    rpcCalls.push({ fn, args });
    return Promise.resolve(rpcResult);
  },
  auth: {
    getUser: jest.fn(),
    admin: { createUser: jest.fn() },
  },
};

export const supabaseAnonUrl = 'http://localhost:54321';
export const supabaseAnonKey = 'test-anon-key';
