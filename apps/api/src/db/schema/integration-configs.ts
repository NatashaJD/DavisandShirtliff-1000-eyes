import { boolean, check, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const integrationConfigs = pgTable(
  'integration_configs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sourceSystem: text('source_system').unique().notNull(),
    webhookSecretHash: text('webhook_secret_hash'),
    normalizationMap: jsonb('normalization_map').notNull(),
    syncIntervalMins: integer('sync_interval_mins'),
    lastSyncedAt: timestamp('last_synced_at', { withTimezone: true }),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    syncIntervalRange: check(
      'integration_configs_sync_interval_range',
      sql`${table.syncIntervalMins} IS NULL OR ${table.syncIntervalMins} BETWEEN 1 AND 1440`,
    ),
  }),
);

export type IntegrationConfig = typeof integrationConfigs.$inferSelect;
export type NewIntegrationConfig = typeof integrationConfigs.$inferInsert;
