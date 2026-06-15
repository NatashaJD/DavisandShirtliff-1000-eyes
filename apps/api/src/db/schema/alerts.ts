import { index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { serviceRequests } from './service-requests.js';
import { users } from './users.js';

export const alerts = pgTable(
  'alerts',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id').references(() => serviceRequests.id),
    alertType: text('alert_type', {
      enum: ['Operational Alert', 'SLA Breach Alert', 'Critical Delay Alert', 'Escalation Alert'],
    }).notNull(),
    severity: text('severity', {
      enum: ['Info', 'Warning', 'Critical'],
    }).notNull(),
    lifecycleState: text('lifecycle_state', {
      enum: ['Created', 'Acknowledged', 'Resolved', 'Archived'],
    })
      .notNull()
      .default('Created'),
    message: text('message').notNull(),
    metadata: jsonb('metadata'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    acknowledgedBy: uuid('acknowledged_by').references(() => users.id),
    acknowledgedAt: timestamp('acknowledged_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),
  },
  (table) => ({
    requestIdIdx: index('alerts_request_id_idx').on(table.requestId, table.createdAt),
    lifecycleStateIdx: index('alerts_lifecycle_state_idx').on(
      table.lifecycleState,
      table.severity,
    ),
  }),
);

export type Alert = typeof alerts.$inferSelect;
export type NewAlert = typeof alerts.$inferInsert;
