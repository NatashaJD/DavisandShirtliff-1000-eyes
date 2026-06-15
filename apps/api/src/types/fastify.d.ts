/**
 * Fastify type augmentation — extend FastifyRequest with the authenticated user context.
 * Requirements: 1.7
 */

import type { AuthenticatedUser } from '@dayliff/types';

declare module 'fastify' {
  interface FastifyRequest {
    /**
     * Populated by the `authenticate` preHandler after successful JWT verification.
     * `undefined` on routes that do not require authentication.
     */
    user?: AuthenticatedUser;
  }
}
