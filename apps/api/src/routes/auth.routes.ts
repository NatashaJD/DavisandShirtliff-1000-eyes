/**
 * Auth route plugin — POST /auth/login, POST /auth/refresh, POST /auth/logout
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7
 */

import { type FastifyInstance, type FastifyRequest, type FastifyReply } from 'fastify';
import { z } from 'zod';

import { authService, AuthError } from '../services/auth.service.js';

// ---------------------------------------------------------------------------
// Request body schemas (Zod for validation)
// ---------------------------------------------------------------------------

const loginBodySchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

const refreshBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

const logoutBodySchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

// ---------------------------------------------------------------------------
// Helper: extract IP
// ---------------------------------------------------------------------------

function getIpAddress(request: FastifyRequest): string {
  // Fastify populates request.ip when trustProxy is true
  return request.ip ?? '0.0.0.0';
}

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

export async function authRoutes(app: FastifyInstance): Promise<void> {
  /**
   * POST /auth/login
   * Body: { email, password }
   * Response: { accessToken, refreshToken, expiresIn: 900, tokenType: 'Bearer' }
   * Requirement 1.1, 1.2
   */
  app.post(
    '/auth/login',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = loginBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return sendError(reply, 422, parseResult.error.errors.map((e) => e.message).join('; '));
      }

      const { email, password } = parseResult.data;
      const ip = getIpAddress(request);

      try {
        const result = await authService.login(email, password, ip);
        return reply.code(200).send({
          success: true,
          data: result,
          meta: null,
          error: null,
        });
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        request.log.error({ err }, 'Login error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * POST /auth/refresh
   * Body: { refreshToken }
   * Response: { accessToken, expiresIn: 900, tokenType: 'Bearer' }
   * Requirements: 1.3, 1.4, 1.5
   */
  app.post(
    '/auth/refresh',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const parseResult = refreshBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return sendError(reply, 422, parseResult.error.errors.map((e) => e.message).join('; '));
      }

      const { refreshToken } = parseResult.data;
      const ip = getIpAddress(request);

      try {
        const result = await authService.refresh(refreshToken, ip);
        return reply.code(200).send({
          success: true,
          data: result,
          meta: null,
          error: null,
        });
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        request.log.error({ err }, 'Refresh error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );

  /**
   * POST /auth/logout
   * Requires: Authorization: Bearer <accessToken>
   * Body: { refreshToken }
   * Response: 200 OK
   * Requirement 1.6
   */
  app.post(
    '/auth/logout',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Extract Bearer token
      const authHeader = request.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return sendError(reply, 401, 'Missing or invalid Authorization header');
      }
      const rawAccessToken = authHeader.slice(7);

      // Verify the access token first so we know the userId
      let claims: Awaited<ReturnType<typeof authService.verifyAccessToken>>;
      try {
        claims = await authService.verifyAccessToken(rawAccessToken);
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 401, 'Invalid access token');
      }

      const parseResult = logoutBodySchema.safeParse(request.body);
      if (!parseResult.success) {
        return sendError(reply, 422, parseResult.error.errors.map((e) => e.message).join('; '));
      }

      const { refreshToken } = parseResult.data;
      const ip = getIpAddress(request);

      try {
        await authService.logout(
          claims.sub as string,
          rawAccessToken,
          refreshToken,
          ip,
        );
        return reply.code(200).send({
          success: true,
          data: null,
          meta: null,
          error: null,
        });
      } catch (err) {
        if (err instanceof AuthError) {
          return sendError(reply, err.statusCode, err.message);
        }
        request.log.error({ err }, 'Logout error');
        return sendError(reply, 500, 'Internal server error');
      }
    },
  );
}
