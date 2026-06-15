/**
 * EventProcessorService
 *
 * Orchestrates the full event ingestion pipeline:
 *   1. HMAC signature verification  (verifyHmacSignature)
 *   2. Normalization via JSONPath mapping  (normalize)
 *   3. Canonical field validation  (validateCanonical)
 *   4. Immutable INSERT to events table  (store)
 *   5. Enqueue five BullMQ pipeline jobs  (enqueuePipelineTasks)
 *
 * On partial pipeline failure the stored event is updated with
 * `pipeline_status = 'partial'` and `failed_steps` populated.
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.1, 12.2
 */

import crypto from 'node:crypto';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { db } from '../db/client.js';
import { events, type NewEvent } from '../db/schema/events.js';
import { integrationConfigs } from '../db/schema/integration-configs.js';
import {
  timelineQueue,
  slaQueue,
  alertQueue,
  broadcastQueue,
  analyticsQueue,
} from '../queues/queues.js';
import { PipelineStatus, SourceSystem } from '@dayliff/types';
import type {
  CanonicalEvent,
  IngestResult,
  NormalizationMap,
  RawEventPayload,
} from '@dayliff/types';

// ---------------------------------------------------------------------------
// Zod schema for canonical event validation
// ---------------------------------------------------------------------------

const VALID_SOURCE_SYSTEMS: SourceSystem[] = Object.values(SourceSystem);

export const CanonicalEventSchema = z.object({
  id: z.string().min(1),
  requestId: z.string().uuid(),
  eventType: z.string().min(1),
  sourceSystem: z.enum([
    SourceSystem.CRM,
    SourceSystem.ERP,
    SourceSystem.EngineeringSoftware,
    SourceSystem.QuotationSystem,
    SourceSystem.LogisticsPlatform,
    SourceSystem.Manual,
  ] as [SourceSystem, ...SourceSystem[]]),
  occurredAt: z.string().min(1).refine(
    (v) => !Number.isNaN(Date.parse(v)),
    { message: 'occurredAt must be a valid date-time string' },
  ),
});

export type ValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

// ---------------------------------------------------------------------------
// Internal canonical schema fields — used to strip unknown fields
// ---------------------------------------------------------------------------

const CANONICAL_FIELD_KEYS: ReadonlyArray<keyof CanonicalEvent> = [
  'id',
  'requestId',
  'eventType',
  'sourceSystem',
  'department',
  'triggeredByUserId',
  'previousState',
  'newState',
  'metadata',
  'occurredAt',
  'receivedAt',
  'pipelineStatus',
  'failedSteps',
];

// ---------------------------------------------------------------------------
// Simple JSONPath evaluator (supports `$.field` and `$.nested.field`)
// ---------------------------------------------------------------------------

function evaluateJsonPath(path: string, data: Record<string, unknown>): unknown {
  if (!path.startsWith('$')) return undefined;

  // Strip leading `$.`
  const segments = path.slice(2).split('.');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = data;

  for (const segment of segments) {
    if (current === null || current === undefined) return undefined;
    if (typeof current !== 'object') return undefined;
    current = current[segment];
  }

  return current;
}

// ---------------------------------------------------------------------------
// Timestamp normalization — converts common formats to ISO 8601 UTC
// ---------------------------------------------------------------------------

function toIso8601Utc(raw: unknown): string {
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    return new Date().toISOString();
  }

  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // Fallback: try parsing as a numeric unix timestamp (seconds)
    const ms = Number(raw) * 1000;
    const fromUnix = new Date(ms);
    if (!Number.isNaN(fromUnix.getTime())) return fromUnix.toISOString();
    return new Date().toISOString();
  }

  return d.toISOString();
}

// ---------------------------------------------------------------------------
// EventProcessorService
// ---------------------------------------------------------------------------

