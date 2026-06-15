/**
 * Zod schemas for AI API payloads
 * Requirements: 11.1, 11.2, 11.3, 11.5
 */

import { z } from 'zod';

export const CopilotQuerySchema = z.object({
  query: z.string().min(1, 'Query is required').max(2000, 'Query must be 2000 characters or less'),
});
export type CopilotQueryPayload = z.infer<typeof CopilotQuerySchema>;

/** Internal schema for the ML microservice prediction request */
export const MLPredictRequestSchema = z.object({
  requests: z
    .array(
      z.object({
        requestId: z.string().uuid(),
        currentStage: z.string(),
        elapsedHours: z.number().nonnegative(),
        historicalAvgCompletionHours: z.number().nonnegative(),
        deptBacklogCount: z.number().int().nonnegative(),
        priorSlaWarningCount: z.number().int().nonnegative(),
        dayOfWeek: z.number().int().min(0).max(6),
        hourOfDay: z.number().int().min(0).max(23),
      }),
    )
    .min(1),
});
export type MLPredictRequest = z.infer<typeof MLPredictRequestSchema>;

/** Schema for a single prediction result from the ML microservice */
export const MLPredictResultSchema = z.object({
  requestId: z.string().uuid(),
  riskScore: z.number().min(0).max(1),
  riskLabel: z.enum(['Low', 'Medium', 'High', 'Critical']),
  contributingFactors: z
    .array(
      z.object({
        factor: z.string(),
        influence: z.number(),
      }),
    )
    .min(1)
    .max(5),
  predictedDelayHours: z.number().min(0).max(8760).nullable(),
  delayConfidence: z.number().min(0).max(1).nullable(),
  predictedCompletionAt: z.string().nullable(),
});
export type MLPredictResult = z.infer<typeof MLPredictResultSchema>;
