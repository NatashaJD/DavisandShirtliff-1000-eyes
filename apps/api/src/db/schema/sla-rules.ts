import { check, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const slaRules = pgTable(
  'sla_rules',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    journeyStage: text('journey_stage', {
      enum: [
        'Inquiry',
        'Sales Review',
        'Engineering Design',
        'Quotation',
        'Approval',
        'Dispatch',
        'Delivery',
      ],
    })
      .unique()
      .notNull(),
    thresholdHours: numeric('threshold_hours', { precision: 8, scale: 2 }).notNull(),
    description: text('description'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    thresholdHoursPositive: check(
      'sla_rules_threshold_hours_positive',
      sql`${table.thresholdHours} > 0`,
    ),
  }),
);

export type SLARule = typeof slaRules.$inferSelect;
export type NewSLARule = typeof slaRules.$inferInsert;
