#` Implementation Plan: Dayliff 1000 Eyes

## Overview

This plan implements the Dayliff 1000 Eyes Enterprise Process Observability Platform incrementally, starting with the foundational data layer and authentication, then building up through event ingestion, SLA monitoring, real-time communication, analytics, AI capabilities, and dashboard APIs. Each task builds directly on the previous, ending with all components wired together. The stack is **Node.js 20 LTS (TypeScript)** with **Fastify 4**, **Drizzle ORM**, **BullMQ**, **PostgreSQL 16 + TimescaleDB**, **Redis 7**, and a **Python FastAPI** ML microservice.

---

## Tasks

- [x] 1. Project structure, tooling, and shared types
  - Initialize the monorepo: Node.js TypeScript backend service (`apps/api`), Python ML microservice (`apps/ml`), shared types package (`packages/types`)
  - Configure `tsconfig.json`, `eslint`, `prettier`, `vitest`, `drizzle.config.ts`
  - Define all canonical TypeScript interfaces and enums: `CanonicalEvent`, `ServiceRequest`, `JourneyStage`, `UserRole`, `AlertSeverity`, `AlertLifecycleState`, `SLARule`, `RiskAssessment`, `CopilotResponse`, `BroadcastPayload`, `IngestResult`, `KPISet`, `TrendData`, `DepartmentMetrics`, `Bottleneck`
  - Define Zod schemas for all inbound API payloads (auth, requests, events, alerts, SLA, analytics, AI)
  - Set up Docker Compose for local dev: PostgreSQL 16 + TimescaleDB extension, Redis 7, pgvector extension
  - _Requirements: all_

- [x] 2. Database schema and migrations
  - [x] 2.1 Create Drizzle ORM schema files for all tables: `users`, `refresh_tokens`, `auth_events`, `service_requests`, `events`, `timelines`, `sla_rules`, `alerts`, `ai_predictions`, `analytics_snapshots`, `integration_configs`
    - Implement the TimescaleDB `create_hypertable` call for `analytics_snapshots` in the migration
    - Add the PostgreSQL row-level security policy on `events` to prevent `UPDATE`/`DELETE`
    - _Requirements: 2.1, 3.1, 3.6, 4.1, 5.1, 6.1, 8.1, 10.1, 12.4, 13.1, 13.4_
  - [ ]* 2.2 Write property test for event immutability at the DB layer
    - **Property 5: Event Immutability and Idempotency** — generate arbitrary event records, attempt UPDATE and DELETE via raw SQL, assert both are rejected by RLS policy
    - **Validates: Requirements 3.6, 13.4**

- [x] 3. Authentication — JWT issuance, refresh, and revocation
  - [x] 3.1 Implement the auth service: `POST /auth/login`, `POST /auth/refresh`, `POST /auth/logout`
    - Use `jose` (RS256) for signing/verification; bcrypt cost 12 for refresh token and password hashing
    - Issue access token (15-minute expiry) and refresh token (7-day expiry) on successful login
    - On logout, set `revoked_at` on the refresh token and add `jti` to Redis blocklist with TTL = remaining access token lifetime
    - Log all auth events (login_success, login_failure, logout, token_refresh, token_refresh_failure) with millisecond-precision UTC timestamp and IP address into `auth_events`
    - Return HTTP 401 on invalid/expired credentials, expired/invalid refresh token; HTTP 401 on blocklisted JTI
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 13.5_
  - [ ]* 3.2 Write property test for JWT access token expiry invariant
    - **Property 1: JWT Access Token Expiry Invariant** — for arbitrary valid users and issuance times, assert `exp === iat + 900` and `role` claim matches user's assigned role
    - **Validates: Requirements 1.1, 1.3**
  - [ ]* 3.3 Write property test for refresh token revocation round trip
    - **Property 2: Refresh Token Revocation Round Trip** — for arbitrary issued refresh tokens, after logout assert any subsequent refresh attempt returns 401
    - **Validates: Requirements 1.6**

