/**
 * AuthService — JWT issuance, refresh, and revocation
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.5
 */

import * as bcrypt from 'bcryptjs';
import { eq, and, isNull, gt } from 'drizzle-orm';
import {
  SignJWT,
  jwtVerify,
  type JWTPayload,
  importPKCS8,
  importSPKI,
  generateKeyPair as joseGenerateKeyPair,
} from 'jose';
import { randomBytes } from 'node:crypto';

import { env } from '../config/env.js';
import { redis } from '../config/redis.js';
import { db } from '../db/client.js';
import { authEvents } from '../db/schema/auth-events.js';
import { refreshTokens } from '../db/schema/refresh-tokens.js';
import { users } from '../db/schema/users.js';
import { AuthEventType } from '@dayliff/types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface LoginResult {
  accessToken: string;
  refreshToken: string;
  expiresIn: 900;
  tokenType: 'Bearer';
}

export interface RefreshResult {
  accessToken: string;
  expiresIn: 900;
  tokenType: 'Bearer';
}

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  role: string;
  jti: string;
  iat: number;
  exp: number;
}

// ---------------------------------------------------------------------------
// Key loading helpers
// ---------------------------------------------------------------------------

/**
 * Decode a base64-encoded PEM string from the environment variable.
 * The env var is expected to be the PEM content, base64-encoded so it fits
 * cleanly on a single line. Falls back to treating it as raw PEM.
 */
function decodePem(raw: string): string {
  if (!raw) return '';
  // If it contains newlines it is already raw PEM
  if (raw.includes('\n')) return raw;
  // Otherwise try base64 decode
  try {
    return Buffer.from(raw, 'base64').toString('utf-8');
  } catch {
    return raw;
  }
}

let _privateKey: Awaited<ReturnType<typeof importPKCS8>> | null = null;
let _publicKey: Awaited<ReturnType<typeof importSPKI>> | null = null;

/**
 * Load and cache the RS256 key pair.
 * In development, if the env vars are empty, generate an ephemeral key pair.
 */
