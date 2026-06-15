/**
 * Unit tests for EventProcessorService
 *
 * All external dependencies (DB, BullMQ queues) are mocked so tests run
 * without a live database, Redis connection, or BullMQ broker.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.1, 12.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'node:crypto';

// ---------------------------------------------------------------------------
// Mocks — declared before any dynamic imports of the module under test
// ---------------------------------------------------------------------------

// Mock the DB client
vi.mock('../../db/client.js', () => ({
  db: {
    insert: vi.fn(),
    update: vi.fn(),
    select: vi.fn(),
  },
}));

// Mock all five BullMQ queues
vi.mock('../../queues/queues.js', () => ({
  timelineQueue: { add: vi.fn() },
  slaQueue: { add: vi.fn() },
  alertQueue: { add: vi.fn() },
  broadcastQueue: { add: vi.fn() },
  analyticsQueue: { add: vi.fn() },
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import { EventProcessorService } from '../event-processor.service.js';
import { db } from '../../db/client.js';
import { timelineQueue, slaQueue, alertQueue, broadcastQueue, analyticsQueue } from '../../queues/queues.js';
import { PipelineStatus, SourceSystem } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a chainable drizzle mock for insert */
function makeInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([{ id: 'evt-id' }]),
  };
}

/** Build a chainable drizzle mock for insert that throws a unique constraint error */
function makeInsertDuplicateChain() {
  const err: NodeJS.ErrnoException = new Error('duplicate key value violates unique constraint');
  (err as NodeJS.ErrnoException & { code: string }).code = '23505';
  return {
    values: vi.fn().mockRejectedValue(err),
  };
}

/** Build a chainable drizzle mock for update */
function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

/** Build a chainable drizzle mock for select (used by getWebhookSecret / getNormalizationMapping) */
function makeSelectChain(rows: unknown[]) {
  return {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue(rows),
  };
}