- [x] 4. RBAC middleware and route guards
  - [x] 4.1 Implement JWT authentication middleware: extract and verify Bearer token, check Redis blocklist, attach user context (`userId`, `userRole`) to request
    - Return HTTP 401 for missing or invalid JWT
    - _Requirements: 1.7_
  - [x] 4.2 Implement RBAC route guard middleware: define the permission matrix (as a typed map) and enforce it per endpoint
    - Return HTTP 403 with no data for unauthorized roles
    - Implement service-layer row-level scoping helpers (e.g., `scopeRequestsForRole`, `scopeAlertsForRole`) for use in all service functions
    - _Requirements: 1.8, 1.9, 2.7, 7.8_
  - [ ]* 4.3 Write property test for RBAC endpoint isolation
    - **Property 3: RBAC Endpoint Isolation** — for arbitrary endpoints and roles lacking permission, assert HTTP 403 with empty data body regardless of resource existence
    - **Validates: Requirements 1.8, 2.7, 7.8**

- [x] 5. Service Request management API
  - [x] 5.1 Implement `POST /requests`, `GET /requests`, `GET /requests/{id}`, `PATCH /requests/{id}`
    - `POST`: validate with Zod, generate UUID and human-readable request number (`SR-YYYY-NNNNN`), set initial stage to `Inquiry`, return HTTP 201
    - `GET /requests`: paginated (default 20, max 100) with role-scoped filtering
    - `GET /requests/{id}`: return full record or HTTP 404
    - `PATCH /requests/{id}`: update only mutable fields, reject changes to `id`, `request_number`, `current_stage`; update `updated_at`; return HTTP 422 on invalid payload
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_
  - [ ]* 5.2 Write property test for service request field immutability
    - **Property 4: Service Request Field Immutability** — for arbitrary PATCH payloads (including ones attempting to change `id`, `request_number`, `current_stage`), assert those three fields are unchanged and `updated_at` strictly increases
    - **Validates: Requirements 2.5**

- [x] 6. Event ingestion and processing pipeline
  - [x] 6.1 Implement the `EventProcessorService`: `ingest()`, `normalize()`, `validateCanonical()`, `store()`, `enqueuePipelineTasks()`
    - Validate HMAC signature at the API gateway layer before forwarding to the processor
    - Normalize all timestamps to ISO 8601 UTC; strip source-specific fields from canonical record
    - Store event as immutable INSERT; return HTTP 409 on duplicate `event_id`; return HTTP 422 on missing required fields
    - Enforce 1 MB payload size limit (HTTP 413)
    - Enqueue BullMQ jobs: `timeline-update`, `sla-evaluate`, `alert-generate`, `realtime-broadcast`, `analytics-update`
    - On partial pipeline failure: retain stored event, set `pipeline_status = 'partial'`, populate `failed_steps`, return HTTP 202
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 12.1, 12.2_
  - [ ]* 6.2 Write property test for event normalization canonical completeness
    - **Property 6: Event Normalization Canonical Completeness** — for arbitrary raw payloads from each source system, after normalization assert all canonical required fields are present, `occurred_at` is valid ISO 8601 UTC, and no source-specific fields are in the output
    - **Validates: Requirements 3.4, 12.5**
  - [ ]* 6.3 Write property test for event immutability and idempotency via API
    - **Property 5: Event Immutability and Idempotency** — for arbitrary stored events, assert PUT/PATCH/DELETE via the API returns HTTP 405; for arbitrary duplicate event IDs, assert HTTP 409 and stored count remains 1
    - **Validates: Requirements 3.5, 3.6, 13.4**
  - [x] 6.4 Implement `GET /events` with pagination and filters (Request ID, Department, Event Type, date range), sorted by timestamp descending; return empty list with HTTP 200 when no matches
    - _Requirements: 3.7_

- [x] 7. Customer Journey Timeline
  - [x] 7.1 Implement the `timeline-update` BullMQ worker: append event to `timelines`, compute the `position` field using `occurred_at` ascending then `event_id` ascending as tie-breaker, complete within 2 seconds of event acceptance
    - _Requirements: 4.4, 4.5_
  - [x] 7.2 Implement `GET /timeline/{request_id}`: enrich each event with type, timestamp, department, user, source system (use `null` for missing enrichment fields); return HTTP 404 for non-existent request IDs
    - _Requirements: 4.1, 4.2, 4.3_
  - [ ]* 7.3 Write property test for timeline chronological ordering
    - **Property 7: Timeline Chronological Ordering** — for arbitrary sets of events inserted with varying timestamps, assert returned sequence is monotonically non-decreasing by `occurred_at` and tie-broken by `event_id` ascending
    - **Validates: Requirements 4.3**
  - [ ]* 7.4 Write property test for timeline append-only invariant
    - **Property 8: Timeline Append-Only Invariant** — for arbitrary sequences of event ingestions, assert the set of event IDs in the timeline only grows and no previously appended event is ever absent from a subsequent retrieval
    - **Validates: Requirements 4.5, 13.1**

