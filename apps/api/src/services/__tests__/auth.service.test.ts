/**
 * Unit tests for AuthService
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.5
 *
 * All external dependencies (DB, Redis, bcrypt) are mocked so tests run
 * without a live database or Redis connection.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as jose from 'jose';

// ---------------------------------------------------------------------------
// Mocks — must be declared before any dynamic imports of the module under test
// ---------------------------------------------------------------------------

// Mock DB client
vi.mock('../../db/client.js', () => ({
  db: {
    select: vi.fn(),
    insert: vi.fn(),
    update: vi.fn(),
  },
}));

// Mock Redis
vi.mock('../../config/redis.js', () => ({
  redis: {
    get: vi.fn(),
    set: vi.fn(),
  },
}));

// Mock env
vi.mock('../../config/env.js', () => ({
  env: {
    JWT_PRIVATE_KEY: '',
    JWT_PUBLIC_KEY: '',
    JWT_ACCESS_EXPIRY_SECONDS: 900,
    JWT_REFRESH_EXPIRY_SECONDS: 604800,
  },
}));

// Mock bcryptjs
vi.mock('bcryptjs', () => ({
  default: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
  compare: vi.fn(),
  hash: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Import AFTER mocks
// ---------------------------------------------------------------------------

import { AuthService, AuthError } from '../auth.service.js';
import { db } from '../../db/client.js';
import { redis } from '../../config/redis.js';
import * as bcrypt from 'bcryptjs';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const MOCK_USER = {
  id: 'user-uuid-1',
  email: 'admin@dayliff.com',
  passwordHash: '$2b$12$hashedpassword',
  role: 'Administrator',
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const MOCK_REFRESH_TOKEN = {
  id: 'rt-uuid-1',
  userId: 'user-uuid-1',
  tokenHash: '$2b$12$hashedrefreshtoken',
  expiresAt: new Date(Date.now() + 604800 * 1000),
  revokedAt: null,
  createdAt: new Date(),
};

/** Build a chainable drizzle mock for select queries */
function makeSelectChain(rows: unknown[]) {
  const thenable = {
    then: (resolve: (v: unknown) => unknown) => resolve(rows),
  };
  const chain = {
    from: vi.fn().mockReturnThis(),
    where: vi.fn().mockReturnValue({ ...thenable, limit: vi.fn().mockResolvedValue(rows) }),
    limit: vi.fn().mockResolvedValue(rows),
    // Make the chain itself awaitable (handles cases where no .limit() is called)
    then: (resolve: (v: unknown) => unknown) => resolve(rows),
  };
  return chain;
}

/** Build a chainable drizzle mock for insert queries */
function makeInsertChain() {
  return {
    values: vi.fn().mockResolvedValue([{ id: 'new-id' }]),
  };
}

