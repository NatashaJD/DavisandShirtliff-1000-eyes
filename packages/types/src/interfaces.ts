/**
 * Canonical TypeScript interfaces for Dayliff 1000 Eyes
 * Requirements: all
 */

import type {
  AlertLifecycleState,
  AlertSeverity,
  AlertType,
  AuthEventType,
  JourneyStage,
  PipelineStatus,
  RiskLabel,
  SnapshotType,
  SourceSystem,
  UserRole,
} from './enums.js';

// ---------------------------------------------------------------------------
// Core domain entities
// ---------------------------------------------------------------------------

/** Canonical, normalised Event stored immutably in the events table */
export interface CanonicalEvent {
  /** Globally unique event ID — supplied by the source system */
  id: string;
  /** FK to service_requests */
  requestId: string;
  /** Business event descriptor (e.g. "stage_change", "comment_added") */
  eventType: string;
  sourceSystem: SourceSystem;
  department: string | null;
  triggeredByUserId: string | null;
  previousState: string | null;
  newState: string | null;
  /** Arbitrary source metadata preserved as-is after stripping non-canonical fields */
  metadata: Record<string, unknown> | null;
  /** ISO 8601 UTC millisecond-precision timestamp from the source */
  occurredAt: string;
  /** ISO 8601 UTC timestamp when the platform received this event */
  receivedAt: string;
  pipelineStatus: PipelineStatus;
  failedSteps: string[];
}

/** Service_Request domain entity */
export interface ServiceRequest {
  id: string;
  /** Human-readable identifier, e.g. SR-2024-00001 */
  requestNumber: string;
  customerName: string;
  customerContact: string | null;
  requestType: string;
  currentStage: JourneyStage;
  currentStatus: string;
  assignedDepartment: string | null;
  assignedUserId: string | null;
  metadata: Record<string, unknown> | null;
  slaBreached: boolean;
  createdAt: string;
  updatedAt: string;
}

/** SLA_Rule definition per journey stage */
export interface SLARule {
  id: string;
  journeyStage: JourneyStage;
  /** Maximum acceptable processing time in hours */
  thresholdHours: number;
  description: string | null;
  createdAt: string;
  updatedAt: string;
}

// ---------------------------------------------------------------------------
// AI types
// ---------------------------------------------------------------------------

/** Output of the Level 1 risk assessment for a single request */
export interface RiskAssessment {
  requestId: string;
  /** 0.0–1.0 */
  riskScore: number;
  riskLabel: RiskLabel;
  /** Max 5 factors, ranked by influence descending */
  contributingFactors: Array<{ factor: string; influence: number }>;
  /** Predicted delay in hours (0–8760) */
  predictedDelayHours: number | null;
  /** 0.0–1.0 */
  delayConfidence: number | null;
  predictedCompletionAt: string | null;
  computedAt: string;
  isStale: boolean;
}

/** Level 2 Copilot query response */
export interface CopilotResponse {
  /** Human-readable answer */
  answer: string;
  /** Source records / aggregates backing the answer */
  data: Record<string, unknown>[];
  /** Debug: generated DB query */
  sourceQuery?: string;
  /** Populated when the query could not be interpreted */
  suggestedReformulations?: string[];
}

// ---------------------------------------------------------------------------
// Analytics types
// ---------------------------------------------------------------------------

/** KPI snapshot returned by the Analytics Engine */
export interface KPISet {
  /** Average end-to-end completion time in hours */
  avgCompletionTimeHours: number;
  /** Average processing time per department (key = department name) */
  avgDepartmentProcessingTime: Record<string, number>;
  /** 0.0–1.0 */
  slaComplianceRate: number;
  /** Requests completed per day */
  requestThroughput: number;
  /** Count of requests delayed per day */
  delayFrequency: number;
  /** 0.0–1.0 */
  completionRate: number;
}

/** Time-series data point for a KPI trend */
export interface TrendPoint {
  timestamp: string;
  value: number;
}

/** Trend data returned by GET /analytics/trends */
export interface TrendData {
  requestVolume: TrendPoint[];
  slaComplianceRate: TrendPoint[];
  periodStart: string;
  periodEnd: string;
}

/** Per-department efficiency metrics */
export interface DepartmentMetrics {
  department: string;
  avgProcessingTimeHours: number;
  /** Count of periods the dept's avg time exceeded its SLA threshold */
  bottleneckFrequency: number;
  slaComplianceRate: number;
}

/** A bottleneck stage as returned by GET /dashboard/bottlenecks */
export interface Bottleneck {
  journeyStage: JourneyStage;
  department: string;
  avgExcessHours: number;
  occurrenceCount: number;
  rank: number;
}

// ---------------------------------------------------------------------------
// Real-time types
// ---------------------------------------------------------------------------

/** Payload published to Redis Pub/Sub and delivered over WebSocket */
export interface BroadcastPayload {
  channel: string;
  event: string;
  data: Record<string, unknown>;
  sentAt: string;
}

// ---------------------------------------------------------------------------
// Event Processor types
// ---------------------------------------------------------------------------

/** Result returned by EventProcessorService.ingest() */
export interface IngestResult {
  eventId: string;
  requestId: string;
  status: 'accepted' | 'duplicate' | 'invalid' | 'failed';
  pipelineStatus: PipelineStatus;
  failedSteps: string[];
  receivedAt: string;
}

/** Raw payload as received from a source system before normalisation */
export interface RawEventPayload {
  [key: string]: unknown;
}

/** JSONPath-based normalisation mapping stored in integration_configs */
export interface NormalizationMap {
  sourceSystem: SourceSystem;
  fieldMappings: Record<string, string>;
  timestampFormat: string;
}

// ---------------------------------------------------------------------------
// Auth types
// ---------------------------------------------------------------------------

/** Authenticated user context attached to every request */
export interface AuthenticatedUser {
  userId: string;
  role: UserRole;
  /** JWT ID — checked against Redis blocklist */
  jti: string;
}

/** Auth event for the audit log */
export interface AuthEvent {
  id: string;
  userId: string | null;
  eventType: AuthEventType;
  ipAddress: string;
  occurredAt: string;
}

// ---------------------------------------------------------------------------
// Common API envelope
// ---------------------------------------------------------------------------

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  meta: PaginationMeta | null;
  error: string | null;
}