- [x] 8. Checkpoint — core pipeline
  - Ensure all unit and property tests pass for tasks 2–7.
  - Verify event ingestion end-to-end: submit an event, confirm storage, timeline append, and BullMQ job enqueue.
  - Ask the user if any questions arise before continuing.

- [x] 9. SLA monitoring and breach detection
  - [x] 9.1 Implement `SLAMonitorService`: `evaluate()`, `getRule()`, `hasActiveAlert()`, `updateRules()`, `getComplianceMetrics()`
    - Compute `percentUsed = elapsedHours / thresholdHours`; classify Normal (<80%), Warning (≥80% <100%), Breached (≥100%)
    - Before generating an alert, call `hasActiveAlert()` to prevent duplicates for the same `(request_id, stage, severity)`
    - On breach: set `sla_breached = TRUE` on the service request
    - If no SLA rule exists for a stage: log Info-severity Alert, do not generate a breach score
    - _Requirements: 5.1, 5.2, 5.3, 5.5, 5.6_
  - [x] 9.2 Implement the `sla-evaluate` BullMQ worker that calls `SLAMonitorService.evaluate()` for each incoming event's associated request
    - _Requirements: 5.1_
  - [x] 9.3 Implement `GET /sla/compliance` (Regional Manager, Administrator): return SLA compliance rate per department and per journey stage for the requested period (1–365 calendar days); return 100% compliance with zero records for periods with no data
    - Implement `GET /sla/rules` (all roles) and `PUT /sla/rules/{stage}` (Administrator only): update threshold and apply to all active (non-terminal) requests
    - _Requirements: 5.4, 5.5, 5.7_
  - [ ]* 9.4 Write property test for SLA threshold classification
    - **Property 9: SLA Threshold Classification** — for arbitrary `(elapsedHours, thresholdHours)` pairs and any `(request_id, stage)`, assert the classification is Normal/Warning/Breached per the defined thresholds and no duplicate severity alert is generated for the same pair
    - **Validates: Requirements 5.2, 5.3**

- [x] 10. Alert management
  - [x] 10.1 Implement `alert-generate` BullMQ worker: create alerts with correct type, severity, and initial lifecycle state `Created`; broadcast via Realtime_Broadcaster; deliver to users per role-permission and notification preference (Dashboard, Email, SMS stubs)
    - _Requirements: 6.1, 6.2, 6.3_
  - [x] 10.2 Implement `PATCH /alerts/{id}` for Acknowledge and Resolve transitions; enforce `Created → Acknowledged → Resolved → Archived` order; return HTTP 409 on invalid transition; return HTTP 403 if user is not authorized
    - Record acknowledging/resolving user and timestamp on each transition
    - _Requirements: 6.4, 6.5, 6.6, 6.7_
  - [x] 10.3 Implement `GET /alerts` with pagination (default 20, max 100) and filters (severity, type, lifecycle state, date range) scoped by user role
    - _Requirements: 6.8_
  - [ ]* 10.4 Write property test for alert lifecycle state machine
    - **Property 10: Alert Lifecycle State Machine** — for arbitrary alert states and arbitrary target states, assert only `Created → Acknowledged → Resolved → Archived` transitions succeed (HTTP 200) and all others return HTTP 409 with unchanged state
    - **Validates: Requirements 6.6, 6.7**