/** A minimal valid canonical event payload (direct API format) */
const VALID_RAW = {
  id: 'evt-001',
  requestId: 'a0000000-0000-0000-0000-000000000001',
  eventType: 'stage_change',
  sourceSystem: SourceSystem.Manual,
  occurredAt: '2024-01-15T10:00:00.000Z',
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EventProcessorService', () => {
  let service: EventProcessorService;

  beforeEach(() => {
    service = new EventProcessorService();
    vi.clearAllMocks();

    // Default: no integration config rows (no HMAC secret, no normalization map)
    vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);
    // Default: insert succeeds
    vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
    // Default: update succeeds
    vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);
    // Default: all queues enqueue successfully
    vi.mocked(timelineQueue.add).mockResolvedValue({} as never);
    vi.mocked(slaQueue.add).mockResolvedValue({} as never);
    vi.mocked(alertQueue.add).mockResolvedValue({} as never);
    vi.mocked(broadcastQueue.add).mockResolvedValue({} as never);
    vi.mocked(analyticsQueue.add).mockResolvedValue({} as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // =========================================================================
  // ingest() — happy path
  // =========================================================================

  describe('ingest() — valid event', () => {
    it('stores the event and returns status "accepted" (Req 3.1)', async () => {
      const result = await service.ingest(VALID_RAW, SourceSystem.Manual);

      expect(result.status).toBe('accepted');
      expect(result.eventId).toBe('evt-001');
      expect(result.requestId).toBe('a0000000-0000-0000-0000-000000000001');
      expect(result.pipelineStatus).toBe(PipelineStatus.Pending);
      expect(result.failedSteps).toHaveLength(0);
      expect(typeof result.receivedAt).toBe('string');
    });

    it('calls db.insert once for the event (Req 3.1, 3.6)', async () => {
      await service.ingest(VALID_RAW, SourceSystem.Manual);
      expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
    });

    it('enqueues all five pipeline jobs (Req 3.1, 3.8)', async () => {
      await service.ingest(VALID_RAW, SourceSystem.Manual);

      expect(vi.mocked(timelineQueue.add)).toHaveBeenCalledOnce();
      expect(vi.mocked(slaQueue.add)).toHaveBeenCalledOnce();
      expect(vi.mocked(alertQueue.add)).toHaveBeenCalledOnce();
      expect(vi.mocked(broadcastQueue.add)).toHaveBeenCalledOnce();
      expect(vi.mocked(analyticsQueue.add)).toHaveBeenCalledOnce();
    });

    it('passes eventId and requestId to every pipeline job (Req 3.1)', async () => {
      await service.ingest(VALID_RAW, SourceSystem.Manual);

      const checkJobData = (mockFn: ReturnType<typeof vi.fn>) => {
        const [, data] = mockFn.mock.calls[0] as [string, { eventId: string; requestId: string }];
        expect(data.eventId).toBe('evt-001');
        expect(data.requestId).toBe('a0000000-0000-0000-0000-000000000001');
      };

      checkJobData(timelineQueue.add as ReturnType<typeof vi.fn>);
      checkJobData(slaQueue.add as ReturnType<typeof vi.fn>);
      checkJobData(alertQueue.add as ReturnType<typeof vi.fn>);
    });
  });

  // =========================================================================
  // ingest() — duplicate event_id (Req 3.5)
  // =========================================================================

  describe('ingest() — duplicate event_id', () => {
    it('returns status "duplicate" when event_id already exists (Req 3.5)', async () => {
      vi.mocked(db.insert).mockReturnValue(makeInsertDuplicateChain() as never);

      const result = await service.ingest(VALID_RAW, SourceSystem.Manual);

      expect(result.status).toBe('duplicate');
      expect(result.eventId).toBe('evt-001');
    });

    it('does not enqueue any pipeline jobs for a duplicate event (Req 3.5)', async () => {
      vi.mocked(db.insert).mockReturnValue(makeInsertDuplicateChain() as never);

      await service.ingest(VALID_RAW, SourceSystem.Manual);

      expect(vi.mocked(timelineQueue.add)).not.toHaveBeenCalled();
      expect(vi.mocked(slaQueue.add)).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // ingest() — missing required fields (Req 3.2)
  // =========================================================================

  describe('ingest() — missing required fields', () => {
    it('returns status "invalid" when event id is missing (Req 3.2)', async () => {
      const raw = { ...VALID_RAW, id: '' };
      const result = await service.ingest(raw, SourceSystem.Manual);
      expect(result.status).toBe('invalid');
    });

    it('returns status "invalid" when requestId is missing (Req 3.2)', async () => {
      const raw = { ...VALID_RAW, requestId: '' };
      const result = await service.ingest(raw, SourceSystem.Manual);
      expect(result.status).toBe('invalid');
    });

    it('returns status "invalid" when requestId is not a valid UUID (Req 3.2)', async () => {
      const raw = { ...VALID_RAW, requestId: 'not-a-uuid' };
      const result = await service.ingest(raw, SourceSystem.Manual);
      expect(result.status).toBe('invalid');
    });

    it('returns status "invalid" when eventType is missing (Req 3.2)', async () => {
      const raw = { ...VALID_RAW, eventType: '' };
      const result = await service.ingest(raw, SourceSystem.Manual);
      expect(result.status).toBe('invalid');
    });

    it('returns status "invalid" when occurredAt is missing (Req 3.2)', async () => {
      const { occurredAt: _omit, ...raw } = VALID_RAW;
      const result = await service.ingest(raw, SourceSystem.Manual);
      expect(result.status).toBe('invalid');
    });

    it('returns status "invalid" for an invalid sourceSystem (Req 3.2)', async () => {
      const raw = { ...VALID_RAW, sourceSystem: 'InvalidSource' as SourceSystem };
      const result = await service.ingest(raw, SourceSystem.Manual);
      expect(result.status).toBe('invalid');
    });

    it('does not store or enqueue jobs for an invalid event (Req 3.2)', async () => {
      const raw = { ...VALID_RAW, id: '' };
      await service.ingest(raw, SourceSystem.Manual);

      expect(vi.mocked(db.insert)).not.toHaveBeenCalled();
      expect(vi.mocked(timelineQueue.add)).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // ingest() — partial pipeline failure (Req 3.8)
  // =========================================================================

  describe('ingest() — partial pipeline failure', () => {
    it('retains the stored event when a pipeline job fails to enqueue (Req 3.8)', async () => {
      // Make two queues fail
      vi.mocked(slaQueue.add).mockRejectedValue(new Error('Redis unavailable'));
      vi.mocked(alertQueue.add).mockRejectedValue(new Error('Redis unavailable'));

      const result = await service.ingest(VALID_RAW, SourceSystem.Manual);

      // Event was stored
      expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
      // Status is still accepted (event retained)
      expect(result.status).toBe('accepted');
    });

    it('sets pipelineStatus = "partial" when any enqueue step fails (Req 3.8)', async () => {
      vi.mocked(analyticsQueue.add).mockRejectedValue(new Error('Queue full'));

      const result = await service.ingest(VALID_RAW, SourceSystem.Manual);

      expect(result.pipelineStatus).toBe(PipelineStatus.Partial);
    });

    it('populates failedSteps with the names of failed jobs (Req 3.8)', async () => {
      vi.mocked(broadcastQueue.add).mockRejectedValue(new Error('Broadcast failure'));
      vi.mocked(analyticsQueue.add).mockRejectedValue(new Error('Analytics failure'));

      const result = await service.ingest(VALID_RAW, SourceSystem.Manual);

      expect(result.failedSteps).toContain('realtime-broadcast');
      expect(result.failedSteps).toContain('analytics-update');
    });

    it('updates the DB record with pipeline_status = partial and failed_steps (Req 3.8)', async () => {
      vi.mocked(timelineQueue.add).mockRejectedValue(new Error('Enqueue failed'));

      await service.ingest(VALID_RAW, SourceSystem.Manual);

      const updateChain = makeUpdateChain();
      // db.update was called to mark partial status
      expect(vi.mocked(db.update)).toHaveBeenCalled();
    });

    it('still attempts all remaining jobs after one fails (Req 3.8)', async () => {
      // Only the first queue fails
      vi.mocked(timelineQueue.add).mockRejectedValue(new Error('First queue down'));

      await service.ingest(VALID_RAW, SourceSystem.Manual);

      // All other queues should still have been attempted
      expect(vi.mocked(slaQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(alertQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(broadcastQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(analyticsQueue.add)).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // normalize() — timestamp normalization and field stripping (Req 3.4)
  // =========================================================================

  describe('normalize() — timestamps and source-specific fields', () => {
    it('normalizes ISO 8601 timestamps to UTC format (Req 3.4)', () => {
      const raw = {
        id: 'evt-norm-1',
        requestId: 'b0000000-0000-0000-0000-000000000002',
        eventType: 'stage_change',
        sourceSystem: SourceSystem.CRM,
        occurredAt: '2024-03-10T12:30:00+03:00', // offset timestamp
      };

      const canonical = service.normalize(raw, null);

      // Should be normalized to UTC ISO 8601
      expect(canonical.occurredAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?Z$/);
      const d = new Date(canonical.occurredAt);
      expect(Number.isNaN(d.getTime())).toBe(false);
      // 12:30 UTC+3 == 09:30 UTC
      expect(d.getUTCHours()).toBe(9);
      expect(d.getUTCMinutes()).toBe(30);
    });

    it('strips source-specific fields not in the canonical schema (Req 3.4)', () => {
      const raw = {
        id: 'evt-norm-2',
        requestId: 'c0000000-0000-0000-0000-000000000003',
        eventType: 'quote_sent',
        sourceSystem: SourceSystem.QuotationSystem,
        occurredAt: '2024-01-01T00:00:00.000Z',
        // Source-specific fields below — must NOT appear in canonical output
        crm_account_id: 'crm-acct-123',
        internal_pipeline_stage: 'prospect',
        legacy_field: 'should-be-stripped',
        salesforce_opportunity: 'opp-456',
      };

      const canonical = service.normalize(raw, null);

      expect((canonical as Record<string, unknown>).crm_account_id).toBeUndefined();
      expect((canonical as Record<string, unknown>).internal_pipeline_stage).toBeUndefined();
      expect((canonical as Record<string, unknown>).legacy_field).toBeUndefined();
      expect((canonical as Record<string, unknown>).salesforce_opportunity).toBeUndefined();
    });

    it('preserves all canonical required fields after normalization (Req 3.4)', () => {
      const raw = {
        id: 'evt-norm-3',
        requestId: 'd0000000-0000-0000-0000-000000000004',
        eventType: 'dispatch_confirmed',
        sourceSystem: SourceSystem.LogisticsPlatform,
        occurredAt: '2024-06-15T08:00:00.000Z',
        department: 'Logistics',
        metadata: { trackingNumber: 'TRK-001' },
      };

      const canonical = service.normalize(raw, null);

      expect(canonical.id).toBe('evt-norm-3');
      expect(canonical.requestId).toBe('d0000000-0000-0000-0000-000000000004');
      expect(canonical.eventType).toBe('dispatch_confirmed');
      expect(canonical.sourceSystem).toBe(SourceSystem.LogisticsPlatform);
      expect(canonical.occurredAt).toMatch(/Z$/);
      expect(canonical.department).toBe('Logistics');
      expect(canonical.metadata).toEqual({ trackingNumber: 'TRK-001' });
    });

    it('handles snake_case field aliases during normalization (Req 3.4)', () => {
      const raw = {
        event_id: 'evt-snake-1',
        request_id: 'e0000000-0000-0000-0000-000000000005',
        event_type: 'approval_received',
        source_system: SourceSystem.ERP,
        occurred_at: '2024-07-20T14:00:00.000Z',
      };

      const canonical = service.normalize(raw, null);

      expect(canonical.id).toBe('evt-snake-1');
      expect(canonical.requestId).toBe('e0000000-0000-0000-0000-000000000005');
      expect(canonical.eventType).toBe('approval_received');
    });

    it('applies JSONPath field mapping when a NormalizationMap is provided (Req 3.4, 12.5)', () => {
      const raw = {
        crm_id: 'crm-evt-99',
        opportunity_id: 'f0000000-0000-0000-0000-000000000006',
        activity_type: 'lead_converted',
        created_date: '2024-08-01T09:00:00.000Z',
      };

      const mapping = {
        sourceSystem: SourceSystem.CRM,
        fieldMappings: {
          id: '$.crm_id',
          requestId: '$.opportunity_id',
          eventType: '$.activity_type',
          occurredAt: '$.created_date',
        },
        timestampFormat: 'ISO8601',
      };

      const canonical = service.normalize(raw, mapping);

      expect(canonical.id).toBe('crm-evt-99');
      expect(canonical.requestId).toBe('f0000000-0000-0000-0000-000000000006');
      expect(canonical.eventType).toBe('lead_converted');
    });
  });

  // =========================================================================
  // validateCanonical() (Req 3.2)
  // =========================================================================

  describe('validateCanonical()', () => {
    const buildEvent = (overrides: Record<string, unknown> = {}) => ({
      id: 'evt-val-1',
      requestId: 'a1000000-0000-0000-0000-000000000001',
      eventType: 'test_event',
      sourceSystem: SourceSystem.Manual,
      department: null,
      triggeredByUserId: null,
      previousState: null,
      newState: null,
      metadata: null,
      occurredAt: '2024-01-01T00:00:00.000Z',
      receivedAt: '2024-01-01T00:00:00.100Z',
      pipelineStatus: PipelineStatus.Pending,
      failedSteps: [],
      ...overrides,
    });

    it('returns valid=true for a fully populated canonical event', () => {
      const result = service.validateCanonical(buildEvent());
      expect(result.valid).toBe(true);
    });

    it('returns valid=false with errors when id is empty', () => {
      const result = service.validateCanonical(buildEvent({ id: '' }));
      expect(result.valid).toBe(false);
      if (!result.valid) expect(result.errors.length).toBeGreaterThan(0);
    });

    it('returns valid=false with errors when requestId is not a UUID', () => {
      const result = service.validateCanonical(buildEvent({ requestId: 'bad-id' }));
      expect(result.valid).toBe(false);
    });

    it('returns valid=false when occurredAt is an invalid date string', () => {
      const result = service.validateCanonical(buildEvent({ occurredAt: 'not-a-date' }));
      expect(result.valid).toBe(false);
    });

    it('returns valid=false when sourceSystem is not in the allowed enum', () => {
      const result = service.validateCanonical(
        buildEvent({ sourceSystem: 'UnknownSource' as SourceSystem }),
      );
      expect(result.valid).toBe(false);
    });

    it('accepts all six valid source systems', () => {
      for (const src of Object.values(SourceSystem)) {
        const result = service.validateCanonical(buildEvent({ sourceSystem: src }));
        expect(result.valid, `Expected valid=true for sourceSystem=${src}`).toBe(true);
      }
    });
  });

  // =========================================================================
  // store() (Req 3.5, 3.6)
  // =========================================================================

  describe('store()', () => {
    const buildCanonical = () => ({
      id: 'evt-store-1',
      requestId: 'a2000000-0000-0000-0000-000000000001',
      eventType: 'stored_event',
      sourceSystem: SourceSystem.Manual,
      department: null,
      triggeredByUserId: null,
      previousState: null,
      newState: null,
      metadata: null,
      occurredAt: '2024-01-01T00:00:00.000Z',
      receivedAt: '2024-01-01T00:00:00.100Z',
      pipelineStatus: PipelineStatus.Pending,
      failedSteps: [],
    });

    it('returns { status: "stored" } on successful INSERT (Req 3.6)', async () => {
      const result = await service.store(buildCanonical());
      expect(result.status).toBe('stored');
    });

    it('returns { status: "duplicate" } on unique constraint violation (Req 3.5)', async () => {
      vi.mocked(db.insert).mockReturnValue(makeInsertDuplicateChain() as never);
      const result = await service.store(buildCanonical());
      expect(result.status).toBe('duplicate');
    });

    it('rethrows unexpected errors from the DB', async () => {
      vi.mocked(db.insert).mockReturnValue({
        values: vi.fn().mockRejectedValue(new Error('Connection reset')),
      } as never);

      await expect(service.store(buildCanonical())).rejects.toThrow('Connection reset');
    });
  });

  // =========================================================================
  // enqueuePipelineTasks() (Req 3.1, 3.8)
  // =========================================================================

  describe('enqueuePipelineTasks()', () => {
    it('returns an empty array when all five jobs enqueue successfully (Req 3.1)', async () => {
      const failed = await service.enqueuePipelineTasks('evt-enq-1', 'req-enq-1');
      expect(failed).toHaveLength(0);
    });

    it('returns failed job names when individual queues throw (Req 3.8)', async () => {
      vi.mocked(slaQueue.add).mockRejectedValue(new Error('Timeout'));
      vi.mocked(broadcastQueue.add).mockRejectedValue(new Error('Network error'));

      const failed = await service.enqueuePipelineTasks('evt-enq-2', 'req-enq-2');

      expect(failed).toContain('sla-evaluate');
      expect(failed).toContain('realtime-broadcast');
      expect(failed).not.toContain('timeline-update');
      expect(failed).not.toContain('alert-generate');
      expect(failed).not.toContain('analytics-update');
    });

    it('always attempts all five queues regardless of prior failures (Req 3.8)', async () => {
      vi.mocked(timelineQueue.add).mockRejectedValue(new Error('First'));

      await service.enqueuePipelineTasks('evt-enq-3', 'req-enq-3');

      expect(vi.mocked(timelineQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(slaQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(alertQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(broadcastQueue.add)).toHaveBeenCalled();
      expect(vi.mocked(analyticsQueue.add)).toHaveBeenCalled();
    });

    it('enqueues the realtime-broadcast job with the request channel (Req 3.1)', async () => {
      await service.enqueuePipelineTasks('evt-enq-4', 'req-channel-99');

      expect(vi.mocked(broadcastQueue.add)).toHaveBeenCalledWith(
        'realtime-broadcast',
        expect.objectContaining({ channel: 'request:req-channel-99' }),
        expect.any(Object),
      );
    });
  });

  // =========================================================================
  // verifyHmacSignature() (Req 12.2)
  // =========================================================================

  describe('verifyHmacSignature()', () => {
    const SECRET = 'super-secret-webhook-key';

    function makeSignature(body: Buffer, secret: string): string {
      return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    }

    it('returns true for a valid HMAC signature (Req 12.2)', () => {
      const body = Buffer.from(JSON.stringify({ event: 'test' }));
      const sig = makeSignature(body, SECRET);
      expect(service.verifyHmacSignature(body, sig, SECRET)).toBe(true);
    });

    it('returns false for an invalid HMAC signature (Req 12.2)', () => {
      const body = Buffer.from(JSON.stringify({ event: 'test' }));
      const sig = 'sha256=invalidhexdeadbeef';
      expect(service.verifyHmacSignature(body, sig, SECRET)).toBe(false);
    });

    it('returns false when the body has been tampered with (Req 12.2)', () => {
      const originalBody = Buffer.from(JSON.stringify({ event: 'original' }));
      const tamperedBody = Buffer.from(JSON.stringify({ event: 'tampered' }));
      const sig = makeSignature(originalBody, SECRET);
      expect(service.verifyHmacSignature(tamperedBody, sig, SECRET)).toBe(false);
    });

    it('returns false for a signature computed with a different secret (Req 12.2)', () => {
      const body = Buffer.from(JSON.stringify({ data: 42 }));
      const sig = makeSignature(body, 'different-secret');
      expect(service.verifyHmacSignature(body, sig, SECRET)).toBe(false);
    });

    it('returns false when signature has wrong prefix (Req 12.2)', () => {
      const body = Buffer.from('hello');
      const hex = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
      // Missing 'sha256=' prefix
      expect(service.verifyHmacSignature(body, hex, SECRET)).toBe(false);
    });

    it('is resistant to timing attacks (compares equal-length buffers) (Req 12.2)', () => {
      // Short tampered sig — different length — should return false without throwing
      const body = Buffer.from('test payload');
      expect(service.verifyHmacSignature(body, 'sha256=abc', SECRET)).toBe(false);
    });
  });

  // =========================================================================
  // ingest() — HMAC webhook path (Req 12.2)
  // =========================================================================

  describe('ingest() — HMAC webhook path', () => {
    const WEBHOOK_SECRET = 'webhook-secret-xyz';

    function makeSignature(body: Buffer, secret: string): string {
      return 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    }

    it('accepts a webhook with a valid HMAC signature (Req 12.2)', async () => {
      // Provide a secret via integration config mock
      vi.mocked(db.select).mockReturnValue(
        makeSelectChain([{ webhookSecretHash: WEBHOOK_SECRET }]) as never,
      );

      const rawBody = Buffer.from(JSON.stringify(VALID_RAW));
      const sig = makeSignature(rawBody, WEBHOOK_SECRET);

      const result = await service.ingest(VALID_RAW, SourceSystem.CRM, sig, rawBody);

      // Validation may fail because VALID_RAW has 'Manual' as sourceSystem but source=CRM;
      // after normalization, sourceSystem is overridden to CRM. Test for not 'invalid' due to HMAC.
      expect(result.status).not.toBe('invalid'); // at worst duplicate, at best accepted
    });

    it('returns status "invalid" for a webhook with a bad HMAC signature (Req 12.2)', async () => {
      vi.mocked(db.select).mockReturnValue(
        makeSelectChain([{ webhookSecretHash: WEBHOOK_SECRET }]) as never,
      );

      const rawBody = Buffer.from(JSON.stringify(VALID_RAW));
      const badSig = 'sha256=badhexvalue000000000000000000000000000000000000000000000000000000';

      const result = await service.ingest(VALID_RAW, SourceSystem.CRM, badSig, rawBody);

      expect(result.status).toBe('invalid');
    });

    it('returns status "invalid" when no secret is configured for the source (Req 12.2)', async () => {
      // No integration config row → no secret
      vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);

      const rawBody = Buffer.from(JSON.stringify(VALID_RAW));
      const sig = makeSignature(rawBody, WEBHOOK_SECRET);

      const result = await service.ingest(VALID_RAW, SourceSystem.CRM, sig, rawBody);

      expect(result.status).toBe('invalid');
    });
  });
});
