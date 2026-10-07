import express, { Express } from 'express';
import { randomUUID } from 'node:crypto';
import { errorHandler } from '../../src/middleware/error-handler';
import { seedTable, registerAuthUser, issueToken } from './supabase';

/**
 * Build a minimal Express app with ONLY the router(s) you mount — isolates each route
 * group so tests don't import sibling route files (safe during parallel development).
 */
export function testApp(mount: (app: Express) => void): Express {
  const app = express();
  app.use(express.json());
  mount(app);
  app.use(errorHandler);
  return app;
}

export type Role = 'ADMIN' | 'OPS_MANAGER' | 'TECHNICIAN' | 'CUSTOMER';

/** Seed an auth user + its `users` profile row and return a ready-to-use Bearer token. */
export function seedUser(role: Role, over: Record<string, any> = {}) {
  const email: string = over.email ?? `${role.toLowerCase()}_${randomUUID().slice(0, 6)}@t.com`;
  const authId = registerAuthUser({ email, password: over.password ?? 'pw' });
  const id: string = over.id ?? randomUUID();
  seedTable('users', [
    { id, auth_id: authId, email, full_name: over.full_name ?? role, role, is_active: true },
  ]);
  const token = issueToken(authId);
  return { id, authId, email, token, bearer: `Bearer ${token}` };
}
