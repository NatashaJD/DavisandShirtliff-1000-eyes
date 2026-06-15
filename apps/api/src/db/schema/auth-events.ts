import { inet, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.js';

export const authEvents = pgTable('auth_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id),
  eventType: text('event_type', {
    enum: ['login_success', 'login_failure', 'logout', 'token_refresh', 'token_refresh_failure'],
  }).notNull(),
  ipAddress: inet('ip_address').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true, precision: 3 }).notNull(),
});

export type AuthEvent = typeof authEvents.$inferSelect;
export type NewAuthEvent = typeof authEvents.$inferInsert;
