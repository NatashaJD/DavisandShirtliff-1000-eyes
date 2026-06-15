/**
 * analytics_snapshots — TimescaleDB hypertable on period_start
 * The hypertable conversion is applied in the migration (task 2).
 */

import { jsonb, numeric, pgTable, primaryKey, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const analyticsSnapshots = pgTable(
  'analytics_snapshots',
  {
    id: uuid('id').notNull().defaultRandom(),
    snapshotType: text('snapshot_type', {
      enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly'],
    }).notNull(),
    periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
    periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
    department: text('department'),
    journeyStage: text('journey_stage'),
    kpiKey: text('kpi_key').notNull(),
    kpiValue: numeric('kpi_value', { precision: 12, scale: 4 }).notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.periodStart] }),
  }),
);

export type AnalyticsSnapshot = typeof analyticsSnapshots.$inferSelect;
export type NewAnalyticsSnapshot = typeof analyticsSnapshots.$inferInsert;
