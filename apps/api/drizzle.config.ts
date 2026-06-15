import type { Config } from 'drizzle-kit';

export default {
  schema: './src/db/schema/index.ts',
  out: './src/db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env['DATABASE_URL'] ?? 'postgresql://dayliff:dayliff_dev@localhost:5432/dayliff_eyes',
  },
  verbose: true,
  strict: true,
} satisfies Config;