- [x] 11. Real-time communication (WebSocket + Redis Pub/Sub)
  - [x] 11.1 Implement the `RealtimeBroadcasterService`: `publish()`, `subscribe()`, `queueUndelivered()`, `drainQueue()`
    - Set up uWebSockets.js WebSocket server; subscribe broadcaster workers to Redis Pub/Sub channels
    - Channel naming: `request:{id}`, `alert:{severity}`, `dashboard:{role}`, `analytics:snapshot`
    - Implement client protocol: `subscribe`, `update`, `reconnect` message types
    - On reconnect: accept `last_received_at`, drain queued messages stored in Redis (24-hour TTL) for that `connectionId`
    - _Requirements: 9.1, 9.2, 9.3, 9.4_
  - [x] 11.2 Implement the `realtime-broadcast` BullMQ worker: publish to correct Redis Pub/Sub channel; fan out to all broadcaster instances within 3-second target
    - If broadcaster is unavailable: set a stale-data indicator flag deliverable to clients within 10 seconds
    - _Requirements: 9.1, 7.7_
  - [x] 11.3 Implement Alert push notifications over WebSocket: push to all connected users whose role permissions include the alert's severity level
    - _Requirements: 9.4_

- [x] 12. Checkpoint — event pipeline, SLA, alerts, real-time
  - Ensure all tests pass for tasks 9–11.
  - Verify end-to-end: ingest event → SLA evaluated → alert created → WebSocket push delivered.
  - Ask the user if any questions arise before continuing.

- [x] 13. Operational analytics and reporting
  - [x] 13.1 Implement `AnalyticsEngineService`: `computeKPIs()`, `generateSnapshot()`, `getTrends()`, `getDepartmentEfficiency()`, `getBottlenecks()`
    - KPIs: Average Completion Time, Average Department Processing Time, SLA Compliance Rate, Request Throughput, Delay Frequency, Completion Rate (all computed from `events` and `analytics_snapshots`)
    - Use TimescaleDB continuous aggregates for efficient time-series KPI queries
    - _Requirements: 8.1_
  - [x] 13.2 Implement BullMQ repeatable jobs for snapshot generation: Daily (midnight UTC), Weekly (Monday 00:00 UTC), Monthly (1st 00:00 UTC), Quarterly (1st of quarter 00:00 UTC)
    - Persist snapshots to `analytics_snapshots`; retain ≥730 days
    - _Requirements: 8.2, 8.5_
  - [x] 13.3 Implement `GET /analytics/trends` (1–366 day range validation; reject >366 days with error; return empty result for no-data ranges)
    - Implement `GET /analytics/departments` (avg processing time per dept, bottleneck frequency)
    - Implement `GET /analytics/reports` (list/download persisted snapshots)
    - _Requirements: 8.3, 8.4, 8.6, 8.7_
  - [x] 13.4 Implement `analytics-update` BullMQ worker: update TimescaleDB aggregates on each new event
    - _Requirements: 3.1_
  - [ ]* 13.5 Write property test for analytics trend range validation
    - **Property 12: Analytics Trend Range Validation** — for arbitrary integer day ranges 1–366, assert success response; for arbitrary ranges >366, assert error; assert data points fall within requested time boundaries and not outside
    - **Validates: Requirements 8.3, 8.7**

- [x] 14. Role-based dashboards
  - [x] 14.1 Implement `GET /dashboard/overview`: return KPI data scoped to the requesting user's role (Administrator/Regional Manager see all; others see department-scoped data)
    - _Requirements: 7.1, 7.2, 7.5_
  - [x] 14.2 Implement `GET /dashboard/bottlenecks` (Regional Manager, Administrator): return up to 10 bottleneck stages ranked by average excess time beyond SLA thresholds, scoped by role
    - _Requirements: 7.6_
  - [x] 14.3 Wire dashboard endpoints to the Realtime_Broadcaster: push dashboard updates on request/alert/workflow status changes via `dashboard:{role}` channel within 5 seconds; display stale-data indicator if broadcaster is unavailable within 10 seconds
    - _Requirements: 7.7_
  - [ ]* 14.4 Write property test for dashboard role scope containment
    - **Property 11: Dashboard Role Scope Containment** — for arbitrary dashboard responses and arbitrary users, assert every record in the response is accessible to the requesting user's role and no out-of-scope record appears
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5**