export class EventProcessorService {
  /**
   * Full ingestion pipeline:
   * 1. If an HMAC signature is provided, verify it first.
   * 2. Look up normalization mapping for the source system (if any).
   * 3. Normalize the raw payload into a CanonicalEvent.
   * 4. Validate all required canonical fields.
   * 5. Store the event (immutable INSERT).
   * 6. Enqueue pipeline jobs; handle partial failures.
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 12.1, 12.2
   */
  async ingest(
    raw: RawEventPayload,
    source: SourceSystem,
    hmacSignature?: string,
    rawBody?: Buffer,
  ): Promise<IngestResult> {
    const receivedAt = new Date().toISOString();

    // 1. HMAC verification when a signature header is present (external webhooks)
    if (hmacSignature !== undefined) {
      // Retrieve the stored secret for this source system
      const secret = await this.getWebhookSecret(source);

      if (!secret) {
        // No secret configured — reject webhook call
        return {
          eventId: '',
          requestId: '',
          status: 'invalid',
          pipelineStatus: PipelineStatus.Partial,
          failedSteps: [],
          receivedAt,
        };
      }

      const body = rawBody ?? Buffer.from(JSON.stringify(raw));
      const valid = this.verifyHmacSignature(body, hmacSignature, secret);

      if (!valid) {
        return {
          eventId: '',
          requestId: '',
          status: 'invalid',
          pipelineStatus: PipelineStatus.Partial,
          failedSteps: [],
          receivedAt,
        };
      }
    }

    // 2. Look up normalization mapping
    let mapping: NormalizationMap | null = null;
    if (source !== SourceSystem.Manual) {
      mapping = await this.getNormalizationMapping(source);
    }

    // 3. Normalize
    let canonical: CanonicalEvent;
    try {
      canonical = this.normalize(raw, mapping);
      // Always override source system and receivedAt
      canonical.sourceSystem = source;
      canonical.receivedAt = receivedAt;
    } catch (err) {
      return {
        eventId: '',
        requestId: String(raw.requestId ?? raw.request_id ?? ''),
        status: 'invalid',
        pipelineStatus: PipelineStatus.Partial,
        failedSteps: [],
        receivedAt,
      };
    }

    // 4. Validate
    const validation = this.validateCanonical(canonical);
    if (!validation.valid) {
      return {
        eventId: canonical.id ?? '',
        requestId: canonical.requestId ?? '',
        status: 'invalid',
        pipelineStatus: PipelineStatus.Partial,
        failedSteps: validation.errors,
        receivedAt,
      };
    }

    // 5. Store
    const stored = await this.store(canonical);
    if (stored.status === 'duplicate') {
      return {
        eventId: canonical.id,
        requestId: canonical.requestId,
        status: 'duplicate',
        pipelineStatus: PipelineStatus.Pending,
        failedSteps: [],
        receivedAt,
      };
    }

    // 6. Enqueue pipeline jobs
    const failedSteps = await this.enqueuePipelineTasks(canonical.id, canonical.requestId);

    if (failedSteps.length > 0) {
      // Update pipeline_status to partial and populate failed_steps
      await db
        .update(events)
        .set({
          pipelineStatus: PipelineStatus.Partial,
          failedSteps,
        })
        .where(eq(events.id, canonical.id));

      return {
        eventId: canonical.id,
        requestId: canonical.requestId,
        status: 'accepted',
        pipelineStatus: PipelineStatus.Partial,
        failedSteps,
        receivedAt,
      };
    }

    return {
      eventId: canonical.id,
      requestId: canonical.requestId,
      status: 'accepted',
      pipelineStatus: PipelineStatus.Pending,
      failedSteps: [],
      receivedAt,
    };
  }

  /**
   * Transform a raw payload into a CanonicalEvent using JSONPath field mappings.
   *
   * For Manual/direct API submissions (mapping === null) the raw payload is
   * treated as the canonical payload — only fields present in the canonical
   * schema are retained (source-specific fields stripped).
   *
   * Requirements: 3.4, 12.5
   */
  normalize(raw: RawEventPayload, mapping: NormalizationMap | null): CanonicalEvent {
    let mapped: Record<string, unknown>;

    if (mapping === null) {
      // Direct API submission — raw IS the canonical payload
      mapped = { ...(raw as Record<string, unknown>) };
    } else {
      // Apply JSONPath field mappings
      mapped = {};
      const { fieldMappings } = mapping;

      for (const [canonicalKey, jsonPath] of Object.entries(fieldMappings)) {
        const value = evaluateJsonPath(jsonPath, raw as Record<string, unknown>);
        if (value !== undefined) {
          mapped[canonicalKey] = value;
        }
      }
    }

    // Normalize timestamp fields to ISO 8601 UTC
    const timestampKeys = ['occurredAt', 'occurred_at', 'receivedAt', 'received_at'];
    for (const key of timestampKeys) {
      if (key in mapped) {
        const normalized = toIso8601Utc(mapped[key]);
        // Map snake_case → camelCase
        const camelKey = key.includes('_')
          ? key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase())
          : key;
        mapped[camelKey] = normalized;
        if (camelKey !== key) delete mapped[key];
      }
    }

