/**
 * Zod schemas for Authentication API payloads
 * Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6
 */

import { z } from 'zod';

export const LoginPayloadSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});
export type LoginPayload = z.infer<typeof LoginPayloadSchema>;

export const RefreshTokenPayloadSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
export type RefreshTokenPayload = z.infer<typeof RefreshTokenPayloadSchema>;

export const LogoutPayloadSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});
export type LogoutPayload = z.infer<typeof LogoutPayloadSchema>;

export const TokenResponseSchema = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresIn: z.number().int().positive(),
  tokenType: z.literal('Bearer'),
});
export type TokenResponse = z.infer<typeof TokenResponseSchema>;
