import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load .env from the project root (cwd). npm scripts run from the repo root,
// so a plain config() is more robust than a fragile relative path.
dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
  // Fail loud at boot rather than producing confusing runtime errors later.
  console.warn(
    '[config/supabase] SUPABASE_URL or SUPABASE_SERVICE_KEY is not set. ' +
      'DB calls will fail until these are configured in .env.'
  );
}

// Service role client — bypasses RLS, use ONLY server-side.
export const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// For verifying user JWTs issued by the frontend.
export const supabaseAnonUrl = supabaseUrl;
export const supabaseAnonKey = process.env.SUPABASE_ANON_KEY!;
