import { index, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';

import { serviceRequests } from './service-requests.js';
import { users } from './users.js';

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey(), // event_id from source — NOT defaultRandom()
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id),
    eventType: text('event_type').notNull(),
    sourceSystem: text('source_system', {
      enum: ['CRM', 'ERP', 'Engineering Software', 'Quotation System', 'Logistics Platform', 'Manual'],
    }).notNull(),
    department: text('department'),
    triggeredByUserId: uuid('triggered_by_user')
      .references(() => users.id),
    previousState: text('previous_state'),
    newState: text('new_state'),
    metadata: jsonb('metadata'),
    occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 }).notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
    pipelineStatus: text('pipeline_status', {
      enum: ['pending', 'complete', 'partial'],
    })
      .notNull()
      .default('pending'),
    failedSteps: text('failed_steps').array(),
  },
  (table) => ({
    idUidx: uniqueIndex('events_id_uidx').on(table.id),
    requestIdIdx: index('events_request_id_idx').on(table.requestId, table.occurredAt),
    occurredAtIdx: index('events_occurred_at_idx').on(table.occurredAt),
  }),
);

export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
