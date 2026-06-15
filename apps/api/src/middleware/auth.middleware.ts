/**
 * JWT authentication middleware
 *
 * Exports a reusable Fastify `preHandler` hook (`authenticate`) that:
 *  1. Extracts the Bearer token from the Authorization header
 *  2. Calls `authService.verifyAccessToken()` which checks RS256 signature,
 *     token expiry, and the Redis blocklist (key: `blocklist:jti:{jti}`)
 *  3. Attaches `{ userId, role, jti }` to `request.user`
 *  4. Returns HTTP 401 with the standard error envelope for any failure
 *
 * Usage (opt-in per route):
 *   app.get('/protected', { preHandler: [authenticate] }, handler)
 *
 * Requirements: 1.7
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { authService, AuthError } from '../services/auth.service.js';
import type { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Standard 401 error envelope, per API design */
function unauthorized(reply: FastifyReply, message: string): void {
  reply.code(401).send({
    success: false,
    error: 'Unauthorized',
    data: null,
    meta: null,
  });
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

/**
 * Fastify preHandler — verifies the Bearer JWT and attaches user context.
 *
 * Register on individual routes:
 *   `{ preHandler: [authenticate] }`
 *
 * Or as a global hook with route-level exclusions (e.g., auth endpoints):
 *   ```
 *   app.addHook('onRequest', async (request, reply) => {
 *     if (request.routerPath?.startsWith('/auth')) return;
 *     return authenticate(request, reply);
 *   });
 *   ```
 */
export async function authenticate(
  request: FastifyRequest,
  reply: FastifyReply,
): Promise<void> {
  const authHeader = request.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return unauthorized(reply, 'Missing or invalid Authorization header');
  }

  const token = authHeader.slice(7).trim();

  if (!token) {
    return unauthorized(reply, 'Missing or invalid Authorization header');
  }

  try {
    const claims = await authService.verifyAccessToken(token);

    // `sub` holds the userId, `role` holds the UserRole, `jti` is the token ID
    request.user = {
      userId: claims.sub as string,
      role: claims.role as UserRole,
      jti: claims.jti,
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return unauthorized(reply, err.message);
    }
    // Unexpected error — still respond with 401, log the detail
    request.log.error({ err }, '[authenticate] Unexpected error during token verification');
    return unauthorized(reply, 'Unauthorized');
  }
}
