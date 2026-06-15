# Requirements Document

## Introduction

Dayliff 1000 Eyes is an Enterprise Process Observability, Workflow Intelligence, and Operational Analytics Platform. It serves as a centralized observability layer that sits above existing business applications — including CRM systems, ERP platforms, engineering software, quotation systems, logistics systems, and customer support tools — integrating with them via APIs, webhooks, event streams, and manual inputs.

The platform reconstructs customer journeys end-to-end, monitors SLA compliance in real time, identifies bottlenecks, predicts delays using AI, and delivers actionable insights to decision-makers through role-based dashboards. The objective is to eliminate operational blind spots, improve departmental accountability, reduce delays, enhance customer experience, and provide predictive operational intelligence across the full lifecycle of a customer request.

---

## Glossary

- **Platform**: The Dayliff 1000 Eyes system as a whole.
- **Service_Request**: A customer-initiated request tracked through the platform (e.g., Borehole Design Request, Solar Installation Request).
- **Journey_Stage**: One of the defined lifecycle stages a Service_Request passes through: Inquiry, Sales Review, Engineering Design, Quotation, Approval, Dispatch, Delivery.
- **Event**: An immutable record of a meaningful business activity, containing Event ID, Request ID, Event Type, Timestamp, Department, User, Source System, and Metadata.
- **Event_Processor**: The component responsible for receiving, validating, normalizing, storing, and dispatching events.
- **Timeline**: The ordered sequence of Events reconstructed for a given Service_Request.
- **SLA_Rule**: A definition of the maximum acceptable processing time for a given Journey_Stage (e.g., Engineering Design: max 24 hours).
- **SLA_Monitor**: The component that evaluates stage durations against SLA_Rules and triggers alerts.
- **Alert**: A system-generated notification with severity level Info, Warning, or Critical, linked to an operational or SLA condition.
- **Analytics_Engine**: The component that computes KPIs, generates reports, and maintains analytics snapshots.
- **AI_Engine**: The component providing Level 1 predictive analytics and Level 2 natural language Operational Copilot capabilities.
- **Realtime_Broadcaster**: The component delivering live updates over WebSockets using Redis Pub/Sub.
- **RBAC**: Role-Based Access Control — the mechanism that enforces permissions per user role.
- **User_Role**: One of: Administrator, Regional Manager, Sales Engineer, Backend Designer, Logistics Officer.
- **Dashboard**: A role-specific UI module presenting KPIs, workflows, analytics, or AI insights.
- **External_System**: Any third-party application integrated with the Platform (CRM, ERP, Engineering Software, Quotation System, Logistics Platform).
- **JWT**: JSON Web Token — the authentication credential used to authorize API access.

---

## Requirements

### Requirement 1: User Authentication and Authorization

**User Story:** As a platform user, I want to securely log in and have my access controlled by my assigned role, so that I can only view and perform actions appropriate to my responsibilities.

#### Acceptance Criteria

1. WHEN a user submits valid credentials to `POST /auth/login`, THE Platform SHALL return a JWT access token with a 15-minute expiry and a refresh token with a 7-day expiry.
2. WHEN a user submits invalid credentials to `POST /auth/login`, THE Platform SHALL return an HTTP 401 response with an error message indicating that the credentials are incorrect.
3. WHEN a user submits a valid refresh token to `POST /auth/refresh`, THE Platform SHALL return a new JWT access token with a 15-minute expiry.
4. IF a user submits an expired refresh token to `POST /auth/refresh`, THEN THE Platform SHALL return an HTTP 401 response.
5. IF a user submits an invalid (malformed or tampered) refresh token to `POST /auth/refresh`, THEN THE Platform SHALL return an HTTP 401 response.
6. WHEN a user submits a valid JWT to `POST /auth/logout`, THE Platform SHALL invalidate the session such that any subsequent request using the invalidated JWT or its associated refresh token returns an HTTP 401 response.
7. IF a request is received by any API endpoint without a JWT, THEN THE Platform SHALL return an HTTP 401 response.
8. IF an authenticated user accesses an API endpoint for which their User_Role does not have permission, THEN THE Platform SHALL return an HTTP 403 response and SHALL NOT return any data.
9. THE Platform SHALL assign each authenticated user exactly one User_Role from the set: Administrator, Regional Manager, Sales Engineer, Backend Designer, Logistics Officer.

---

### Requirement 2: Service Request Management

**User Story:** As a sales engineer or administrator, I want to create and manage service requests, so that every customer request is formally tracked from inception through completion.

#### Acceptance Criteria

