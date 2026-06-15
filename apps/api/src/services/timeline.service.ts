/**
 * TimelineService
 *
 * Retrieves the ordered event timeline for a given service request,
 * enforcing existence checks and enriching each entry with joined data.
 *
 * Requirements: 4.1, 4.2, 4.3
 */

import { eq, asc, sql } from 'drizzle-orm';

import { db } from '../db/client.js';
import { timelines } from '../db/schema/timelines.js';
import { events } from '../db/schema/events.js';
import { serviceRequests } from '../db/schema/service-requests.js';
import { users } from '../db/schema/users.js';
import type { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** A single enriched timeline entry as returned by GET /timeline/{request_id} */
export interface TimelineEntry {
  /** The event's UUID */
  eventId: string;
  /** e.g. "stage_change", "comment_added" */
  eventType: string;
  /** ISO 8601 UTC, millisecond-precision */
  occurredAt: string;
  /** Originating department — null if not available (Req 4.1) */
  department: string | null;
  /** User that triggered the event — null if not available (Req 4.1) */
  triggeredByUser: { id: string; email: string } | null;
  /** Source system identifier */
  sourceSystem: string;
  /** State value before the event — null if not applicable (Req 4.1) */
  previousState: string | null;
  /** State value after the event — null if not applicable (Req 4.1) */
  newState: string | null;
  /** Arbitrary event-level metadata — null if absent (Req 4.1) */
  metadata: Record<string, unknown> | null;
}

// ---------------------------------------------------------------------------
// Custom errors
// ---------------------------------------------------------------------------

export class NotFoundError extends Error {
  readonly statusCode = 404;

  constructor(message: string) {
    super(message);
    this.name = 'NotFoundError';
  }
}

// ---------------------------------------------------------------------------
// TimelineService
// ---------------------------------------------------------------------------

export class TimelineService {
  /**
   * Return the ordered timeline for a service request.
   *
   * - Verifies the service_request exists (throws NotFoundError → 404 if not)
   * - JOINs timelines → events → users
   * - Orders by occurred_at ASC, event_id ASC as tie-breaker (Req 4.3)
   * - Missing enrichment fields are returned as null, NOT omitted (Req 4.1)
   *
   * @param requestId  UUID of the service request
   * @param userId     UUID of the requesting user (reserved for future row-level scoping)
   * @param userRole   Role of the requesting user (reserved for future role-based filtering)
   *
   * Requirements: 4.1, 4.2, 4.3
   */
  async getTimeline(
    requestId: string,
    userId: string,
    userRole: UserRole,
  ): Promise<TimelineEntry[]> {
    // -----------------------------------------------------------------------
    // 1. Verify service request exists (Req 4.2)
    // -----------------------------------------------------------------------
    const [request] = await db
      .select({ id: serviceRequests.id })
      .from(serviceRequests)
      .where(eq(serviceRequests.id, requestId))
      .limit(1);

    if (!request) {
      throw new NotFoundError(`Service request not found: ${requestId}`);
    }

    // -----------------------------------------------------------------------
    // 2. JOIN timelines → events → users
    //    Order by occurred_at ASC, event_id ASC (Req 4.3)
    // -----------------------------------------------------------------------
    const rows = await db
      .select({
        eventId: events.id,
        eventType: events.eventType,
        occurredAt: events.occurredAt,
        department: events.department,
        triggeredByUserId: events.triggeredByUserId,
        triggeredByUserEmail: users.email,
        sourceSystem: events.sourceSystem,
        previousState: events.previousState,
        newState: events.newState,
        metadata: events.metadata,
      })
      .from(timelines)
      .innerJoin(events, eq(timelines.eventId, events.id))
      .leftJoin(users, eq(events.triggeredByUserId, users.id))
      .where(eq(timelines.requestId, requestId))
      .orderBy(asc(events.occurredAt), asc(sql`${events.id}::text`));

    // -----------------------------------------------------------------------
    // 3. Map rows to TimelineEntry — null for missing enrichment fields (Req 4.1)
    // -----------------------------------------------------------------------
    return rows.map((row) => ({
      eventId: row.eventId,
      eventType: row.eventType,
      occurredAt: row.occurredAt.toISOString(),
      department: row.department ?? null,
      triggeredByUser:
        row.triggeredByUserId && row.triggeredByUserEmail
          ? { id: row.triggeredByUserId, email: row.triggeredByUserEmail }
          : null,
      sourceSystem: row.sourceSystem,
      previousState: row.previousState ?? null,
      newState: row.newState ?? null,
      metadata: (row.metadata as Record<string, unknown> | null) ?? null,
    }));
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const timelineService = new TimelineService();
