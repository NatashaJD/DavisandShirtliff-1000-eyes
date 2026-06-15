// API client for Dayliff 1000 Eyes
// NEXT_PUBLIC_API_URL → real Fastify API when set, dev-server mock otherwise

export const BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

// ── Generic envelope ───────────────────────────────────────────────────────

export interface ApiResponse<T> {
  success: boolean;
  data: T;
  meta: PaginationMeta | null;
  error: string | null;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
}

// ── Auth types ─────────────────────────────────────────────────────────────

export interface LoginResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface RefreshResponse {
  accessToken: string;
  expiresIn: number;
  tokenType: string;
}

export interface JwtPayload {
  sub: string;
  role: string;
  email: string;
  jti?: string;
  iat?: number;
  exp?: number;
}

// ── Domain types ───────────────────────────────────────────────────────────

export type RequestStage =
  | 'Inquiry'
  | 'Sales Review'
  | 'Engineering Design'
  | 'Quotation'
  | 'Approval'
  | 'Dispatch'
  | 'Delivery'
  | 'Completed'
  | 'Cancelled';

export type RequestStatus = 'Open' | 'Closed' | 'Cancelled';
export type Priority = 'Low' | 'Medium' | 'High';
export type AlertSeverity = 'Critical' | 'Warning' | 'Info';
export type AlertLifecycle = 'Created' | 'Acknowledged' | 'Resolved' | 'Archived';

export interface ServiceRequest {
  id: string;
  requestNumber: string;
  customerName: string;
  customerContact: string | null;
  requestType: string;
  currentStage: RequestStage;
  currentStatus: RequestStatus;
  assignedDepartment: string | null;
  assignedUserId: string | null;
  metadata: { priority?: Priority; [k: string]: unknown };
  slaBreached: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Event {
  id: string;
  requestId: string;
  eventType: string;
  sourceSystem: string;
  department: string;
  triggeredByUser: string | null;
  previousState: string | null;
  newState: string | null;
  metadata: Record<string, unknown>;
  occurredAt: string;
  receivedAt: string;
  pipelineStatus: 'complete' | 'partial' | 'pending';
  failedSteps: string[];
}

export interface TimelineEntry extends Event {
  position: number;
}

export interface Alert {
  id: string;
  requestId: string;
  alertType: string;
  severity: AlertSeverity;
  lifecycleState: AlertLifecycle;
  message: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  acknowledgedBy: string | null;
  acknowledgedAt: string | null;
  resolvedBy: string | null;
  resolvedAt: string | null;
  archivedAt: string | null;
}

export interface SlaRule {
  id: string;
  journeyStage: string;
  thresholdHours: number;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface SlaCompliance {
  byDepartment: Record<string, number>;
  byStage: Record<string, number>;
  overallComplianceRate: number;
  recordsProcessed: number;
}

export interface DashboardKpis {
  avgCompletionTimeHours: number;
  avgDepartmentProcessingTime: Record<string, number>;
  slaComplianceRate: number;
  requestThroughput: number;
  delayFrequency: number;
  completionRate: number;
}

export interface DashboardOverview {
  kpis: DashboardKpis;
  isStale: boolean;
  computedAt: string;
}

export interface Bottleneck {
  journeyStage: string;
  department: string;
  avgExcessHours: number;
  occurrenceCount: number;
  rank: number;
}

export interface TrendPoint {
  timestamp: string;
  value: number;
}

export interface TrendData {
  requestVolume: TrendPoint[];
  slaComplianceRate: TrendPoint[];
  periodStart: string;
  periodEnd: string;
}

export interface DepartmentMetrics {
  department: string;
  avgProcessingTimeHours: number;
  bottleneckFrequency: number;
  slaComplianceRate: number;
}

export interface AnalyticsReport {
  id: string;
  snapshotType: string;
  periodStart: string;
  periodEnd: string;
  kpiKey: string;
  kpiValue: number;
  createdAt: string;
}

export interface ContributingFactor {
  factor: string;
  influence: number;
}

export interface AiPrediction {
  id: string;
  requestId: string;
  riskScore: number;
  riskLabel: 'Low' | 'Medium' | 'High' | 'Critical';
  contributingFactors: ContributingFactor[];
  predictedDelayHours: number;
  delayConfidence: number;
  predictedCompletionAt: string;
  isStale: boolean;
  lastComputedAt: string;
  createdAt: string;
}

export interface CopilotResponse {
  answer: string;
  data: unknown[];
  sourceQuery: string;
}

// ── Core fetch ─────────────────────────────────────────────────────────────

function getStoredToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem('auth-storage');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { accessToken?: string } };
    return parsed?.state?.accessToken ?? null;
  } catch {
    return null;
  }
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<ApiResponse<T>> {
  const token = getStoredToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE_URL}${path}`, { ...options, headers });
  const json = (await res.json()) as ApiResponse<T>;
  if (!res.ok) throw new Error((json.error as string | null) ?? `Request failed: ${res.status}`);
  return json;
}

// ── Auth ───────────────────────────────────────────────────────────────────

export async function login(email: string, password: string): Promise<LoginResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const json = (await res.json()) as ApiResponse<LoginResponse>;
  if (!res.ok) throw new Error((json.error as string | null) ?? 'Login failed');
  return json.data;
}

export async function refreshToken(token: string): Promise<RefreshResponse> {
  const res = await fetch(`${BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  });
  const json = (await res.json()) as ApiResponse<RefreshResponse>;
  if (!res.ok) throw new Error((json.error as string | null) ?? 'Token refresh failed');
  return json.data;
}