/** Build a chainable drizzle mock for update queries */
function makeUpdateChain() {
  return {
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    service = new AuthService();
    vi.clearAllMocks();
    // Default: redis.get returns null (not blocklisted)
    vi.mocked(redis.get).mockResolvedValue(null);
    vi.mocked(redis.set).mockResolvedValue('OK');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // -------------------------------------------------------------------------
  // login()
  // -------------------------------------------------------------------------

  describe('login()', () => {
    it('returns access and refresh tokens on valid credentials (Req 1.1)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_USER]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$newhash' as never);

      const result = await service.login('admin@dayliff.com', 'password123', '127.0.0.1');

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      expect(result.tokenType).toBe('Bearer');
    });

    it('throws AuthError 401 when user does not exist (Req 1.2)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

      await expect(
        service.login('nonexistent@dayliff.com', 'password', '127.0.0.1'),
      ).rejects.toMatchObject({ name: 'AuthError', statusCode: 401 });
    });

    it('throws AuthError 401 when password is wrong (Req 1.2)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_USER]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(
        service.login('admin@dayliff.com', 'wrongpassword', '127.0.0.1'),
      ).rejects.toMatchObject({ name: 'AuthError', statusCode: 401 });
    });

    it('issues an access token with exp === iat + 900 (Req 1.1)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_USER]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$newhash' as never);

      const before = Math.floor(Date.now() / 1000);
      const result = await service.login('admin@dayliff.com', 'password123', '127.0.0.1');
      const after = Math.floor(Date.now() / 1000);

      // Decode access token (without verification — just base64)
      const [, payloadB64] = result.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

      expect(payload.exp).toBe(payload.iat + 900);
      expect(payload.iat).toBeGreaterThanOrEqual(before);
      expect(payload.iat).toBeLessThanOrEqual(after);
    });

    it('embeds correct role in access token (Req 1.1)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_USER]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$newhash' as never);

      const result = await service.login('admin@dayliff.com', 'password123', '127.0.0.1');

      const [, payloadB64] = result.accessToken.split('.');
      const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf-8'));

      expect(payload.role).toBe('Administrator');
      expect(payload.sub).toBe(MOCK_USER.id);
      expect(typeof payload.jti).toBe('string');
      expect(payload.jti.length).toBeGreaterThan(0);
    });

    it('logs a login_success auth event (Req 13.5)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_USER]) as never);
      const insertMock = makeInsertChain();
      vi.mocked(db.insert).mockReturnValue(insertMock as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);
      vi.mocked(bcrypt.hash).mockResolvedValue('$2b$12$newhash' as never);

      await service.login('admin@dayliff.com', 'password123', '10.0.0.1');

      // db.insert is called at least once for refresh token, once for auth event
      expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(2);
    });

    it('logs a login_failure auth event (Req 13.5)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

      await expect(service.login('x@x.com', 'bad', '10.0.0.1')).rejects.toThrow();

      expect(vi.mocked(db.insert)).toHaveBeenCalledTimes(1);
    });
  });

  // -------------------------------------------------------------------------
  // refresh()
  // -------------------------------------------------------------------------

  describe('refresh()', () => {
    it('returns a new access token when refresh token is valid (Req 1.3)', async () => {
      // First select: candidates (refresh tokens)
      // Second select: user lookup
      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([MOCK_REFRESH_TOKEN]) as never)
        .mockReturnValueOnce(makeSelectChain([MOCK_USER]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      const result = await service.refresh('raw-refresh-token', '127.0.0.1');

      expect(result.accessToken).toBeTruthy();
      expect(result.expiresIn).toBe(900);
      expect(result.tokenType).toBe('Bearer');
    });

    it('throws AuthError 401 when no matching refresh token found (Req 1.4, 1.5)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_REFRESH_TOKEN]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      // bcrypt.compare returns false — no match
      vi.mocked(bcrypt.compare).mockResolvedValue(false as never);

      await expect(service.refresh('invalid-token', '127.0.0.1')).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
      });
    });

    it('throws AuthError 401 when refresh token is expired (Req 1.4)', async () => {
      // Return empty candidates (expired tokens filtered out by DB query)
      vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

      await expect(service.refresh('some-token', '127.0.0.1')).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
      });
    });

    it('throws AuthError 401 when user is inactive after refresh token match (Req 1.5)', async () => {
      const inactiveUser = { ...MOCK_USER, isActive: false };
      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([MOCK_REFRESH_TOKEN]) as never)
        .mockReturnValueOnce(makeSelectChain([]) as never); // isActive=true filter returns nothing
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await expect(service.refresh('valid-token', '127.0.0.1')).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
      });
    });

    it('logs a token_refresh auth event on success (Req 13.5)', async () => {
      vi.mocked(db.select)
        .mockReturnValueOnce(makeSelectChain([MOCK_REFRESH_TOKEN]) as never)
        .mockReturnValueOnce(makeSelectChain([MOCK_USER]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await service.refresh('raw-refresh-token', '10.0.0.2');

      expect(vi.mocked(db.insert)).toHaveBeenCalled();
    });

    it('logs a token_refresh_failure auth event on failure (Req 13.5)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([]) as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);

      await expect(service.refresh('bad-token', '10.0.0.2')).rejects.toThrow();

      expect(vi.mocked(db.insert)).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // logout()
  // -------------------------------------------------------------------------

  describe('logout()', () => {
    it('marks the refresh token as revoked (Req 1.6)', async () => {
      // Issue a real access token to pass to logout
      const { privateKey } = await jose.generateKeyPair('RS256');
      const token = await new jose.SignJWT({ role: 'Administrator' })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject('user-uuid-1')
        .setIssuedAt()
        .setExpirationTime('15m')
        .setJti('test-jti')
        .sign(privateKey);

      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_REFRESH_TOKEN]) as never);
      const updateChain = makeUpdateChain();
      vi.mocked(db.update).mockReturnValue(updateChain as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await service.logout('user-uuid-1', token, 'raw-refresh', '127.0.0.1');

      expect(vi.mocked(db.update)).toHaveBeenCalled();
      expect(updateChain.set).toHaveBeenCalledWith(
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('adds jti to Redis blocklist with TTL (Req 1.6)', async () => {
      // Issue a real RS256 token and use the service's own key pair
      const { privateKey, publicKey } = await jose.generateKeyPair('RS256');

      // Patch getKeyPair to use our ephemeral keys
      // The service caches keys; we need a fresh instance
      const freshService = new AuthService();
      // Override _issueAccessToken to use our key
      const rawToken = await new jose.SignJWT({ role: 'Administrator' })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject('user-uuid-1')
        .setIssuedAt()
        .setExpirationTime('15m')
        .setJti('blocklist-jti')
        .sign(privateKey);

      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_REFRESH_TOKEN]) as never);
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      // Spy on jwtVerify to intercept with our public key
      const verifySpy = vi.spyOn(jose, 'jwtVerify').mockResolvedValueOnce({
        payload: {
          sub: 'user-uuid-1',
          jti: 'blocklist-jti',
          exp: Math.floor(Date.now() / 1000) + 900,
          iat: Math.floor(Date.now() / 1000),
          role: 'Administrator',
        },
        protectedHeader: { alg: 'RS256' },
      } as never);

      await freshService.logout('user-uuid-1', rawToken, 'raw-refresh', '10.0.0.3');

      expect(vi.mocked(redis.set)).toHaveBeenCalledWith(
        'blocklist:jti:blocklist-jti',
        '1',
        'EX',
        expect.any(Number),
      );

      verifySpy.mockRestore();
    });

    it('logs a logout auth event (Req 13.5)', async () => {
      vi.mocked(db.select).mockReturnValue(makeSelectChain([MOCK_REFRESH_TOKEN]) as never);
      vi.mocked(db.update).mockReturnValue(makeUpdateChain() as never);
      vi.mocked(db.insert).mockReturnValue(makeInsertChain() as never);
      vi.mocked(bcrypt.compare).mockResolvedValue(true as never);

      await service.logout('user-uuid-1', 'some.invalid.token', 'raw-refresh', '127.0.0.1');

      expect(vi.mocked(db.insert)).toHaveBeenCalled();
    });
  });

  // -------------------------------------------------------------------------
  // verifyAccessToken()
  // -------------------------------------------------------------------------

  describe('verifyAccessToken()', () => {
    it('returns decoded claims for a valid, non-blocklisted token (Req 1.7)', async () => {
      const { privateKey } = await jose.generateKeyPair('RS256');
      const token = await new jose.SignJWT({ role: 'Regional Manager' })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject('user-abc')
        .setIssuedAt()
        .setExpirationTime('15m')
        .setJti('jti-abc')
        .sign(privateKey);

      // Patch jwtVerify to return our payload
      vi.spyOn(jose, 'jwtVerify').mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          role: 'Regional Manager',
          jti: 'jti-abc',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        protectedHeader: { alg: 'RS256' },
      } as never);
      vi.mocked(redis.get).mockResolvedValue(null);

      const claims = await service.verifyAccessToken(token);

      expect(claims.sub).toBe('user-abc');
      expect(claims.role).toBe('Regional Manager');
      expect(claims.jti).toBe('jti-abc');
    });

    it('throws AuthError 401 for a blocklisted jti (Req 1.6, 1.7)', async () => {
      const { privateKey } = await jose.generateKeyPair('RS256');
      const token = await new jose.SignJWT({ role: 'Administrator' })
        .setProtectedHeader({ alg: 'RS256' })
        .setSubject('user-abc')
        .setIssuedAt()
        .setExpirationTime('15m')
        .setJti('revoked-jti')
        .sign(privateKey);

      vi.spyOn(jose, 'jwtVerify').mockResolvedValueOnce({
        payload: {
          sub: 'user-abc',
          role: 'Administrator',
          jti: 'revoked-jti',
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 900,
        },
        protectedHeader: { alg: 'RS256' },
      } as never);
      // Token is in the blocklist
      vi.mocked(redis.get).mockResolvedValue('1');

      await expect(service.verifyAccessToken(token)).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
      });
    });

    it('throws AuthError 401 for an expired token (Req 1.7)', async () => {
      // jwtVerify will throw for expired tokens
      vi.spyOn(jose, 'jwtVerify').mockRejectedValueOnce(new Error('JWTExpired'));

      await expect(service.verifyAccessToken('expired.token.here')).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
      });
    });

    it('throws AuthError 401 for a malformed token (Req 1.7)', async () => {
      vi.spyOn(jose, 'jwtVerify').mockRejectedValueOnce(new Error('JWTMalformed'));

      await expect(service.verifyAccessToken('not-a-jwt')).rejects.toMatchObject({
        name: 'AuthError',
        statusCode: 401,
      });
    });
  });

  // -------------------------------------------------------------------------
  // AuthError class
  // -------------------------------------------------------------------------

  describe('AuthError', () => {
    it('is an instance of Error with name AuthError', () => {
      const err = new AuthError('test', 401);
      expect(err).toBeInstanceOf(Error);
      expect(err.name).toBe('AuthError');
      expect(err.statusCode).toBe(401);
      expect(err.message).toBe('test');
    });

    it('defaults statusCode to 401', () => {
      const err = new AuthError('test');
      expect(err.statusCode).toBe(401);
    });
  });
});