async function getKeyPair(): Promise<{
  privateKey: Awaited<ReturnType<typeof importPKCS8>>;
  publicKey: Awaited<ReturnType<typeof importSPKI>>;
}> {
  if (_privateKey && _publicKey) {
    return { privateKey: _privateKey, publicKey: _publicKey };
  }

  const rawPrivate = decodePem(env.JWT_PRIVATE_KEY);
  const rawPublic = decodePem(env.JWT_PUBLIC_KEY);

  if (rawPrivate && rawPublic) {
    _privateKey = await importPKCS8(rawPrivate, 'RS256');
    _publicKey = await importSPKI(rawPublic, 'RS256');
  } else {
    // Development fallback — ephemeral key pair
    const { privateKey, publicKey } = await joseGenerateKeyPair('RS256');
    _privateKey = privateKey as Awaited<ReturnType<typeof importPKCS8>>;
    _publicKey = publicKey as Awaited<ReturnType<typeof importSPKI>>;
  }

  return { privateKey: _privateKey!, publicKey: _publicKey! };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/** Generate a cryptographically random 64-byte hex string for the refresh token */
function generateRawRefreshToken(): string {
  return randomBytes(64).toString('hex');
}

/** Redis blocklist key for a JWT ID */
function blocklist_key(jti: string): string {
  return `blocklist:jti:${jti}`;
}

async function logAuthEvent(
  eventType: AuthEventType,
  ipAddress: string,
  userId?: string | null,
): Promise<void> {
  try {
    await db.insert(authEvents).values({
      userId: userId ?? null,
      eventType,
      ipAddress,
      occurredAt: new Date(),
    });
  } catch (err) {
    // Auth event logging must never fail the primary operation — swallow the error
    console.error('[AuthService] Failed to log auth event:', err);
  }
}

// ---------------------------------------------------------------------------
// AuthService
// ---------------------------------------------------------------------------

export class AuthService {
  /**
   * Authenticate a user with email + password.
   * Returns access token and refresh token on success; throws on failure.
   * Requirement 1.1, 1.2
   */
  async login(email: string, password: string, ipAddress: string): Promise<LoginResult> {
    // 1. Look up user
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.email, email.toLowerCase().trim()), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      await logAuthEvent(AuthEventType.LoginFailure, ipAddress, null);
      throw new AuthError('Invalid credentials', 401);
    }

    // 2. Verify password
    const passwordValid = await bcrypt.compare(password, user.passwordHash);
    if (!passwordValid) {
      await logAuthEvent(AuthEventType.LoginFailure, ipAddress, user.id);
      throw new AuthError('Invalid credentials', 401);
    }

    // 3. Issue tokens
    const { accessToken, jti } = await this._issueAccessToken(user.id, user.role);
    const rawRefreshToken = generateRawRefreshToken();

    // 4. Persist refresh token (hashed at cost 12)
    const tokenHash = await bcrypt.hash(rawRefreshToken, 12);
    const expiresAt = new Date(Date.now() + env.JWT_REFRESH_EXPIRY_SECONDS * 1000);

    await db.insert(refreshTokens).values({
      userId: user.id,
      tokenHash,
      expiresAt,
    });

    // 5. Log success
    await logAuthEvent(AuthEventType.LoginSuccess, ipAddress, user.id);

    return {
      accessToken,
      refreshToken: rawRefreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
    };
  }

  /**
   * Exchange a valid refresh token for a new access token.
   * Requirements: 1.3, 1.4, 1.5
   */
  async refresh(rawRefreshToken: string, ipAddress: string): Promise<RefreshResult> {
    // 1. Load all non-expired, non-revoked refresh tokens and find a matching hash.
    //    We cannot query by hash directly (bcrypt), so we load candidates and compare.
    //    For safety we limit to a reasonable recent window.
    const now = new Date();
    const candidates = await db
      .select()
      .from(refreshTokens)
      .where(and(isNull(refreshTokens.revokedAt), gt(refreshTokens.expiresAt, now)));

    let matchedToken: (typeof candidates)[number] | null = null;
    for (const candidate of candidates) {
      const valid = await bcrypt.compare(rawRefreshToken, candidate.tokenHash);
      if (valid) {
        matchedToken = candidate;
        break;
      }
    }

    if (!matchedToken) {
      await logAuthEvent(AuthEventType.TokenRefreshFailure, ipAddress, null);
      throw new AuthError('Invalid or expired refresh token', 401);
    }

    // 2. Load user
    const [user] = await db
      .select()
      .from(users)
      .where(and(eq(users.id, matchedToken.userId), eq(users.isActive, true)))
      .limit(1);

    if (!user) {
      await logAuthEvent(AuthEventType.TokenRefreshFailure, ipAddress, matchedToken.userId);
      throw new AuthError('Invalid or expired refresh token', 401);
    }

    // 3. Issue new access token
    const { accessToken } = await this._issueAccessToken(user.id, user.role);

    // 4. Log success
    await logAuthEvent(AuthEventType.TokenRefresh, ipAddress, user.id);

    return {
      accessToken,
      expiresIn: 900,
      tokenType: 'Bearer',
    };
  }

  /**
   * Revoke a session: mark the refresh token as revoked, and add the access
   * token's jti to the Redis blocklist.
   * The caller passes the raw Bearer access token string so we can extract the
   * jti and remaining TTL via jwtVerify.
   * Requirement 1.6, 13.5
   */
  async logout(
    userId: string,
    rawAccessToken: string,
    rawRefreshToken: string,
    ipAddress: string,
  ): Promise<void> {
    const now = new Date();

    // 1. Find and revoke the matching refresh token
    const candidates = await db
      .select()
      .from(refreshTokens)
      .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));

    let revokedTokenId: string | null = null;
    for (const candidate of candidates) {
      const valid = await bcrypt.compare(rawRefreshToken, candidate.tokenHash);
      if (valid) {
        revokedTokenId = candidate.id;
        break;
      }
    }

    if (revokedTokenId) {
      await db
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(eq(refreshTokens.id, revokedTokenId));
    }

    // 2. Add access token jti to Redis blocklist with TTL = remaining lifetime
    try {
      const { publicKey } = await getKeyPair();
      const { payload } = await jwtVerify(rawAccessToken, publicKey, { algorithms: ['RS256'] });
      const jti = payload.jti;
      if (jti) {
        const ttlSeconds = Math.max(
          0,
          typeof payload.exp === 'number'
            ? payload.exp - Math.floor(Date.now() / 1000)
            : env.JWT_ACCESS_EXPIRY_SECONDS,
        );
        if (ttlSeconds > 0) {
          await redis.set(blocklist_key(jti), '1', 'EX', ttlSeconds);
        }
      }
    } catch {
      // Token is already invalid/expired — no need to blocklist
    }

    // 3. Log event
    await logAuthEvent(AuthEventType.Logout, ipAddress, userId);
  }

  /**
   * Verify an access token string (used by the auth middleware).
   * Throws if the token is invalid, expired, or blocklisted.
   */
  async verifyAccessToken(token: string): Promise<AccessTokenClaims> {
    const { publicKey } = await getKeyPair();

    let payload: JWTPayload;
    try {
      const result = await jwtVerify(token, publicKey, { algorithms: ['RS256'] });
      payload = result.payload;
    } catch {
      throw new AuthError('Invalid or expired access token', 401);
    }

    const jti = payload.jti;
    if (!jti) {
      throw new AuthError('Token missing jti claim', 401);
    }

    // Check Redis blocklist
    const blocked = await redis.get(blocklist_key(jti));
    if (blocked !== null) {
      throw new AuthError('Token has been revoked', 401);
    }

    return payload as AccessTokenClaims;
  }

  // ---------------------------------------------------------------------------
  // Private helpers
  // ---------------------------------------------------------------------------

  private async _issueAccessToken(
    userId: string,
    role: string,
  ): Promise<{ accessToken: string; jti: string }> {
    const { privateKey } = await getKeyPair();
    const iat = Math.floor(Date.now() / 1000);
    const exp = iat + env.JWT_ACCESS_EXPIRY_SECONDS; // 900 seconds = 15 minutes
    const jti = randomBytes(16).toString('hex');

    const accessToken = await new SignJWT({ role })
      .setProtectedHeader({ alg: 'RS256' })
      .setSubject(userId)
      .setIssuedAt(iat)
      .setExpirationTime(exp)
      .setJti(jti)
      .sign(privateKey);

    return { accessToken, jti };
  }
}

// ---------------------------------------------------------------------------
// Singleton
// ---------------------------------------------------------------------------

export const authService = new AuthService();

// ---------------------------------------------------------------------------
// Custom error
// ---------------------------------------------------------------------------

export class AuthError extends Error {
  constructor(
    message: string,
    public readonly statusCode: 401 | 403 = 401,
  ) {
    super(message);
    this.name = 'AuthError';
  }
}
