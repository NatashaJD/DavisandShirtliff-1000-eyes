/**
 * Unit tests for RBAC middleware
 *
 * Covers:
 *  - authorize() factory: authorized role passes through
 *  - authorize() factory: unauthorized role → HTTP 403 with correct envelope
 *  - authorize() factory: missing request.user → HTTP 401
 *  - hasPermission() pure helper
 *  - Every role tested for ≥1 permission it has AND ≥1 it does NOT have
 *
 * Requirements: 1.8, 1.9, 2.7, 7.8
 */

import { describe, it, expect } from 'vitest';
import { UserRole } from '@dayliff/types';
import {
  Permission,
  ROLE_PERMISSIONS,
  authorize,
  hasPermission,
} from '../rbac.middleware.js';

// ---------------------------------------------------------------------------
// Test helpers — minimal Fastify request / reply fakes (same pattern as auth tests)
// ---------------------------------------------------------------------------

function makeRequest(role?: UserRole): {
  user?: { userId: string; role: UserRole; jti: string };
} {
  if (role === undefined) return {};
  return { user: { userId: 'test-user', role, jti: 'test-jti' } };
}

function makeReply() {
  const reply = {
    _code: 200,
    _body: undefined as unknown,
    code(n: number) {
      reply._code = n;
      return reply;
    },
    send(body: unknown) {
      reply._body = body;
      return reply;
    },
  };
  return reply;
}

// ---------------------------------------------------------------------------
// hasPermission — pure helper
// ---------------------------------------------------------------------------