- [x] 15. AI Engine — Level 1 Predictive Analytics
  - [x] 15.1 Implement the Python FastAPI ML microservice (`apps/ml`): `/internal/predict` endpoint accepting a batch of active request feature vectors; return risk score, risk label, delay hours, delay confidence, and predicted completion time per request
    - Feature extraction: current stage, elapsed hours, historical avg, dept backlog, prior SLA warning count, day-of-week, hour-of-day
    - Use XGBoost for risk/delay prediction; apply label thresholds: Low [0.0, 0.25), Medium [0.25, 0.50), High [0.50, 0.75), Critical [0.75, 1.0]
    - _Requirements: 10.1, 10.2_
  - [x] 15.2 Implement `AIEngineService.getRiskAssessment()` and `AIEngineService.getDelayPrediction()` in the Node.js service: call ML microservice, persist to `ai_predictions`, enforce 1–5 contributing factors constraint
    - Implement the 60-minute BullMQ repeatable job `AIEngineService.refreshAllPredictions()` for all active requests; on failure, mark predictions stale with `is_stale = true` and retain last values
    - Auto-create Critical Delay Alert when risk score ≥ 0.75 (High or Critical)
    - _Requirements: 10.3, 10.4, 10.5_
  - [x] 15.3 Implement `GET /ai/predictions/{request_id}` (Administrator, Regional Manager): return current prediction with `is_stale` and `last_computed_at`; return 503 if ML microservice is unavailable without affecting other endpoints
    - _Requirements: 10.6_
  - [ ]* 15.4 Write property test for risk score label consistency
    - **Property 13: Risk Score Label Consistency** — for arbitrary risk scores in [0, 1], assert the label is exactly Low/Medium/High/Critical per defined thresholds and the contributing factors count is between 1 and 5
    - **Validates: Requirements 10.1**

- [x] 16. AI Engine — Level 2 Operational Copilot
  - [x] 16.1 Implement `AIEngineService.copilotQuery()`: LangChain agent with tools `search_requests`, `get_sla_compliance`, `get_dept_delays`, `semantic_search` (pgvector); inject user role and ID into system prompt for RBAC scoping; each tool applies identical WHERE-clause scoping as the REST API
    - Generate text embeddings for semantic search using `text-embedding-3-small` (or `nomic-embed-text`)
    - On unrecognized query (confidence below threshold or tool error): return HTTP 200 with error message and 1–3 `suggestedReformulations`
    - _Requirements: 11.1, 11.2, 11.3, 11.4_
  - [x] 16.2 Implement `POST /ai/copilot` (Administrator, Regional Manager): validate payload, call `copilotQuery()`, return `{ answer, data, sourceQuery }`; enforce 10-second response SLA; return HTTP 503 if AI Engine unavailable without affecting other endpoints
    - _Requirements: 11.5, 11.6_
  - [ ]* 16.3 Write property test for Copilot RBAC data scope
    - **Property 14: Copilot RBAC Data Scope** — for arbitrary Copilot queries across multiple roles, assert every record in the `data` field is within the requesting user's role scope and no out-of-scope records appear
    - **Validates: Requirements 11.4**

- [x] 17. External system integration
  - [x] 17.1 Implement HMAC webhook verification in the API Gateway layer: verify `X-Signature-SHA256` header using timing-safe comparison; reject with HTTP 401 if absent or invalid; reject payloads >1MB with HTTP 413; retrieve secret from Vault/Secrets Manager cache at startup
    - _Requirements: 12.1, 12.2_
  - [x] 17.2 Implement the exponential backoff retry logic in the `EventProcessorService`: up to 3 retries (delays: 1s, 2s, 4s); on 3 failures, mark event as `failed` and generate Operational Alert
    - _Requirements: 12.3_
  - [x] 17.3 Implement the scheduled sync BullMQ repeatable job: per `integration_config.sync_interval_mins`, fetch events from external system since `last_synced_at`, submit through `ingest()`, treat 409 (duplicate) as success, update `last_synced_at`
    - _Requirements: 12.4_
  - [x] 17.4 Implement the normalization mapping engine: evaluate JSONPath expressions from `integration_configs.normalization_map`; reject with HTTP 422 + Operational Alert if mapping is missing or cannot produce a valid canonical event
    - _Requirements: 12.5_

