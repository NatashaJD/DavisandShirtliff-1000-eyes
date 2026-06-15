import { boolean, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { users } from './users.js';

export const serviceRequests = pgTable('service_requests', {
  id: uuid('id').primaryKey().defaultRandom(),
  requestNumber: text('request_number').unique().notNull(),
  customerName: text('customer_name').notNull(),
  customerContact: text('customer_contact'),
  requestType: text('request_type').notNull(),
  currentStage: text('current_stage', {
    enum: [
      'Inquiry',
      'Sales Review',
      'Engineering Design',
      'Quotation',
      'Approval',
      'Dispatch',
      'Delivery',
      'Completed',
      'Cancelled',
    ],
  }).notNull(),
  currentStatus: text('current_status').notNull().default('Open'),
  assignedDepartment: text('assigned_department'),
  assignedUserId: uuid('assigned_user_id').references(() => users.id),
  metadata: jsonb('metadata'),
  slaBreached: boolean('sla_breached').notNull().default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type ServiceRequest = typeof serviceRequests.$inferSelect;
export type NewServiceRequest = typeof serviceRequests.$inferInsert;