1. WHEN an authorized user submits a valid payload to `POST /requests`, THE Platform SHALL create a Service_Request, assign it a unique Request ID and Request Number, set its initial Journey_Stage to Inquiry, and return the created resource with HTTP 201.
2. WHEN a user submits an invalid or incomplete payload to `POST /requests`, THE Platform SHALL return an HTTP 422 response with field-level validation errors.
3. WHEN an authorized user calls `GET /requests/{id}` with a valid Request ID, THE Platform SHALL return the full Service_Request record including Current Stage, Current Status, Assigned Department, `created_at`, and `updated_at` timestamps.
4. WHEN an authorized user calls `GET /requests/{id}` with a non-existent Request ID, THE Platform SHALL return an HTTP 404 response.
5. WHEN an authorized user submits a valid patch payload to `PATCH /requests/{id}`, THE Platform SHALL update only the mutable Service_Request fields provided (excluding Request ID, Request Number, and Journey_Stage which are immutable via this endpoint), record the `updated_at` timestamp, and return the updated resource.
6. IF an authorized user submits an invalid or malformed payload to `PATCH /requests/{id}`, THEN THE Platform SHALL return an HTTP 422 response and SHALL NOT modify the Service_Request.
7. IF a user without the required permission attempts to access or modify a Service_Request endpoint, THEN THE Platform SHALL return an HTTP 403 response and SHALL NOT return or modify any data.
8. WHEN an authorized user calls `GET /requests`, THE Platform SHALL return a paginated list of Service_Requests filtered by the permissions of the requesting User_Role, with a default page size of 20 and a maximum page size of 100.

---

### Requirement 3: Event Ingestion and Processing Pipeline

**User Story:** As a system integrator, I want the platform to receive and process events from multiple source systems, so that every meaningful business activity is captured as an immutable record in real time.

#### Acceptance Criteria

1. WHEN a source system submits a valid event payload to `POST /events`, THE Event_Processor SHALL validate the payload, store the Event as an immutable record, update the associated Service_Request state, update the Timeline, evaluate SLA compliance, generate any triggered Alerts, broadcast the update via the Realtime_Broadcaster, and update analytics — all within 5 seconds of receiving the event.
2. WHEN a source system submits an event payload with missing required fields (Event ID, source system identifier, event type, Service_Request ID, or event timestamp) to `POST /events`, THE Event_Processor SHALL return an HTTP 422 response and SHALL NOT store the malformed event.
3. THE Event_Processor SHALL accept events from the following source types: CRM, ERP, Engineering Software, Quotation System, Logistics Platform, and Manual Input via the REST API.
4. THE Event_Processor SHALL normalize event payloads from External_Systems into the canonical Event schema before storage, ensuring all timestamps are in ISO 8601 UTC format, all canonical fields are populated, and no source-specific fields are persisted in the canonical record.
5. WHEN a duplicate event is received (same Event ID), THE Event_Processor SHALL return an HTTP 409 response and SHALL NOT create a duplicate record.
6. THE Platform SHALL store every accepted Event as an immutable record — no update or delete operation SHALL be permitted on stored Events.
7. WHEN an authorized user calls `GET /events`, THE Platform SHALL return a paginated list of Events filterable by Request ID, Department, Event Type, and date range, sorted by timestamp descending, with a default page size of 20 and a maximum page size of 100. IF no events match the filter, THE Platform SHALL return an empty list with HTTP 200.
8. IF any step in the processing pipeline (Timeline update, SLA evaluation, Alert generation, Broadcaster notification, or Analytics update) fails after the Event has been stored, THEN THE Platform SHALL retain the stored Event, mark the failed pipeline step as pending-retry, and return HTTP 202 to indicate the Event was accepted but pipeline processing is incomplete.

---

### Requirement 4: Customer Journey Reconstruction

**User Story:** As a regional manager or administrator, I want to view the reconstructed timeline of a customer request, so that I can trace every step of the journey from inquiry to delivery.

#### Acceptance Criteria

1. WHEN an authorized user calls `GET /timeline/{request_id}`, THE Platform SHALL return the ordered sequence of Events for that Service_Request, each enriched with Event Type, Timestamp, Department, User, and Source System. IF any enrichment field is not available for an Event, THE Platform SHALL return a null value for that field rather than omitting the field.
2. WHEN an authorized user calls `GET /timeline/{request_id}` for a non-existent Request ID, THE Platform SHALL return an HTTP 404 response.
3. WHEN a Timeline is returned in response to a `GET /timeline/{request_id}` call, THE Platform SHALL order Events in ascending chronological order of Event Timestamps. WHERE two Events share the same Timestamp, THE Platform SHALL order them by Event ID ascending as a tie-breaker.
4. WHEN a new Event is accepted for a Service_Request, THE Platform SHALL append the Event to that Service_Request's Timeline within 2 seconds of event acceptance.
5. THE Platform SHALL preserve the complete, unmodified Event history in the Timeline — no Event SHALL be removed from the Timeline once appended, and no field-level mutations SHALL be permitted on any appended Event record.

