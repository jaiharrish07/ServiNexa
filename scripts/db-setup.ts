/** Apply the checked-in Supabase schema using the PostgreSQL CLI. */
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

const schemaPath = path.resolve(process.cwd(), 'sql/schema.sql');
if (!existsSync(schemaPath)) {
  console.error(`Schema file not found: ${schemaPath}`);
  process.exit(1);
}

const result = spawnSync(
  'psql',
  ['--no-psqlrc', '--set', 'ON_ERROR_STOP=1', '--dbname', databaseUrl, '--file', schemaPath],
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

console.log('\nSupabase schema applied successfully.');