describe('hasPermission()', () => {
  it('returns true when the role has the permission', () => {
    expect(hasPermission(UserRole.Administrator, Permission.ManageUsers)).toBe(true);
    expect(hasPermission(UserRole.RegionalManager, Permission.ViewAllRequests)).toBe(true);
    expect(hasPermission(UserRole.SalesEngineer, Permission.CreateServiceRequest)).toBe(true);
    expect(hasPermission(UserRole.BackendDesigner, Permission.ViewDeptRequests)).toBe(true);
    expect(hasPermission(UserRole.LogisticsOfficer, Permission.AcknowledgeResolveAlerts)).toBe(true);
  });

  it('returns false when the role does not have the permission', () => {
    expect(hasPermission(UserRole.RegionalManager, Permission.ManageUsers)).toBe(false);
    expect(hasPermission(UserRole.SalesEngineer, Permission.ViewAllRequests)).toBe(false);
    expect(hasPermission(UserRole.BackendDesigner, Permission.AICopilot)).toBe(false);
    expect(hasPermission(UserRole.LogisticsOfficer, Permission.InitiateArchival)).toBe(false);
    expect(hasPermission(UserRole.SalesEngineer, Permission.ViewExecutiveDashboard)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ROLE_PERMISSIONS matrix completeness
// ---------------------------------------------------------------------------

describe('ROLE_PERMISSIONS matrix', () => {
  it('covers every UserRole', () => {
    const roles = Object.values(UserRole);
    for (const role of roles) {
      expect(ROLE_PERMISSIONS[role], `Missing entry for role: ${role}`).toBeDefined();
    }
  });

  it('Admin has all permissions', () => {
    const allPerms = Object.values(Permission);
    for (const perm of allPerms) {
      expect(
        ROLE_PERMISSIONS[UserRole.Administrator].has(perm),
        `Admin should have: ${perm}`,
      ).toBe(true);
    }
  });

  // Per-role spot checks: at least one granted and one denied
  it('Regional Manager — granted: ViewAllRequests, ViewAnalyticsDashboard, AICopilot', () => {
    const rm = UserRole.RegionalManager;
    expect(hasPermission(rm, Permission.ViewAllRequests)).toBe(true);
    expect(hasPermission(rm, Permission.ViewAnalyticsDashboard)).toBe(true);
    expect(hasPermission(rm, Permission.AICopilot)).toBe(true);
  });

  it('Regional Manager — denied: ManageUsers, InitiateArchival, CreateServiceRequest, ViewAIDashboard, ManageSLARules', () => {
    const rm = UserRole.RegionalManager;
    expect(hasPermission(rm, Permission.ManageUsers)).toBe(false);
    expect(hasPermission(rm, Permission.InitiateArchival)).toBe(false);
    expect(hasPermission(rm, Permission.CreateServiceRequest)).toBe(false);
    expect(hasPermission(rm, Permission.ViewAIDashboard)).toBe(false);
    expect(hasPermission(rm, Permission.ManageSLARules)).toBe(false);
  });

  it('Sales Engineer — granted: CreateServiceRequest, ViewDeptRequests, ViewOperationsDashboard', () => {
    const se = UserRole.SalesEngineer;
    expect(hasPermission(se, Permission.CreateServiceRequest)).toBe(true);
    expect(hasPermission(se, Permission.ViewDeptRequests)).toBe(true);
    expect(hasPermission(se, Permission.ViewOperationsDashboard)).toBe(true);
  });

  it('Sales Engineer — denied: ViewAllRequests, ManageSLARules, ViewExecutiveDashboard, AICopilot', () => {
    const se = UserRole.SalesEngineer;
    expect(hasPermission(se, Permission.ViewAllRequests)).toBe(false);
    expect(hasPermission(se, Permission.ManageSLARules)).toBe(false);
    expect(hasPermission(se, Permission.ViewExecutiveDashboard)).toBe(false);
    expect(hasPermission(se, Permission.AICopilot)).toBe(false);
  });

  it('Backend Designer — granted: ViewDeptRequests, AcknowledgeResolveAlerts, ViewOperationsDashboard', () => {
    const bd = UserRole.BackendDesigner;
    expect(hasPermission(bd, Permission.ViewDeptRequests)).toBe(true);
    expect(hasPermission(bd, Permission.AcknowledgeResolveAlerts)).toBe(true);
    expect(hasPermission(bd, Permission.ViewOperationsDashboard)).toBe(true);
  });

  it('Backend Designer — denied: ViewAllRequests, ManageUsers, AICopilot, ViewAIDashboard', () => {
    const bd = UserRole.BackendDesigner;
    expect(hasPermission(bd, Permission.ViewAllRequests)).toBe(false);
    expect(hasPermission(bd, Permission.ManageUsers)).toBe(false);
    expect(hasPermission(bd, Permission.AICopilot)).toBe(false);
    expect(hasPermission(bd, Permission.ViewAIDashboard)).toBe(false);
  });

  it('Logistics Officer — granted: ViewDeptRequests, AcknowledgeResolveAlerts, ViewOperationsDashboard', () => {
    const lo = UserRole.LogisticsOfficer;
    expect(hasPermission(lo, Permission.ViewDeptRequests)).toBe(true);
    expect(hasPermission(lo, Permission.AcknowledgeResolveAlerts)).toBe(true);
    expect(hasPermission(lo, Permission.ViewOperationsDashboard)).toBe(true);
  });

  it('Logistics Officer — denied: ViewAllRequests, ManageUsers, AICopilot, InitiateArchival', () => {
    const lo = UserRole.LogisticsOfficer;
    expect(hasPermission(lo, Permission.ViewAllRequests)).toBe(false);
    expect(hasPermission(lo, Permission.ManageUsers)).toBe(false);
    expect(hasPermission(lo, Permission.AICopilot)).toBe(false);
    expect(hasPermission(lo, Permission.InitiateArchival)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// authorize() middleware factory
// ---------------------------------------------------------------------------

describe('authorize() middleware', () => {
  // ---- authorized role passes through ------------------------------------

  it('passes through when the user role has the required permission (Req 1.8)', async () => {
    const handler = authorize(Permission.ManageUsers);
    const request = makeRequest(UserRole.Administrator) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(200);
    expect(reply._body).toBeUndefined();
  });

  it('passes through for Regional Manager with ViewAllRequests (Req 1.8)', async () => {
    const handler = authorize(Permission.ViewAllRequests);
    const request = makeRequest(UserRole.RegionalManager) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(200);
    expect(reply._body).toBeUndefined();
  });

  it('passes through for Sales Engineer with CreateServiceRequest (Req 1.8)', async () => {
    const handler = authorize(Permission.CreateServiceRequest);
    const request = makeRequest(UserRole.SalesEngineer) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(200);
    expect(reply._body).toBeUndefined();
  });

  // ---- unauthorized role → 403 -------------------------------------------

  it('returns 403 when the role lacks the permission (Req 1.8, 7.8)', async () => {
    const handler = authorize(Permission.ManageUsers);
    const request = makeRequest(UserRole.RegionalManager) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(403);
  });

  it('returns 403 for Sales Engineer accessing ManageSLARules (Req 1.8)', async () => {
    const handler = authorize(Permission.ManageSLARules);
    const request = makeRequest(UserRole.SalesEngineer) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(403);
  });

  it('returns 403 for Backend Designer accessing AICopilot (Req 1.8)', async () => {
    const handler = authorize(Permission.AICopilot);
    const request = makeRequest(UserRole.BackendDesigner) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(403);
  });

  it('returns 403 for Logistics Officer accessing InitiateArchival (Req 1.8)', async () => {
    const handler = authorize(Permission.InitiateArchival);
    const request = makeRequest(UserRole.LogisticsOfficer) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(403);
  });

  it('returns 403 for Sales Engineer accessing ViewAIDashboard (Req 7.8)', async () => {
    const handler = authorize(Permission.ViewAIDashboard);
    const request = makeRequest(UserRole.SalesEngineer) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(403);
  });

  // ---- 403 body has the correct envelope shape ---------------------------

  it('403 body matches the standard error envelope with no data (Req 1.8)', async () => {
    const handler = authorize(Permission.ManageUsers);
    const request = makeRequest(UserRole.LogisticsOfficer) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._body).toStrictEqual({
      success: false,
      error: 'Forbidden',
      data: null,
      meta: null,
    });
  });

  // ---- missing request.user → 401 ----------------------------------------

  it('returns 401 when request.user is undefined (authenticate was not run first)', async () => {
    const handler = authorize(Permission.ViewAllRequests);
    const request = makeRequest(undefined) as Parameters<typeof handler>[0];
    const reply = makeReply() as unknown as Parameters<typeof handler>[1];

    await handler(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toStrictEqual({
      success: false,
      error: 'Unauthorized',
      data: null,
      meta: null,
    });
  });
});
