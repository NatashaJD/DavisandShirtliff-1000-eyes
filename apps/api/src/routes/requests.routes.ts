/**
 * Service Request route plugin
 *
 * POST   /requests           — create a new service request
 * GET    /requests           — paginated list (role-scoped)
 * GET    /requests/:id       — get single request by ID
 * PATCH  /requests/:id       — partial update of mutable fields
 *
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8
 */

import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';

import { authenticate } from '../middleware/auth.middleware.js';
import { authorize, Permission } from '../middleware/rbac.middleware.js';
import {
  serviceRequestsService,
  CreateRequestSchema,
  PatchRequestSchema,
} from '../services/requests.service.js';

// ---------------------------------------------------------------------------
// Helper: send structured error
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

// ---------------------------------------------------------------------------
// Route plugin
// ---------------------------------------------------------------------------

export async function requestRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /requests
   * Create a new service request.
   * Permissions: CreateServiceRequest (Sales Engineer, Administrator)
   * Requirements: 2.1, 2.2, 2.7
   */
  app.post(
    '/requests',
    {
      preHandler: [
        authenticate,
        authorize(Permission.ViewDeptRequests),
        authorize(Permission.CreateServiceRequest),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = CreateRequestSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.code(422).send({
          success: false,
          data: null,
          meta: null,
          error: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
      }

      try {
        const created = await serviceRequestsService.create(
          parseResult.data,
          request.user!.userId,
        );
        return reply.code(201).send({
          success: true,
          data: created,
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'POST /requests error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /requests
   * Paginated list of service requests scoped by role.
   * Permissions: ViewDeptRequests (all authenticated roles)
   * Query: page (default 1), pageSize (default 20, max 100)
   * Requirements: 2.7, 2.8
   */
  app.get(
    '/requests',
    {
      preHandler: [authenticate, authorize(Permission.ViewDeptRequests)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const query = request.query as Record<string, string>;
      const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
      const pageSize = Math.min(100, Math.max(1, parseInt(query.pageSize ?? '20', 10) || 20));

      const { role, userId } = request.user!;
      // department comes from a user profile; for now we treat it as a query param
      // that scoped roles must provide. In the future this will come from the user record.
      const department = query.department;

      try {
        const result = await serviceRequestsService.list(page, pageSize, role, department);
        return reply.code(200).send({
          success: true,
          data: result.records,
          meta: {
            page: result.page,
            pageSize: result.pageSize,
            total: result.total,
          },
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /requests error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * GET /requests/:id
   * Return a single service request record.
   * Permissions: ViewDeptRequests (all authenticated roles, scoped)
   * Requirements: 2.3, 2.4, 2.7
   */
  app.get(
    '/requests/:id',
    {
      preHandler: [authenticate, authorize(Permission.ViewDeptRequests)],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string>;
      const department = query.department;

      const { role } = request.user!;

      try {
        const record = await serviceRequestsService.getById(id, role, department);
        if (!record) {
          return reply.code(404).send({
            success: false,
            data: null,
            meta: null,
            error: 'Not found',
          });
        }
        return reply.code(200).send({
          success: true,
          data: record,
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'GET /requests/:id error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * PATCH /requests/:id
   * Partial update of mutable fields.
   * Permissions: CreateServiceRequest (Sales Engineer, Administrator)
   * Requirements: 2.5, 2.6, 2.7
   */
  app.patch(
    '/requests/:id',
    {
      preHandler: [
        authenticate,
        authorize(Permission.ViewDeptRequests),
        authorize(Permission.CreateServiceRequest),
      ],
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { id } = request.params as { id: string };
      const query = request.query as Record<string, string>;
      const department = query.department;
      const { role } = request.user!;

      // Strip immutable fields from the body before validation
      const rawBody = { ...(request.body as Record<string, unknown>) };
      // Silently drop id, request_number, current_stage per Req 2.5
      delete rawBody['id'];
      delete rawBody['requestNumber'];
      delete rawBody['request_number'];
      delete rawBody['currentStage'];
      delete rawBody['current_stage'];

      const parseResult = PatchRequestSchema.safeParse(rawBody);
      if (!parseResult.success) {
        return reply.code(422).send({
          success: false,
          data: null,
          meta: null,
          error: parseResult.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '),
        });
      }

      try {
        const updated = await serviceRequestsService.update(id, parseResult.data, role, department);
        if (!updated) {
          return reply.code(404).send({
            success: false,
            data: null,
            meta: null,
            error: 'Not found',
          });
        }
        return reply.code(200).send({
          success: true,
          data: updated,
          meta: null,
          error: null,
        });
      } catch (err) {
        request.log.error({ err }, 'PATCH /requests/:id error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
