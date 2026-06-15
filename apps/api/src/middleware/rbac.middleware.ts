/**
 * RBAC middleware — Permission matrix and route-level enforcement
 *
 * Exports:
 *  - `Permission`            — enum of all platform permissions
 *  - `ROLE_PERMISSIONS`      — typed map from UserRole → Set<Permission>
 *  - `authorize(permission)` — Fastify preHandler factory (runs after `authenticate`)
 *  - `hasPermission(role, permission)` — pure helper for service-layer checks
 *
 * Usage:
 *   app.get('/requests', { preHandler: [authenticate, authorize(Permission.ViewAllRequests)] }, handler)
 *
 * Requirements: 1.8, 1.9, 2.7, 7.8
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Permission enum
// ---------------------------------------------------------------------------

export enum Permission {
  CreateServiceRequest = 'create:service_request',
  ViewAllRequests      = 'view:all_requests',
  ViewDeptRequests     = 'view:dept_requests',
  ManageSLARules       = 'manage:sla_rules',
  ViewExecutiveDashboard  = 'view:dashboard:executive',
  ViewOperationsDashboard = 'view:dashboard:operations',
  ViewAnalyticsDashboard  = 'view:dashboard:analytics',
  ViewAIDashboard         = 'view:dashboard:ai',
  AcknowledgeResolveAlerts = 'manage:alerts',
  InitiateArchival     = 'initiate:archival',
  AICopilot            = 'use:ai_copilot',
  ManageUsers          = 'manage:users',
}

// ---------------------------------------------------------------------------
// Permission matrix  (Requirements 1.8, 1.9)
// ---------------------------------------------------------------------------

/**
 * Typed map from every UserRole to its set of granted permissions.
 * This is the single source of truth for all RBAC decisions.
 */
export const ROLE_PERMISSIONS: Record<UserRole, Set<Permission>> = {
  Administrator: new Set([
    Permission.CreateServiceRequest,
    Permission.ViewAllRequests,
    Permission.ViewDeptRequests,
    Permission.ManageSLARules,
    Permission.ViewExecutiveDashboard,
    Permission.ViewOperationsDashboard,
    Permission.ViewAnalyticsDashboard,
    Permission.ViewAIDashboard,
    Permission.AcknowledgeResolveAlerts,
    Permission.InitiateArchival,
    Permission.AICopilot,
    Permission.ManageUsers,
  ]),

  'Regional Manager': new Set([
    Permission.ViewAllRequests,
    Permission.ViewDeptRequests,
    Permission.ViewExecutiveDashboard,
    Permission.ViewOperationsDashboard,
    Permission.ViewAnalyticsDashboard,
    Permission.AcknowledgeResolveAlerts,
    Permission.AICopilot,
  ]),

  'Sales Engineer': new Set([
    Permission.CreateServiceRequest,
    Permission.ViewDeptRequests,
    Permission.ViewOperationsDashboard,
    Permission.AcknowledgeResolveAlerts,
  ]),

  'Backend Designer': new Set([
    Permission.ViewDeptRequests,
    Permission.ViewOperationsDashboard,
    Permission.AcknowledgeResolveAlerts,
  ]),

  'Logistics Officer': new Set([
    Permission.ViewDeptRequests,
    Permission.ViewOperationsDashboard,
    Permission.AcknowledgeResolveAlerts,
  ]),
};

// ---------------------------------------------------------------------------
// Pure helper — usable in the service layer without HTTP context
// ---------------------------------------------------------------------------

/**
 * Returns true when `role` is granted `permission`.
 * Safe to call from any layer (service, worker, AI engine).
 */
export function hasPermission(role: UserRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role]?.has(permission) ?? false;
}

// ---------------------------------------------------------------------------
// Fastify preHandler factory
// ---------------------------------------------------------------------------

/** Standard 403 error envelope, per API design */
function forbidden(reply: FastifyReply): void {
  reply.code(403).send({
    success: false,
    error: 'Forbidden',
    data: null,
    meta: null,
  });
}

/** Standard 401 error envelope */
function unauthorized(reply: FastifyReply): void {
  reply.code(401).send({
    success: false,
    error: 'Unauthorized',
    data: null,
    meta: null,
  });
}

/**
 * requireRole — simple role-based preHandler (alternative to permission-based authorize).
 *
 * Usage: `{ preHandler: [authenticate, requireRole([UserRole.Administrator])] }`
 *
 * Returns 403 if the requesting user's role is not in the allowedRoles array.
 */
export function requireRole(allowedRoles: UserRole[]) {
  return async function requireRoleHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      return unauthorized(reply);
    }
    if (!allowedRoles.includes(request.user.role)) {
      return forbidden(reply);
    }
  };
}

/**
 * Fastify preHandler factory.
 *
 * MUST be registered after `authenticate` so that `request.user` is populated:
 *   `{ preHandler: [authenticate, authorize(Permission.ViewAllRequests)] }`
 *
 * Behaviour:
 *  - `request.user` is undefined → HTTP 401 (authenticate was not run first)
 *  - user's role lacks the permission → HTTP 403, no data
 *  - user's role has the permission → passes through (no reply sent)
 */
export function authorize(permission: Permission) {
  return async function authorizeHandler(
    request: FastifyRequest,
    reply: FastifyReply,
  ): Promise<void> {
    if (!request.user) {
      return unauthorized(reply);
    }

    if (!hasPermission(request.user.role, permission)) {
      return forbidden(reply);
    }
    // Permission granted — let the request continue
  };
}