export async function logoutApi(token: string): Promise<void> {
  await fetch(`${BASE_URL}/auth/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: token }),
  });
}

export function decodeJwt(token: string): JwtPayload | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = parts[1];
    if (!payload) return null;
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(decoded) as JwtPayload;
  } catch {
    return null;
  }
}

// ── Dashboard ──────────────────────────────────────────────────────────────

export const getDashboardOverview = () =>
  apiFetch<DashboardOverview>('/dashboard/overview');

export const getDashboardBottlenecks = () =>
  apiFetch<Bottleneck[]>('/dashboard/bottlenecks');

// ── Requests ───────────────────────────────────────────────────────────────

export const getRequests = (params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  return apiFetch<ServiceRequest[]>(`/requests${qs ? `?${qs}` : ''}`);
};

export const getRequest = (id: string) =>
  apiFetch<ServiceRequest>(`/requests/${id}`);

export const createRequest = (body: Partial<ServiceRequest>) =>
  apiFetch<ServiceRequest>('/requests', { method: 'POST', body: JSON.stringify(body) });

export const updateRequest = (id: string, body: Partial<ServiceRequest>) =>
  apiFetch<ServiceRequest>(`/requests/${id}`, { method: 'PATCH', body: JSON.stringify(body) });

// ── Events ─────────────────────────────────────────────────────────────────

export const getEvents = (params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  return apiFetch<Event[]>(`/events${qs ? `?${qs}` : ''}`);
};

// ── Timeline ───────────────────────────────────────────────────────────────

export const getTimeline = (requestId: string) =>
  apiFetch<TimelineEntry[]>(`/timeline/${requestId}`);

// ── Alerts ─────────────────────────────────────────────────────────────────

export const getAlerts = (params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  return apiFetch<Alert[]>(`/alerts${qs ? `?${qs}` : ''}`);
};

export const updateAlert = (id: string, action: 'acknowledge' | 'resolve' | 'archive') =>
  apiFetch<Alert>(`/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ action }) });

// ── SLA ────────────────────────────────────────────────────────────────────

export const getSlaRules = () => apiFetch<SlaRule[]>('/sla/rules');

export const getSlaCompliance = (from: string, to: string) =>
  apiFetch<SlaCompliance>(`/sla/compliance?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const updateSlaRule = (stage: string, body: { thresholdHours?: number; description?: string }) =>
  apiFetch<SlaRule>(`/sla/rules/${encodeURIComponent(stage)}`, { method: 'PUT', body: JSON.stringify(body) });

// ── Analytics ──────────────────────────────────────────────────────────────

export const getAnalyticsTrends = (from: string, to: string) =>
  apiFetch<TrendData>(`/analytics/trends?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`);

export const getAnalyticsDepartments = () =>
  apiFetch<DepartmentMetrics[]>('/analytics/departments');

export const getAnalyticsReports = (params: Record<string, string | number> = {}) => {
  const qs = new URLSearchParams(
    Object.fromEntries(Object.entries(params).map(([k, v]) => [k, String(v)])),
  ).toString();
  return apiFetch<AnalyticsReport[]>(`/analytics/reports${qs ? `?${qs}` : ''}`);
};

// ── AI ─────────────────────────────────────────────────────────────────────

export const getAiPrediction = (requestId: string) =>
  apiFetch<AiPrediction>(`/ai/predictions/${requestId}`);

export const postCopilot = (query: string) =>
  apiFetch<CopilotResponse>('/ai/copilot', { method: 'POST', body: JSON.stringify({ query }) });
