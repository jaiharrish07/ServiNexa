import { createClient } from '@supabase/supabase-js';
import WebSocket from 'ws';
import { env } from './env';

// Node < 22 has no global WebSocket; supabase-js realtime-js requires one at client
// construction. Polyfill it so the client builds (we don't use realtime from the server).
if (typeof (globalThis as any).WebSocket === 'undefined') {
  (globalThis as any).WebSocket = WebSocket;
}

/**
 * Service-role Supabase client — bypasses RLS, used ONLY server-side.
 * This is the single database entrypoint for the whole API; every route/service
 * imports `supabase` from here (so tests can mock this one module).
 */
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** A fresh anon client for password login; never mutate the service-role client session. */
export function createAuthClient() {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// Anon credentials for verifying user JWTs issued to the frontend.
export const supabaseAnonUrl = env.SUPABASE_URL;
export const supabaseAnonKey = env.SUPABASE_ANON_KEY;
