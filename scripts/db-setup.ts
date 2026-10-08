/** Apply the core schema and feature schema using the PostgreSQL CLI. */
import dotenv from 'dotenv';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

dotenv.config();

const databaseUrl = process.env.DATABASE_URL?.trim();
if (!databaseUrl || /your-project-ref|your-database-password|xxxxx|placeholder/i.test(databaseUrl)) {
  console.error(
    'DATABASE_URL is missing or still contains an example value. Copy .env.example to .env and set your Supabase database connection URI.'
  );
  process.exit(1);
}

const schemaPaths = ['sql/schema.sql', 'sql/features.sql', 'sql/security-hardening.sql'].map((file) => path.resolve(process.cwd(), file));
const missing = schemaPaths.find((file) => !existsSync(file));
if (missing) {
  console.error(`Schema file not found: ${missing}`);
  process.exit(1);
}

const result = spawnSync(
  'psql',
  ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', databaseUrl, ...schemaPaths.flatMap((file) => ['--file', file])],
  { stdio: 'inherit' }
);

if (result.error) {
  if ('code' in result.error && result.error.code === 'ENOENT') {
    console.error('psql was not found. Install the PostgreSQL command-line tools, then run `npm run db:setup` again.');
  } else {
    console.error(`Could not start psql: ${result.error.message}`);
  }
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

console.log('\nSupabase core schema, feature schema, and security policies applied successfully.');