    // Handle common snake_case → camelCase field name variants
    const fieldAliases: Record<string, string> = {
      event_id: 'id',
      request_id: 'requestId',
      event_type: 'eventType',
      source_system: 'sourceSystem',
      triggered_by_user_id: 'triggeredByUserId',
      triggered_by: 'triggeredByUserId',
      previous_state: 'previousState',
      new_state: 'newState',
    };

    for (const [snakeKey, camelKey] of Object.entries(fieldAliases)) {
      if (snakeKey in mapped && !(camelKey in mapped)) {
        mapped[camelKey] = mapped[snakeKey];
        delete mapped[snakeKey];
      }
    }

    // Strip any fields NOT in the canonical schema
    const stripped: Partial<CanonicalEvent> = {};
    for (const key of CANONICAL_FIELD_KEYS) {
      if (key in mapped) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (stripped as any)[key] = mapped[key];
      }
    }

    // Apply sensible defaults for optional fields
    return {
      id: String(stripped.id ?? ''),
      requestId: String(stripped.requestId ?? ''),
      eventType: String(stripped.eventType ?? ''),
      sourceSystem: (stripped.sourceSystem ?? SourceSystem.Manual) as SourceSystem,
      department: (stripped.department as string | null) ?? null,
      triggeredByUserId: (stripped.triggeredByUserId as string | null) ?? null,
      previousState: (stripped.previousState as string | null) ?? null,
      newState: (stripped.newState as string | null) ?? null,
      metadata: (stripped.metadata as Record<string, unknown> | null) ?? null,
      occurredAt: stripped.occurredAt ? toIso8601Utc(stripped.occurredAt) : new Date().toISOString(),
      receivedAt: stripped.receivedAt ?? new Date().toISOString(),
      pipelineStatus: PipelineStatus.Pending,
      failedSteps: [],
    };
  }

  /**
   * Validate that all required canonical fields are present and non-empty.
   *
   * Required fields: id, requestId, eventType, sourceSystem, occurredAt
   *
   * Requirements: 3.2, 3.4
   */
  validateCanonical(event: CanonicalEvent): ValidationResult {
    const result = CanonicalEventSchema.safeParse(event);

    if (result.success) {
      return { valid: true };
    }

    const errors = result.error.errors.map(
      (e) => `${e.path.join('.')}: ${e.message}`,
    );
    return { valid: false, errors };
  }

  /**
   * INSERT the canonical event into the events table.
   *
   * Returns `{ status: 'stored' }` on success.
   * Returns `{ status: 'duplicate' }` when the event_id already exists
   * (unique constraint violation from the DB).
   *
   * The event is intentionally stored with `pipelineStatus = 'pending'`
   * so pipeline workers can update it as they complete.
   *
   * Requirements: 3.5, 3.6
   */
  async store(
    event: CanonicalEvent,
  ): Promise<{ status: 'stored' } | { status: 'duplicate' }> {
    const newEvent: NewEvent = {
      id: event.id,
      requestId: event.requestId,
      eventType: event.eventType,
      sourceSystem: event.sourceSystem,
      department: event.department,
      triggeredByUserId: event.triggeredByUserId ?? null,
      previousState: event.previousState,
      newState: event.newState,
      metadata: event.metadata,
      occurredAt: new Date(event.occurredAt),
      receivedAt: new Date(event.receivedAt),
      pipelineStatus: PipelineStatus.Pending,
      failedSteps: event.failedSteps?.length ? event.failedSteps : null,
    };

    try {
      await db.insert(events).values(newEvent);
      return { status: 'stored' };
    } catch (err: unknown) {
      // PostgreSQL unique constraint violation code: 23505
      if (
        err instanceof Error &&
        'code' in err &&
        (err as NodeJS.ErrnoException & { code: string }).code === '23505'
      ) {
        return { status: 'duplicate' };
      }
      throw err;
    }
  }

  /**
   * Enqueue all five BullMQ pipeline jobs for the stored event.
   *
   * Jobs are enqueued independently. If any job fails to enqueue, it is
   * recorded in `failedSteps` and the remaining jobs continue to be attempted.
   *
   * Returns the list of job names that failed to enqueue (empty on full success).
   *
   * Requirements: 3.1, 3.8
   */
  async enqueuePipelineTasks(eventId: string, requestId: string): Promise<string[]> {
    const failedSteps: string[] = [];

    const jobs: Array<{ queue: typeof timelineQueue; name: string; data: Record<string, unknown> }> = [
      {
        queue: timelineQueue,
        name: 'timeline-update',
        data: { eventId, requestId },
      },
      {
        queue: slaQueue,
        name: 'sla-evaluate',
        data: { eventId, requestId },
      },
      {
        queue: alertQueue,
        name: 'alert-generate',
        data: { eventId, requestId },
      },
      {
        queue: broadcastQueue,
        name: 'realtime-broadcast',
        data: { eventId, requestId, channel: `request:${requestId}` },
      },
      {
        queue: analyticsQueue,
        name: 'analytics-update',
        data: { eventId, requestId },
      },
    ];

    for (const job of jobs) {
      try {
        await job.queue.add(job.name, job.data, {
          removeOnComplete: 100,
          removeOnFail: 50,
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 1000,
          },
        });
      } catch {
        failedSteps.push(job.name);
      }
    }

    return failedSteps;
  }

  /**
   * Timing-safe HMAC-SHA256 signature verification.
   *
   * The expected signature format is: `sha256=<hex_digest>`
   * This matches the format used by GitHub webhooks and most webhook providers.
   *
   * Requirements: 12.2
   */
  verifyHmacSignature(
    rawBody: Buffer,
    receivedSig: string,
    secret: string,
  ): boolean {
    const expected =
      'sha256=' +
      crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

    try {
      // Buffers must be the same length for timingSafeEqual
      if (Buffer.byteLength(expected) !== Buffer.byteLength(receivedSig)) {
        return false;
      }
      return crypto.timingSafeEqual(
        Buffer.from(expected),
        Buffer.from(receivedSig),
      );
    } catch {
      return false;
    }
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  /**
   * Retrieve the webhook secret for a given source system from integration_configs.
   * Returns null if no config is found or no secret is set.
   *
   * NOTE: In production this secret would be retrieved from Vault/Secrets Manager.
   * For now we retrieve from the DB as-is (stored raw, not hashed, for simplicity).
   */
  private async getWebhookSecret(source: SourceSystem): Promise<string | null> {
    try {
      const [config] = await db
        .select({ webhookSecretHash: integrationConfigs.webhookSecretHash })
        .from(integrationConfigs)
        .where(eq(integrationConfigs.sourceSystem, source))
        .limit(1);

      return config?.webhookSecretHash ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Retrieve the normalization mapping for a given source system.
   * Returns null if no config is found.
   *
   * Requirements: 3.4, 12.5
   */
  private async getNormalizationMapping(
    source: SourceSystem,
  ): Promise<NormalizationMap | null> {
    try {
      const [config] = await db
        .select({ normalizationMap: integrationConfigs.normalizationMap })
        .from(integrationConfigs)
        .where(eq(integrationConfigs.sourceSystem, source))
        .limit(1);

      if (!config?.normalizationMap) return null;

      const map = config.normalizationMap as Record<string, unknown>;

      return {
        sourceSystem: source,
        fieldMappings: (map.field_mappings ?? map.fieldMappings ?? {}) as Record<string, string>,
        timestampFormat: String(map.timestamp_format ?? map.timestampFormat ?? 'ISO8601'),
      };
    } catch {
      return null;
    }
  }
}

// ---------------------------------------------------------------------------
// Singleton export
// ---------------------------------------------------------------------------

export const eventProcessorService = new EventProcessorService();
