/**
 * Unit tests for TimelineService
 *
 * Requirements: 4.1, 4.2, 4.3
 *
 * All external dependencies (DB) are mocked so tests run without a live
 * database connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

vi.mock('../../db/client.js', () => ({
  db: {
    select: vi.fn(),
    execute: vi.fn(),
  },
}));

vi.mock('../../config/env.js', () => ({
  env: {
    DATABASE_URL: 'postgres://localhost/test',
    LOG_LEVEL: 'silent',
  },
}));

// ---------------------------------------------------------------------------
// Imports (after mocks)
// ---------------------------------------------------------------------------

import { TimelineService, NotFoundError } from '../timeline.service.js';
import { db } from '../../db/client.js';
import { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_REQUEST_ID = '00000000-0000-0000-0000-000000000001';
const MOCK_USER_ID = '00000000-0000-0000-0000-000000000002';
const MOCK_EVENT_ID_1 = '00000000-0000-0000-0000-000000000010';
const MOCK_EVENT_ID_2 = '00000000-0000-0000-0000-000000000011';

/** Builds a chainable Drizzle select mock that resolves with the given rows */
function makeSelectChain(rows: unknown[]) {
  const terminal = {
    orderBy: vi.fn().mockResolvedValue(rows),
  };
  const withWhere = {
    where: vi.fn().mockReturnValue(terminal),
  };
  const withLeftJoin = {
    leftJoin: vi.fn().mockReturnValue(withWhere),
  };
  const withInnerJoin = {
    innerJoin: vi.fn().mockReturnValue(withLeftJoin),
  };
  const withFrom = {
    from: vi.fn().mockReturnValue(withInnerJoin),
    // For the existence check query (select from serviceRequests with limit)
    limit: vi.fn().mockResolvedValue(rows),
  };
  return withFrom;
}

/** Builds a simple 2-call mock: first returns existence rows, second returns timeline rows */
function setupDbMocks(existenceRows: unknown[], timelineRows: unknown[]) {
  let callCount = 0;

  vi.mocked(db.select).mockImplementation(() => {
    callCount++;

    if (callCount === 1) {
      // Existence check: db.select().from(serviceRequests).where(...).limit(1)
      return {
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue(existenceRows),
          }),
        }),
      } as never;
    }

    // Timeline query: db.select({...}).from(timelines).innerJoin(...).leftJoin(...).where(...).orderBy(...)
    return {
      from: vi.fn().mockReturnValue({
        innerJoin: vi.fn().mockReturnValue({
          leftJoin: vi.fn().mockReturnValue({
            where: vi.fn().mockReturnValue({
              orderBy: vi.fn().mockResolvedValue(timelineRows),
            }),
          }),
        }),
      }),
    } as never;
  });
}

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const MOCK_TIMELINE_ROW_WITH_USER = {
  eventId: MOCK_EVENT_ID_1,
  eventType: 'stage_change',
  occurredAt: new Date('2024-01-15T08:00:00.000Z'),
  department: 'Engineering',
  triggeredByUserId: MOCK_USER_ID,
  triggeredByUserEmail: 'engineer@dayliff.com',
  sourceSystem: 'Manual',
  previousState: 'Inquiry',
  newState: 'Engineering Design',
  metadata: { note: 'Moved to design phase' },
};

const MOCK_TIMELINE_ROW_NO_USER = {
  eventId: MOCK_EVENT_ID_2,
  eventType: 'comment_added',
  occurredAt: new Date('2024-01-15T09:30:00.000Z'),
  department: null,
  triggeredByUserId: null,
  triggeredByUserEmail: null,
  sourceSystem: 'CRM',
  previousState: null,
  newState: null,
  metadata: null,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('TimelineService', () => {
  let service: TimelineService;

  beforeEach(() => {
    service = new TimelineService();
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // 404 for non-existent request (Req 4.2)
  // -------------------------------------------------------------------------

  describe('getTimeline() — 404 for non-existent requestId', () => {
    it('throws NotFoundError when service_request does not exist (Req 4.2)', async () => {
      // Existence check returns empty
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      await expect(
        service.getTimeline('nonexistent-id', MOCK_USER_ID, UserRole.Administrator),
      ).rejects.toThrow(NotFoundError);
    });

    it('NotFoundError has statusCode 404 (Req 4.2)', async () => {
      vi.mocked(db.select).mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockReturnValue({
            limit: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as never);

      try {
        await service.getTimeline('nonexistent-id', MOCK_USER_ID, UserRole.RegionalManager);
        expect.fail('Should have thrown');
      } catch (err) {
        expect(err).toBeInstanceOf(NotFoundError);
        expect((err as NotFoundError).statusCode).toBe(404);
      }
    });
  });

  // -------------------------------------------------------------------------
  // Ordered events with nulls for missing enrichment fields (Req 4.1, 4.3)
  // -------------------------------------------------------------------------

  describe('getTimeline() — ordered events with nulls for missing fields', () => {
    it('returns events in the order provided by the DB query (Req 4.3)', async () => {
      setupDbMocks(
        [{ id: MOCK_REQUEST_ID }],
        [MOCK_TIMELINE_ROW_WITH_USER, MOCK_TIMELINE_ROW_NO_USER],
      );

      const result = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(result).toHaveLength(2);
      expect(result[0].eventId).toBe(MOCK_EVENT_ID_1);
      expect(result[1].eventId).toBe(MOCK_EVENT_ID_2);
    });

    it('populates triggeredByUser when user data is present (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_WITH_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(entry.triggeredByUser).not.toBeNull();
      expect(entry.triggeredByUser!.id).toBe(MOCK_USER_ID);
      expect(entry.triggeredByUser!.email).toBe('engineer@dayliff.com');
    });

    it('returns null for triggeredByUser when user is not associated (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_NO_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(entry.triggeredByUser).toBeNull();
    });

    it('returns null for department when not set (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_NO_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(entry.department).toBeNull();
    });

    it('returns null for previousState and newState when not applicable (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_NO_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(entry.previousState).toBeNull();
      expect(entry.newState).toBeNull();
    });

    it('returns null for metadata when absent (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_NO_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(entry.metadata).toBeNull();
    });

    it('returns all enrichment fields as part of every entry (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_NO_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      // All fields must be present (not omitted) even when null
      expect(entry).toHaveProperty('eventId');
      expect(entry).toHaveProperty('eventType');
      expect(entry).toHaveProperty('occurredAt');
      expect(entry).toHaveProperty('department');
      expect(entry).toHaveProperty('triggeredByUser');
      expect(entry).toHaveProperty('sourceSystem');
      expect(entry).toHaveProperty('previousState');
      expect(entry).toHaveProperty('newState');
      expect(entry).toHaveProperty('metadata');
    });

    it('maps occurredAt to an ISO 8601 string (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_WITH_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(typeof entry.occurredAt).toBe('string');
      expect(() => new Date(entry.occurredAt)).not.toThrow();
      expect(new Date(entry.occurredAt).toISOString()).toBe('2024-01-15T08:00:00.000Z');
    });

    it('returns empty array when request exists but has no timeline entries', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], []);

      const result = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(result).toEqual([]);
    });

    it('returns enriched metadata object when present (Req 4.1)', async () => {
      setupDbMocks([{ id: MOCK_REQUEST_ID }], [MOCK_TIMELINE_ROW_WITH_USER]);

      const [entry] = await service.getTimeline(MOCK_REQUEST_ID, MOCK_USER_ID, UserRole.Administrator);

      expect(entry.metadata).toEqual({ note: 'Moved to design phase' });
    });
  });
});
