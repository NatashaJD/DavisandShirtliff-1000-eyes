/**
 * Zod schemas for Event ingestion API payloads
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 12.1
 */

import { z } from 'zod';

import { SourceSystem } from '../enums.js';

/** ISO 8601 UTC timestamp validator */
const isoUtcTimestamp = z
  .string()
  .regex(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/,
    'Timestamp must be ISO 8601 UTC format (e.g. 2024-01-15T10:30:00.000Z)',
  );

export const IngestEventSchema = z.object({
  /** Must be unique across all events (idempotency key) */
  id: z.string().min(1, 'Event ID is required'),
  requestId: z.string().uuid('Invalid request ID'),
  eventType: z.string().min(1, 'Event type is required').max(255),
  sourceSystem: z.nativeEnum(SourceSystem, {
    errorMap: () => ({ message: 'Invalid source system' }),
  }),
  department: z.string().max(255).optional(),
  triggeredByUserId: z.string().uuid().optional(),
  previousState: z.string().max(255).optional(),
  newState: z.string().max(255).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  occurredAt: isoUtcTimestamp,
});
export type IngestEventPayload = z.infer<typeof IngestEventSchema>;

export const GetEventsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  requestId: z.string().uuid().optional(),
  department: z.string().optional(),
  eventType: z.string().optional(),
  from: isoUtcTimestamp.optional(),
  to: isoUtcTimestamp.optional(),
});
export type GetEventsQuery = z.infer<typeof GetEventsQuerySchema>;