---

### Requirement 5: SLA Monitoring and Breach Detection

**User Story:** As an operations manager, I want the platform to automatically monitor SLA compliance for each stage of every request, so that breaches are detected immediately and stakeholders are alerted.

#### Acceptance Criteria

1. WHEN a Service_Request undergoes a state change, THE SLA_Monitor SHALL evaluate the elapsed duration of the active Journey_Stage — measured from the stage entry timestamp to the state change timestamp — against its corresponding SLA_Rule threshold.
2. WHEN the elapsed time for a Journey_Stage exceeds 80% of its SLA_Rule threshold and no active Warning-severity Alert already exists for that stage and request, THE SLA_Monitor SHALL generate a Warning-severity Alert.
3. WHEN the elapsed time for a Journey_Stage equals or exceeds its SLA_Rule threshold and no active Critical-severity Alert already exists for that stage and request, THE SLA_Monitor SHALL generate a Critical-severity Alert and record the SLA breach on the Service_Request.
4. WHEN an authorized user requests SLA compliance metrics for a time period between 1 and 365 calendar days inclusive, THE Platform SHALL return SLA Compliance Rate per department and per Journey_Stage for that period.
5. WHEN an SLA_Rule is updated by an Administrator, THE SLA_Monitor SHALL apply the new threshold to all Service_Requests whose current Journey_Stage is not in a terminal state (Completed or Cancelled).
6. IF no SLA_Rule exists for a Journey_Stage, THEN THE SLA_Monitor SHALL log an Info-severity Alert and SHALL NOT generate a breach score for that stage.
7. WHEN an authorized user requests SLA compliance metrics for a time period that contains no data, THE Platform SHALL return a 100% compliance rate with zero records processed rather than an error.

---

### Requirement 6: Alert Management

**User Story:** As an operations user, I want to receive, acknowledge, and resolve operational alerts, so that critical issues are tracked and actioned promptly.

#### Acceptance Criteria

1. THE Platform SHALL support four Alert types: Operational Alert, SLA Breach Alert, Critical Delay Alert, and Escalation Alert.
2. WHEN an Alert is generated, THE Platform SHALL deliver it to all users whose role permissions include that Alert's severity level, via the channels matching each user's configured notification preferences (Dashboard, Email, or SMS).
3. WHEN an Alert is generated, THE Platform SHALL set its lifecycle state to Created and broadcast it to all users with the appropriate role permissions via the Realtime_Broadcaster.
4. WHEN an authorized user acknowledges an Alert via `PATCH /alerts/{id}`, THE Platform SHALL update the Alert lifecycle state to Acknowledged and record the acknowledging user and timestamp. IF the user is not authorized or the Alert is not in the Created state, THE Platform SHALL return an HTTP 403 or HTTP 409 response respectively.
5. WHEN an authorized user resolves an Alert via `PATCH /alerts/{id}`, THE Platform SHALL update the Alert lifecycle state to Resolved and record the resolving user and timestamp. IF the user is not authorized or the Alert is not in the Acknowledged state, THE Platform SHALL return an HTTP 403 or HTTP 409 response respectively.
6. THE Platform SHALL transition Alert lifecycle states only in the order: Created → Acknowledged → Resolved → Archived.
7. IF a user attempts to transition an Alert to a state that does not follow the defined lifecycle order, THEN THE Platform SHALL return an HTTP 409 response with an error message indicating the invalid transition.
8. WHEN an authorized user calls `GET /alerts`, THE Platform SHALL return a paginated list of Alerts filterable by severity, type, lifecycle state, and date range, with a default page size of 20 and a maximum page size of 100.

---

### Requirement 7: Role-Based Dashboards

**User Story:** As a platform user, I want a dashboard tailored to my role, so that I see only the information and controls relevant to my responsibilities.

#### Acceptance Criteria

