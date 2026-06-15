import { boolean, check, index, jsonb, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

import { serviceRequests } from './service-requests.js';

export const aiPredictions = pgTable(
  'ai_predictions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id),
    riskScore: numeric('risk_score', { precision: 4, scale: 3 }).notNull(),
    riskLabel: text('risk_label', {
      enum: ['Low', 'Medium', 'High', 'Critical'],
    } as const).notNull(),
    contributingFactors: jsonb('contributing_factors').notNull(),
    predictedDelayHours: numeric('predicted_delay_hours', { precision: 8, scale: 2 }),
    delayConfidence: numeric('delay_confidence', { precision: 4, scale: 3 }),
    predictedCompletionAt: timestamp('predicted_completion_at', { withTimezone: true }),
    isStale: boolean('is_stale').notNull().default(false),
    lastComputedAt: timestamp('last_computed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdIdx: index('ai_predictions_request_id_idx').on(
      table.requestId,
      table.lastComputedAt,
    ),
    riskScoreRange: check(
      'ai_predictions_risk_score_range',
      sql`${table.riskScore} BETWEEN 0 AND 1`,
    ),
    delayConfidenceRange: check(
      'ai_predictions_delay_confidence_range',
      sql`${table.delayConfidence} IS NULL OR ${table.delayConfidence} BETWEEN 0 AND 1`,
    ),
  }),
);

export type AIPrediction = typeof aiPredictions.$inferSelect;
export type NewAIPrediction = typeof aiPredictions.$inferInsert;
