import { index, integer, pgTable, timestamp, unique, uuid } from 'drizzle-orm/pg-core';

import { events } from './events.js';
import { serviceRequests } from './service-requests.js';

export const timelines = pgTable(
  'timelines',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    requestId: uuid('request_id')
      .notNull()
      .references(() => serviceRequests.id),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id),
    position: integer('position').notNull(),
    appendedAt: timestamp('appended_at', { withTimezone: true, precision: 3 }).notNull().defaultNow(),
  },
  (table) => ({
    requestEventUnique: unique('timelines_request_event_unique').on(table.requestId, table.eventId),
    requestIdIdx: index('timelines_request_id_idx').on(table.requestId, table.position),
  }),
);

export type Timeline = typeof timelines.$inferSelect;
export type NewTimeline = typeof timelines.$inferInsert;