1. IF a user with the Administrator or Regional Manager role requests the Executive Dashboard, THEN THE Platform SHALL return KPI Overview, Active Request count, Critical Alert count, and SLA Compliance Rate scoped to that user's role visibility.
2. IF a user with the Sales Engineer, Backend Designer, or Logistics Officer role requests the Operations Dashboard, THEN THE Platform SHALL return Workflow Monitoring, Timeline Tracking, and Department Performance metrics scoped to that user's role visibility.
3. IF a user with the Administrator or Regional Manager role requests the Analytics Dashboard, THEN THE Platform SHALL return Trends, generated Reports, and AI Predictions scoped to that user's role visibility.
4. IF a user with the Administrator role requests the AI Dashboard, THEN THE Platform SHALL return Predictions, Risk Analysis, and Recommendations scoped to Administrator visibility.
5. WHEN an authenticated user calls `GET /dashboard/overview`, THE Platform SHALL return KPI data containing only records and aggregates accessible to the requesting user's User_Role, with no records outside that role's scope included in the response.
6. WHEN an authenticated user calls `GET /dashboard/bottlenecks`, THE Platform SHALL return up to 10 bottleneck stages ranked by average excess time beyond SLA_Rule thresholds, scoped to the requesting user's role visibility.
7. WHEN a request, alert, or workflow status change occurs, THE Platform SHALL push the updated dashboard data to all connected users for whom that change is visible within 5 seconds via the Realtime_Broadcaster. IF the Realtime_Broadcaster is unavailable, THE Platform SHALL display a stale-data indicator to affected users within 10 seconds.
8. IF a user requests a dashboard module for which their User_Role does not have permission, THEN THE Platform SHALL return an HTTP 403 response and SHALL NOT return any dashboard data.

---

### Requirement 8: Operational Analytics and Reporting

**User Story:** As a regional manager, I want to access operational analytics and scheduled reports, so that I can measure departmental performance and identify trends over time.

#### Acceptance Criteria

1. THE Analytics_Engine SHALL compute and expose the following KPIs: Average Completion Time, Average Department Processing Time, SLA Compliance Rate, Request Throughput, Delay Frequency, and Completion Rate.
2. WHEN a scheduled report interval elapses (Daily, Weekly, Monthly, or Quarterly), THE Analytics_Engine SHALL generate and persist a report snapshot for that interval.
3. WHEN an authorized user requests trend data for a time range between 1 and 366 days inclusive, THE Platform SHALL return request volume and SLA compliance trend data covering the specified range.
4. WHEN an authorized user requests department-level efficiency metrics, THE Platform SHALL return average processing time per department and bottleneck frequency, where bottleneck frequency is the count of departments whose average processing time exceeded that department's SLA threshold during the queried period.
5. THE Analytics_Engine SHALL persist analytics snapshots at each scheduled report interval and retain them for a minimum of 730 days from the date of creation so that historical data is available for trend analysis.
6. WHEN an authorized user requests a report for a time range that contains no data, THE Analytics_Engine SHALL return an empty result set with a success response rather than an error.
7. IF an authorized user requests trend or efficiency data for a time range exceeding 366 days, THEN THE Analytics_Engine SHALL reject the request with an error message indicating the maximum allowed range.

---

### Requirement 9: Real-Time Communication

**User Story:** As a dashboard user, I want live updates pushed to my screen without manual refresh, so that I always see the current state of requests, alerts, and analytics.

#### Acceptance Criteria

1. THE Realtime_Broadcaster SHALL maintain persistent WebSocket connections with connected clients and SHALL push updates within 3 seconds of any state change to relevant Service_Requests, Alerts, or Analytics snapshots.
2. WHEN a client's WebSocket connection is interrupted, THE Realtime_Broadcaster SHALL queue undelivered updates and deliver them upon reconnection within the same session.
3. THE Realtime_Broadcaster SHALL use Redis Pub/Sub as the message bus to fan out updates to all subscribed clients.
4. WHILE a user is connected via WebSocket, THE Realtime_Broadcaster SHALL push live Alert notifications to that user for all Alerts matching their User_Role permissions.
5. THE Platform SHALL support at least 500 concurrent WebSocket connections without degrading update delivery latency beyond 3 seconds.

---

### Requirement 10: AI-Powered Predictive Analytics (Level 1)

**User Story:** As an operations manager, I want the platform to predict delays, SLA breaches, and completion times for active requests, so that I can take preemptive action before problems escalate.

#### Acceptance Criteria