- [x] 18. Data integrity, audit trail, and archival
  - [x] 18.1 Implement the state transition audit middleware: wrap every `service_requests` state change in a transaction that inserts an immutable Event record (previous state, new state, user, millisecond UTC timestamp) BEFORE committing the state change; roll back and return an error if the Event INSERT fails
    - _Requirements: 13.1, 13.6_
  - [x] 18.2 Implement the archival API (Administrator only): accept a cutoff date, run the archive job in a transaction (INSERT into archive partitions, set `archived = TRUE` on primary records), ensure archived records remain accessible via standard query APIs
    - _Requirements: 13.2, 13.3_
  - [ ]* 18.3 Write property test for audit trail completeness
    - **Property 15: Audit Trail Completeness** — for arbitrary service request state transitions, assert an immutable Event with previous state, new state, user, and millisecond-precision UTC timestamp exists after each transition; assert that if the Event INSERT fails the state transition is not committed
    - **Validates: Requirements 13.1, 13.6**

- [x] 19. Integration wiring and end-to-end validation
  - [x] 19.1 Wire all BullMQ workers to the Fastify application: ensure `timeline-update`, `sla-evaluate`, `alert-generate`, `realtime-broadcast`, `analytics-update`, and all scheduled jobs are registered and start on application boot
    - _Requirements: 3.1, 8.2_
  - [x] 19.2 Wire the circuit breaker for AI Engine external calls (OpenAI, ML microservice): half-open after 30 seconds; ensure all non-AI endpoints are completely unaffected when the circuit is open
    - _Requirements: 10.6, 11.6_
  - [x] 19.3 Write integration tests for the full event ingestion pipeline: submit event → confirm Timeline append within 2s → SLA evaluated → alert created (if applicable) → WebSocket push within 3s → analytics updated
    - _Requirements: 3.1, 4.4, 9.1_
  - [ ]* 19.4 Write integration tests for authentication flows: login → access protected endpoint → logout → confirm token invalidation
    - _Requirements: 1.1, 1.6, 1.7_
  - [ ]* 19.5 Write integration tests for archival: archive records, confirm accessibility via standard APIs
    - _Requirements: 13.2, 13.3_

- [x] 20. Final checkpoint — all systems wired
  - Ensure all unit, property, and integration tests pass.
  - Confirm Docker Compose environment starts cleanly and smoke tests pass (auth endpoints <500ms, WebSocket accepts connections, Redis Pub/Sub reachable, ML microservice health check passes, DB migrations applied).
  - Ask the user if any questions arise before delivering.

---

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- Property tests use **fast-check** (TypeScript/Node.js) and **Hypothesis** (Python ML service); each test is tagged `// Feature: dayliff-1000-eyes, Property N: <text>` with a minimum of 100 iterations
- Unit tests use **Vitest** (Node.js) and **pytest** (Python)
- Checkpoints ensure incremental validation before moving to the next phase
- The ML microservice and Node.js API service are developed in parallel (tasks 15–16 can start after task 2 schema is stable)
- RBAC is enforced at two layers: route middleware (task 4) and service-layer row-level scoping (applied in every service function)

---

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1"] },
    { "id": 1, "tasks": ["2.2", "3.1"] },
    { "id": 2, "tasks": ["3.2", "3.3", "4.1"] },
    { "id": 3, "tasks": ["4.2"] },
    { "id": 4, "tasks": ["4.3", "5.1"] },
    { "id": 5, "tasks": ["5.2", "6.1"] },
    { "id": 6, "tasks": ["6.2", "6.3", "6.4"] },
    { "id": 7, "tasks": ["7.1"] },
    { "id": 8, "tasks": ["7.2"] },
    { "id": 9, "tasks": ["7.3", "7.4", "9.1"] },
    { "id": 10, "tasks": ["9.2", "10.1"] },
    { "id": 11, "tasks": ["9.3", "10.2", "11.1"] },
    { "id": 12, "tasks": ["9.4", "10.3", "11.2"] },
    { "id": 13, "tasks": ["10.4", "11.3", "13.1", "14.1"] },
    { "id": 14, "tasks": ["13.2", "13.4", "14.2"] },
    { "id": 15, "tasks": ["13.3", "14.3", "15.1"] },
    { "id": 16, "tasks": ["13.5", "14.4", "15.2"] },
    { "id": 17, "tasks": ["15.3", "16.1", "17.1"] },
    { "id": 18, "tasks": ["15.4", "16.2", "17.2", "17.3", "17.4", "18.1"] },
    { "id": 19, "tasks": ["16.3", "18.2"] },
    { "id": 20, "tasks": ["18.3", "19.1", "19.2"] },
    { "id": 21, "tasks": ["19.3", "19.4", "19.5"] }
  ]
}
```
