/**
 * Run database migrations programmatically.
 *
 * Execution order:
 *  1. Drizzle-kit generated migrations (schema DDL)
 *  2. Post-schema custom SQL:
 *     - TimescaleDB hypertable for analytics_snapshots (Req 8.1)
 *     - Row-Level Security policy on events (Req 13.4)
 *     - Default SLA rules seed data (Req 5.1)
 */

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const main = async () => {
  const client = new pg.Client({ connectionString: env.DATABASE_URL });
  await client.connect();
  const db = drizzle(client);

  // ── Step 1: Run Drizzle-kit generated schema migrations ─────────────────────
  logger.info('Running Drizzle-kit schema migrations...');
  await migrate(db, { migrationsFolder: path.join(__dirname, 'migrations') });
  logger.info('Schema migrations complete');

  // ── Step 2: Run post-schema custom SQL ──────────────────────────────────────
  const customSqlPath = path.join(__dirname, 'migrations', '0001_post_schema_setup.sql');
  logger.info({ file: customSqlPath }, 'Applying post-schema custom SQL...');

  const customSql = await readFile(customSqlPath, 'utf8');
  await client.query(customSql);

  logger.info('Post-schema setup complete');

  await client.end();
};

main().catch((err) => {
  logger.error(err);
  process.exit(1);
});