1. WHEN an authorized user requests a risk assessment for a Service_Request, THE AI_Engine SHALL return a risk score between 0.0 and 1.0, a descriptive risk label (Low, Medium, High, or Critical), and between 1 and 5 top contributing factors ranked by their influence on the score.
2. WHEN an authorized user requests a delay prediction for a Service_Request, THE AI_Engine SHALL return a predicted delay duration in hours between 0 and 8,760 and a confidence score between 0.0 and 1.0.
3. THE AI_Engine SHALL compute SLA Breach Predictions and Completion Time Predictions for all active Service_Requests and refresh these predictions at intervals not exceeding 60 minutes.
4. IF a prediction refresh cycle fails to complete, THEN THE AI_Engine SHALL retain the most recently computed predictions for affected Service_Requests and mark each prediction as stale, including the timestamp of the last successful computation.
5. WHEN the AI_Engine generates a High or Critical risk score for a Service_Request, THE Platform SHALL automatically create a Critical Delay Alert for that request containing the Service_Request ID, the risk score, the risk label, and the timestamp of the assessment.
6. IF the AI_Engine is unavailable or returns an error response, THEN THE Platform SHALL return a service-unavailable error for AI endpoints and SHALL continue to serve all non-AI endpoints with no degradation in their response time or functionality.

---

### Requirement 11: AI Operational Copilot (Level 2)

**User Story:** As an administrator or regional manager, I want to query platform data using natural language, so that I can get operational answers instantly without navigating multiple dashboards.

#### Acceptance Criteria

1. WHEN an authorized user submits a natural language query to `POST /ai/copilot`, THE AI_Engine SHALL return a structured response containing a human-readable `answer` field and a `data` field listing the source records or aggregates used to produce the answer.
2. WHEN an authorized user submits one of the following queries: "Show all delayed requests", "Which department causes the most delays?", or "What is today's SLA compliance?", THE AI_Engine SHALL return a response with a non-empty `answer` field and a populated `data` field.
3. IF the AI_Engine cannot interpret a submitted query, THEN THE Platform SHALL return an HTTP 200 response with an error message indicating the query was not understood, along with 1 to 3 suggested query reformulations.
4. THE AI_Engine SHALL scope all Copilot query results to records accessible to the requesting user's User_Role, with no records outside that role's permissions included in the `data` field.
5. WHEN an authorized user submits a query to `POST /ai/copilot` under normal load, THE AI_Engine SHALL return a response within 10 seconds.
6. IF the AI_Engine is unavailable, THEN THE Platform SHALL return an HTTP 503 response for Copilot requests and SHALL NOT affect the availability of non-AI platform features.

---

### Requirement 12: External System Integration

**User Story:** As a system administrator, I want the platform to integrate with existing business systems via REST APIs and webhooks, so that events are captured automatically without requiring manual data entry.

#### Acceptance Criteria

1. THE Event_Processor SHALL accept event submissions from External_Systems via REST API (`POST /events`) and webhook callbacks using a documented payload schema, and SHALL reject payloads exceeding 1 MB in size with an HTTP 413 response.
2. THE Platform SHALL validate the authenticity of webhook payloads using a shared secret or HMAC signature before processing. IF the signature is invalid or absent, THE Platform SHALL return an HTTP 401 response and SHALL NOT process the payload.
3. WHEN an External_System webhook delivery fails due to a Platform error, THE Event_Processor SHALL retry delivery up to 3 times using exponential backoff starting at 1 second and capped at 32 seconds. IF all retries fail, THE Event_Processor SHALL mark the event as failed and generate an Operational Alert.
4. THE Platform SHALL support scheduled synchronization with External_Systems at configurable intervals between 1 and 1440 minutes to reconcile any missed events.
5. WHERE an External_System uses a non-canonical data schema, THE Event_Processor SHALL apply a configured normalization mapping to transform the payload into the canonical Event schema before storage. IF the normalization mapping is missing or cannot produce a valid canonical Event, THE Event_Processor SHALL reject the payload with an HTTP 422 response and generate an Operational Alert.

---

### Requirement 13: Data Integrity and Audit Trail

**User Story:** As a compliance officer or administrator, I want every state change and event to be permanently recorded, so that I can audit the full history of any customer request.

#### Acceptance Criteria

1. THE Platform SHALL record an immutable Event for every state transition of a Service_Request, including the User who triggered the transition, the millisecond-precision UTC timestamp, and the previous and new state values.
2. THE Platform SHALL retain all Events, Timeline entries, Alerts, and authentication event logs indefinitely unless an Administrator explicitly initiates an archival operation.
3. WHEN an Administrator initiates data archival for records older than a specified date, THE Platform SHALL move those records to an archive partition and SHALL maintain their accessibility via the standard query APIs.
4. THE Platform SHALL prevent any modification or deletion of stored Events through all API endpoints. IF a modification or deletion is attempted, THE Platform SHALL return an HTTP 405 response.
5. THE Platform SHALL log all authentication events (login, logout, token refresh, failed attempts) with millisecond-precision UTC timestamp, user identifier, and IP address.
6. IF recording the state transition Event fails, THEN THE Platform SHALL block the state transition and return an error to the caller, ensuring no state change is persisted without a corresponding audit Event.
