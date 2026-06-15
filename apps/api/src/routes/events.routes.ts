/**
 * Events route plugin
 *
 * POST /events  — ingest a new event (HMAC webhook or authenticated API call)
 * GET  /events  — paginated, filterable event list
 *
 * HTTP status codes:
 *   202 — Event accepted (pipeline queued or partially queued)
 *   409 — Duplicate event_id
 *   413 — Payload exceeds 1 MB
 *   422 — Validation error (missing required fields or invalid schema)
 *   401 — Missing or invalid HMAC signature (for external webhook calls)
 *
 * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.7, 3.8, 12.1, 12.2
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { and, eq, gte, lte, desc, sql } from 'drizzle-orm';

import { authenticate } from '../middleware/auth.middleware.js';
import { authorize, Permission } from '../middleware/rbac.middleware.js';
import { eventProcessorService } from '../services/event-processor.service.js';
import { db } from '../db/client.js';
import { events } from '../db/schema/events.js';
import { SourceSystem } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const MAX_PAYLOAD_BYTES = 1_048_576; // 1 MB

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sendError(
  reply: FastifyReply,
  statusCode: number,
  message: string,
): FastifyReply {
  return reply.code(statusCode).send({
    success: false,
    data: null,
    meta: null,
    error: message,
  });
}

/**
 * Determine whether an incoming POST /events request is an external webhook
 * (identified by the presence of the X-Signature-SHA256 header).
 */
