/**
 * Unit tests for authenticate middleware
 * Requirements: 1.7
 *
 * All external dependencies (authService) are mocked so tests run without
 * a live database or Redis connection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — declared before any dynamic import of the module under test
// ---------------------------------------------------------------------------

vi.mock('../../services/auth.service.js', () => ({
  authService: {
    verifyAccessToken: vi.fn(),
  },
  AuthError: class AuthError extends Error {
    statusCode: number;
    constructor(message: string, statusCode = 401) {
      super(message);
      this.name = 'AuthError';
      this.statusCode = statusCode;
    }
  },
}));

// ---------------------------------------------------------------------------
// Imports AFTER mocks
// ---------------------------------------------------------------------------

import { authenticate } from '../auth.middleware.js';
import { authService, AuthError } from '../../services/auth.service.js';
import type { UserRole } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Test helpers — minimal Fastify request / reply fakes
// ---------------------------------------------------------------------------

function makeRequest(authorizationHeader?: string): {
  headers: { authorization?: string };
  user?: unknown;
  log: { error: ReturnType<typeof vi.fn> };
} {
  return {
    headers: authorizationHeader !== undefined ? { authorization: authorizationHeader } : {},
    user: undefined,
    log: { error: vi.fn() },
  };
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

const VALID_CLAIMS = {
  sub: 'user-uuid-1',
  role: 'Administrator' as UserRole,
  jti: 'jti-abc',
  iat: Math.floor(Date.now() / 1000),
  exp: Math.floor(Date.now() / 1000) + 900,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('authenticate middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Happy path
  // -------------------------------------------------------------------------

  it('sets request.user when a valid Bearer token is provided (Req 1.7)', async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(VALID_CLAIMS as never);

    const request = makeRequest('Bearer valid.jwt.token') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(request.user).toEqual({
      userId: 'user-uuid-1',
      role: 'Administrator',
      jti: 'jti-abc',
    });
    // Should NOT have sent any reply
    expect(reply._code).toBe(200);
    expect(reply._body).toBeUndefined();
  });

  it('calls verifyAccessToken with the token extracted from the header', async () => {
    vi.mocked(authService.verifyAccessToken).mockResolvedValue(VALID_CLAIMS as never);

    const request = makeRequest('Bearer my.special.token') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(authService.verifyAccessToken).toHaveBeenCalledOnce();
    expect(authService.verifyAccessToken).toHaveBeenCalledWith('my.special.token');
  });

  // -------------------------------------------------------------------------
  // Missing / malformed Authorization header → 401
  // -------------------------------------------------------------------------

  it('returns 401 when the Authorization header is absent (Req 1.7)', async () => {
    const request = makeRequest(undefined) as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({
      success: false,
      error: 'Unauthorized',
      data: null,
      meta: null,
    });
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('returns 401 when the Authorization header lacks the Bearer prefix (Req 1.7)', async () => {
    const request = makeRequest('Basic some.base64.cred') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({ success: false, error: 'Unauthorized' });
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('returns 401 when the Bearer token is an empty string (Req 1.7)', async () => {
    const request = makeRequest('Bearer ') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({ success: false, error: 'Unauthorized' });
    expect(authService.verifyAccessToken).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Invalid / expired / blocklisted token → 401
  // -------------------------------------------------------------------------

  it('returns 401 when the token signature is invalid (Req 1.7)', async () => {
    vi.mocked(authService.verifyAccessToken).mockRejectedValue(
      new AuthError('Invalid or expired access token', 401),
    );

    const request = makeRequest('Bearer tampered.token.here') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when the token has expired (Req 1.7)', async () => {
    vi.mocked(authService.verifyAccessToken).mockRejectedValue(
      new AuthError('Invalid or expired access token', 401),
    );

    const request = makeRequest('Bearer expired.jwt.token') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 when the token jti is in the Redis blocklist (Req 1.7)', async () => {
    vi.mocked(authService.verifyAccessToken).mockRejectedValue(
      new AuthError('Token has been revoked', 401),
    );

    const request = makeRequest('Bearer revoked.jwt.token') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({ success: false, error: 'Unauthorized' });
  });

  it('returns 401 (not 500) for unexpected errors during verification (Req 1.7)', async () => {
    vi.mocked(authService.verifyAccessToken).mockRejectedValue(new Error('Unexpected DB error'));

    const request = makeRequest('Bearer some.token') as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._code).toBe(401);
    expect(reply._body).toMatchObject({ success: false, error: 'Unauthorized' });
  });

  // -------------------------------------------------------------------------
  // Response envelope shape
  // -------------------------------------------------------------------------

  it('always returns { success: false, error: "Unauthorized", data: null, meta: null } on 401', async () => {
    const request = makeRequest(undefined) as Parameters<typeof authenticate>[0];
    const reply = makeReply() as unknown as Parameters<typeof authenticate>[1];

    await authenticate(request, reply);

    expect(reply._body).toStrictEqual({
      success: false,
      error: 'Unauthorized',
      data: null,
      meta: null,
    });
  });
});
