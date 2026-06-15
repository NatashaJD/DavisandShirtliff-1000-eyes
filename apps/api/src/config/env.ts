/**
 * Environment configuration with validation
 */

import { z } from 'zod';

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  // Database
  DATABASE_URL: z
    .string()
    .default('postgresql://dayliff:dayliff_dev@localhost:5432/dayliff_eyes'),

  // Redis
  REDIS_URL: z.string().default('redis://localhost:6379'),

  // JWT — RS256 keys (PEM, base64-encoded in env vars)
  JWT_PRIVATE_KEY: z.string().default(''),
  JWT_PUBLIC_KEY: z.string().default(''),
  JWT_ACCESS_EXPIRY_SECONDS: z.coerce.number().int().positive().default(900), // 15 minutes
  JWT_REFRESH_EXPIRY_SECONDS: z.coerce.number().int().positive().default(604_800), // 7 days

  // ML Microservice
  ML_SERVICE_URL: z.string().default('http://localhost:8000'),

  // WebSocket server port
  WS_PORT: z.coerce.number().int().positive().default(3001),

  // CORS
  CORS_ORIGINS: z
    .string()
    .default('http://localhost:5173')
    .transform((s) => s.split(',').map((o) => o.trim())),
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export type Env = z.infer<typeof EnvSchema>;