function isWebhookCall(request: FastifyRequest): boolean {
  return typeof request.headers['x-signature-sha256'] === 'string';
}

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function eventRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /events
   *
   * Accepts events from:
   *   a) External systems via HMAC-signed webhooks  (X-Signature-SHA256 header)
   *   b) Authenticated internal API calls           (Bearer JWT)
   *
   * For (a) HMAC is verified inside the service; for (b) JWT auth is checked
   * via the authenticate middleware.
   *
   * Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.8, 12.1, 12.2
   */
  app.post(
    '/events',
    {
      // Content-Length check is enforced by the Fastify bodyLimit (1MB set in app.ts).
      // We add an explicit preHandler for JWT auth when not a webhook call.
      config: {
        // Allow raw body access for HMAC computation
        rawBody: true,
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // -----------------------------------------------------------------------
      // 1. Payload size guard (Req 12.1)
      //    Fastify's bodyLimit already rejects >1MB with a 413, but we also
      //    check Content-Length header explicitly as an early guard.
      // -----------------------------------------------------------------------
      const contentLength = Number(request.headers['content-length'] ?? 0);
      if (contentLength > MAX_PAYLOAD_BYTES) {
        return sendError(reply, 413, 'Payload Too Large: maximum request body size is 1 MB');
      }

      const webhook = isWebhookCall(request);

      // -----------------------------------------------------------------------
      // 2. Authentication
      //    - Webhook calls: authenticate via HMAC (handled inside ingest)
      //    - Direct API calls: require a valid Bearer JWT
      // -----------------------------------------------------------------------
      if (!webhook) {
        // Run JWT authenticate middleware inline
        let authFailed = false;
        await authenticate(request, {
          ...reply,
          code: (statusCode: number) => {
            if (statusCode === 401) authFailed = true;
            return reply.code(statusCode);
          },
        } as FastifyReply);

        if (authFailed || !request.user) {
          return sendError(reply, 401, 'Unauthorized');
        }
      }

      // -----------------------------------------------------------------------
      // 3. Extract source system from body or header
      // -----------------------------------------------------------------------
      const body = request.body as Record<string, unknown>;

      const rawSourceSystem = (
        body?.sourceSystem ??
        body?.source_system ??
        request.headers['x-source-system'] ??
        SourceSystem.Manual
      ) as string;

      // Validate source system
      const validSources = Object.values(SourceSystem) as string[];
      if (!validSources.includes(rawSourceSystem)) {
        return sendError(
          reply,
          422,
          `Invalid sourceSystem. Must be one of: ${validSources.join(', ')}`,
        );
      }
      const source = rawSourceSystem as SourceSystem;

      // -----------------------------------------------------------------------
      // 4. Extract HMAC signature and raw body (for webhook calls)
      // -----------------------------------------------------------------------
      const hmacSignature = webhook
        ? (request.headers['x-signature-sha256'] as string)
        : undefined;

      // Use rawBody if available (requires @fastify/rawbody plugin or bodyParser config),
      // otherwise reconstruct from parsed body
      const rawBodyBuffer: Buffer | undefined = (request as FastifyRequest & { rawBody?: Buffer }).rawBody
        ?? (webhook ? Buffer.from(JSON.stringify(request.body)) : undefined);

      // -----------------------------------------------------------------------
      // 5. Ingest
      // -----------------------------------------------------------------------
      let result;
      try {
        result = await eventProcessorService.ingest(body, source, hmacSignature, rawBodyBuffer);
      } catch (err) {
        request.log.error({ err }, 'POST /events: unexpected error during ingest');
        return sendError(reply, 500, 'Internal server error');
      }

      // -----------------------------------------------------------------------
      // 6. Map ingest result to HTTP response
      // -----------------------------------------------------------------------
      switch (result.status) {
        case 'invalid': {
          // HMAC mismatch on a webhook call → 401 (Req 12.2)
          if (webhook && hmacSignature !== undefined && !result.eventId) {
            return sendError(reply, 401, 'Unauthorized: invalid or missing HMAC signature');
          }
          // Missing required fields → 422 (Req 3.2)
          return reply.code(422).send({
            success: false,
            data: null,
            meta: null,
            error:
              result.failedSteps.length > 0
                ? `Validation failed: ${result.failedSteps.join('; ')}`
                : 'Validation failed: missing required fields',
          });
        }

        case 'duplicate':
          // Duplicate event_id → 409 (Req 3.5)
          return sendError(reply, 409, `Conflict: event with id '${result.eventId}' already exists`);

        case 'failed':
          return sendError(reply, 500, 'Internal server error');

        case 'accepted':
        default: {
          // Accepted (with or without partial pipeline failure) → 202 (Req 3.1, 3.8)
          return reply.code(202).send({
            success: true,
            data: {
              eventId: result.eventId,
              requestId: result.requestId,
              pipelineStatus: result.pipelineStatus,
              failedSteps: result.failedSteps,
              receivedAt: result.receivedAt,
            },
            meta: null,
            error: null,
          });
        }
      }
    },
  );

  /**
   * GET /events
   *
   * Paginated list of events, filterable by:
   *   - requestId  (UUID)
   *   - department (string)
   *   - eventType  (string)
   *   - from       (ISO 8601 date-time — inclusive lower bound on occurredAt)
   *   - to         (ISO 8601 date-time — inclusive upper bound on occurredAt)
   *
   * Sorted by occurredAt DESC. Default page size 20, maximum 100.
   * Returns HTTP 200 with empty list when no events match the filter.
   *
   * Requirements: 3.7
   */
  app.get(
    '/events',
    {
      preHandler: [authenticate, authorize(Permission.ViewDeptRequests)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string | undefined>;

      // -----------------------------------------------------------------------
      // Parse pagination params
      // -----------------------------------------------------------------------
      const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
      const rawPageSize = parseInt(query.pageSize ?? query.page_size ?? '20', 10) || 20;
      const pageSize = Math.min(100, Math.max(1, rawPageSize));
      const offset = (page - 1) * pageSize;

      // -----------------------------------------------------------------------
      // Build WHERE conditions
      // -----------------------------------------------------------------------
      const conditions = [];

      if (query.requestId) {
        conditions.push(eq(events.requestId, query.requestId));
      }

      if (query.department) {
        conditions.push(eq(events.department, query.department));
      }

      if (query.eventType) {
        conditions.push(eq(events.eventType, query.eventType));
      }

      if (query.from) {
        const fromDate = new Date(query.from);
        if (!Number.isNaN(fromDate.getTime())) {
          conditions.push(gte(events.occurredAt, fromDate));
        }
      }

      if (query.to) {
        const toDate = new Date(query.to);
        if (!Number.isNaN(toDate.getTime())) {
          conditions.push(lte(events.occurredAt, toDate));
        }
      }

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      // -----------------------------------------------------------------------
      // Query: total count + paginated rows
      // -----------------------------------------------------------------------
      try {
        const [{ count }] = await db
          .select({ count: sql<number>`cast(count(*) as int)` })
          .from(events)
          .where(whereClause);

        const rows = await db
          .select()
          .from(events)
          .where(whereClause)
          .orderBy(desc(events.occurredAt))
          .limit(pageSize)
          .offset(offset);

        return reply.code(200).send({
          success: true,
          data: rows,
          meta: {
            page,
            pageSize,
            total: count ?? 0,
          },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /events: query failed');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
