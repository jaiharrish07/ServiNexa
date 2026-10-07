/** Global test setup: force a safe, log-quiet test environment before any module loads. */
process.env.NODE_ENV = 'test';
process.env.SUPABASE_URL = process.env.SUPABASE_URL ?? 'http://localhost:54321';
process.env.SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY ?? 'test-anon-key';
process.env.SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY ?? 'test-service-key';
process.env.LOG_LEVEL = 'silent';
process.env.AI_SERVICE_URL = process.env.AI_SERVICE_URL ?? 'http://localhost:8000';
