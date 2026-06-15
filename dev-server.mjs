/**
 * Dayliff 1000 Eyes — Development Server
 *
 * Serves the static frontend AND a mock REST API on the same port.
 * The mock API is a faithful replica of the real Fastify backend — same URL
 * paths, same query-parameter names, same response envelopes.
 *
 * Run:  node dev-server.mjs
 * Open: http://localhost:4000
 *
 * Demo credentials
 *   admin@dayliff.com     / admin123   (Administrator)
 *   manager@dayliff.com   / manager123 (Regional Manager)
 *   engineer@dayliff.com  / engineer123 (Sales Engineer)
 */

import http from 'node:http';
import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHmac, randomUUID } from 'node:crypto';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const PORT  = 4000;

// ── MIME types ───────────────────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css' : 'text/css; charset=utf-8',
  '.js'  : 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.svg' : 'image/svg+xml',
  '.ico' : 'image/x-icon',
  '.png' : 'image/png',
};

// ── HTTP helpers ─────────────────────────────────────────────────────────────
function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-Signature-SHA256,X-Source-System');
}

/** Standard success envelope (matches real API) */
function ok(res, data, meta = null, status = 200) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true, data, meta, error: null }));
}

/** Standard error envelope (matches real API) */
function fail(res, status, message) {
  cors(res);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: false, data: null, meta: null, error: message }));
}

/** Parse JSON request body */
function body(req) {
  return new Promise(resolve => {
    let raw = '';
    req.on('data', c => (raw += c));
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')); } catch { resolve({}); } });
  });
}

/** Parse URL query string */
function qs(url) {
  return Object.fromEntries(new URL(url, 'http://x').searchParams.entries());
}

/** Paginate an array — returns { records, meta } matching real API */
function paginate(arr, q) {
  const page     = Math.max(1, parseInt(q.page     || '1',  10) || 1);
  const pageSize = Math.min(100, Math.max(1, parseInt(q.pageSize || '20', 10) || 20));
  const start    = (page - 1) * pageSize;
  return {
    records: arr.slice(start, start + pageSize),
    meta: { page, pageSize, total: arr.length },
  };
}

// ── Demo JWT (base64url, not real RS256 — browser will decode it fine) ───────
function makeToken(payload) {
  const hdr  = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig  = createHmac('sha256', 'dev-secret').update(`${hdr}.${body}`).digest('base64url');
  return `${hdr}.${body}.${sig}`;
}

function parseToken(tok) {
  try { return JSON.parse(Buffer.from(tok.split('.')[1], 'base64url').toString()); }
  catch { return null; }
}

function getUser(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  const c = parseToken(h.slice(7));
  if (!c || Date.now() / 1000 > c.exp) return null;
  return c;
}

// ── Seed helpers ──────────────────────────────────────────────────────────────
const NOW = Date.now();
const hAgo = h  => new Date(NOW - h  * 3_600_000).toISOString();
const dAgo = d  => hAgo(d * 24);
const hFwd = h  => new Date(NOW + h  * 3_600_000).toISOString();

// ── Users ─────────────────────────────────────────────────────────────────────
const USERS = [
  { id: 'u1', email: 'admin@dayliff.com',     password: 'admin123',    role: 'Administrator',    name: 'Alex Admin'     },
  { id: 'u2', email: 'manager@dayliff.com',   password: 'manager123',  role: 'Regional Manager', name: 'Maya Manager'   },
  { id: 'u3', email: 'engineer@dayliff.com',  password: 'engineer123', role: 'Sales Engineer',   name: 'Evan Engineer'  },
  { id: 'u4', email: 'designer@dayliff.com',  password: 'designer123', role: 'Backend Designer', name: 'Dana Designer'  },
  { id: 'u5', email: 'logistics@dayliff.com', password: 'logistics123',role: 'Logistics Officer', name: 'Leo Logistics' },
];

const refreshStore = new Map();  // rawToken → { userId, exp, revoked }

// ── Service Requests ──────────────────────────────────────────────────────────
const STAGES  = ['Inquiry','Sales Review','Engineering Design','Quotation','Approval','Dispatch','Delivery','Completed','Cancelled'];
const DEPTS   = ['Sales','Engineering','Logistics','Finance','Operations'];
const SOURCES = ['CRM','ERP','Engineering Software','Quotation System','Logistics Platform','Manual'];
const TYPES   = ['Borehole Design','Solar Installation','Pump Maintenance','Water Treatment','Site Survey'];
const CUSTOMERS = ['Nairobi Water','Kenya Power','KPLC','Safaricom','Equity Bank','KCB','Jubilee Insurance','NHIF','KenGen','TotalEnergies'];

const requests = Array.from({ length: 42 }, (_, i) => ({
  id: `req-${String(i+1).padStart(3,'0')}`,
  requestNumber: `SR-2025-${String(i+1).padStart(5,'0')}`,
  customerName: CUSTOMERS[i % CUSTOMERS.length],
  customerContact: `contact${i}@client.co.ke`,
  requestType: TYPES[i % TYPES.length],
  currentStage: STAGES[i % 9],
  currentStatus: STAGES[i % 9] === 'Completed' ? 'Closed' : STAGES[i % 9] === 'Cancelled' ? 'Cancelled' : 'Open',
  assignedDepartment: DEPTS[i % DEPTS.length],
  assignedUserId: USERS[i % 5].id,
  metadata: { priority: ['Low','Medium','High'][i % 3] },
  slaBreached: i % 6 === 0,
  createdAt: dAgo(40 - i * 0.8),
  updatedAt: hAgo(i * 2 + 1),
}));

// ── Events ────────────────────────────────────────────────────────────────────
const EVENT_TYPES = ['stage_change','status_update','sla_warning','assignment_changed','note_added','document_uploaded'];
const events = [];
requests.forEach((r, ri) => {
  const n = 2 + (ri % 5);
  for (let ei = 0; ei < n; ei++) {
    events.push({
      id: randomUUID(),
      requestId: r.id,
      eventType: EVENT_TYPES[ei % EVENT_TYPES.length],
      sourceSystem: SOURCES[ri % SOURCES.length],
      department: r.assignedDepartment,
      triggeredByUser: USERS[ri % 5].id,
      previousState: STAGES[Math.max(0, ei - 1)],
      newState: STAGES[ei % 9],
      metadata: {},
      occurredAt: hAgo(ri * 3 + ei * 0.6),
      receivedAt: hAgo(ri * 3 + ei * 0.6 - 0.01),
      pipelineStatus: ei % 9 === 0 ? 'partial' : 'complete',
      failedSteps: ei % 9 === 0 ? ['analytics-update'] : [],
    });
  }
});

// ── Alerts ────────────────────────────────────────────────────────────────────
const alerts = [
  ...Array.from({ length: 7 }, (_, i) => ({
    id: `alert-sla-${i+1}`,
    requestId: requests[i].id,
    alertType: 'SLA Breach Alert',
    severity: 'Critical',
    lifecycleState: ['Created','Acknowledged','Resolved'][i % 3],
    message: `SLA threshold exceeded in ${STAGES[i % 7]} for ${requests[i].requestNumber} — elapsed ${26+i*4}h vs ${20+i*2}h limit`,
    metadata: { stage: STAGES[i % 7], elapsedHours: 26+i*4 },
    createdAt: hAgo(i*3+2),
    acknowledgedBy: i>0 ? 'u2' : null, acknowledgedAt: i>0 ? hAgo(i*3+1) : null,
    resolvedBy: i>1 ? 'u1' : null, resolvedAt: i>1 ? hAgo(i*3) : null,
    archivedAt: null,
  })),
  ...Array.from({ length: 9 }, (_, i) => ({
    id: `alert-ops-${i+1}`,
    requestId: requests[i+7].id,
    alertType: 'Operational Alert',
    severity: ['Warning','Info','Critical'][i % 3],
    lifecycleState: 'Created',
    message: `Pipeline processing delay on ${requests[i+7].requestNumber} — ${DEPTS[i % 5]} queue backlog exceeds threshold`,
    metadata: {},
    createdAt: hAgo(i*1.5),
    acknowledgedBy: null, acknowledgedAt: null,
    resolvedBy: null, resolvedAt: null, archivedAt: null,
  })),
  ...Array.from({ length: 5 }, (_, i) => ({
    id: `alert-ai-${i+1}`,
    requestId: requests[i+16].id,
    alertType: 'Critical Delay Alert',
    severity: 'Critical',
    lifecycleState: i%2===0 ? 'Created' : 'Acknowledged',
    message: `AI predicts ${22+i*9}h delay for ${requests[i+16].requestNumber} — risk score ${(0.75+i*0.05).toFixed(2)}`,
    metadata: { riskScore: 0.75+i*0.05 },
    createdAt: hAgo(i*0.8),
    acknowledgedBy: i%2===1 ? 'u1' : null, acknowledgedAt: i%2===1 ? hAgo(0.4) : null,
    resolvedBy: null, resolvedAt: null, archivedAt: null,
  })),
];

// ── SLA Rules ─────────────────────────────────────────────────────────────────
const slaRules = [
  { id: 'sla-1', journeyStage:'Inquiry',            thresholdHours: 4,  description:'Initial response SLA',    createdAt:dAgo(90), updatedAt:dAgo(10) },
  { id: 'sla-2', journeyStage:'Sales Review',       thresholdHours: 24, description:'Sales team review window', createdAt:dAgo(90), updatedAt:dAgo(10) },
  { id: 'sla-3', journeyStage:'Engineering Design', thresholdHours: 48, description:'Technical design SLA',     createdAt:dAgo(90), updatedAt:dAgo(10) },
  { id: 'sla-4', journeyStage:'Quotation',          thresholdHours: 12, description:'Quotation issuance SLA',   createdAt:dAgo(90), updatedAt:dAgo(10) },
  { id: 'sla-5', journeyStage:'Approval',           thresholdHours: 8,  description:'Internal approval SLA',    createdAt:dAgo(90), updatedAt:dAgo(10) },
  { id: 'sla-6', journeyStage:'Dispatch',           thresholdHours: 6,  description:'Dispatch confirmation SLA',createdAt:dAgo(90), updatedAt:dAgo(10) },
  { id: 'sla-7', journeyStage:'Delivery',           thresholdHours: 72, description:'On-site delivery SLA',     createdAt:dAgo(90), updatedAt:dAgo(10) },
];

// ── AI Predictions ─────────────────────────────────────────────────────────────
const aiPredictions = new Map(requests.slice(0,22).map((r,i) => [r.id, {
  id: randomUUID(),
  requestId: r.id,
  riskScore: +(0.05 + (i/22)*0.92).toFixed(3),
  riskLabel: i<6 ? 'Low' : i<11 ? 'Medium' : i<17 ? 'High' : 'Critical',
  contributingFactors: [
    { factor:'Stage elapsed time',        influence:0.42 },
    { factor:'Department backlog',         influence:0.28 },
    { factor:'Historical avg deviation',   influence:0.18 },
    { factor:'SLA warning count',          influence:0.08 },
    { factor:'Day of week',                influence:0.04 },
  ].slice(0, 2+(i%4)),
  predictedDelayHours: +(i*2.7).toFixed(1),
  delayConfidence: +(0.50 + (i/22)*0.45).toFixed(3),
  predictedCompletionAt: hFwd(24+i*3),
  isStale: i===0,
  lastComputedAt: hAgo(i%60),
  createdAt: dAgo(1),
}]));

// ── Router ───────────────────────────────────────────────────────────────────
const routes = [];
const route = (method, pattern, fn) =>
  routes.push({ method: method.toUpperCase(),
    re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/?]+)') + '(?:\\?.*)?$'),
    fn });

// ─────────────────────────────────────────────────────────────────────────────
// AUTH ROUTES — match real Fastify paths exactly
// ─────────────────────────────────────────────────────────────────────────────
route('POST', '/auth/login', async (req, res) => {
  const b    = await body(req);
  const user = USERS.find(u => u.email === b.email && u.password === b.password);
  if (!user) return fail(res, 401, 'Invalid credentials');
  const now = Math.floor(Date.now()/1000);
  const jti = randomUUID();
  const accessToken  = makeToken({ sub:user.id, role:user.role, email:user.email, jti, iat:now, exp:now+900 });
  const refreshToken = randomUUID();
  refreshStore.set(refreshToken, { userId:user.id, exp:now+604800, revoked:false });
  ok(res, { accessToken, refreshToken, expiresIn:900, tokenType:'Bearer' });
});

route('POST', '/auth/refresh', async (req, res) => {
  const b = await body(req);
  const s = refreshStore.get(b.refreshToken);
  if (!s || s.revoked || Date.now()/1000 > s.exp) return fail(res,401,'Invalid or expired refresh token');
  const user = USERS.find(u => u.id === s.userId);
  if (!user) return fail(res,401,'User not found');
  const now = Math.floor(Date.now()/1000);
  const accessToken = makeToken({ sub:user.id, role:user.role, email:user.email, jti:randomUUID(), iat:now, exp:now+900 });
  ok(res, { accessToken, expiresIn:900, tokenType:'Bearer' });
});

route('POST', '/auth/logout', async (req, res) => {
  const b = await body(req);
  const s = refreshStore.get(b.refreshToken);
  if (s) s.revoked = true;
  ok(res, null);
});

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD ROUTES
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/dashboard/overview', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  ok(res, {
    kpis: {
      avgCompletionTimeHours: 58.4,
      avgDepartmentProcessingTime: { Sales:18.2, Engineering:44.7, Logistics:12.1, Finance:8.3, Operations:22.5 },
      slaComplianceRate: 0.837,
      requestThroughput: 4.2,
      delayFrequency: 7,
      completionRate: 0.694,
    },
    isStale: false,
    computedAt: new Date().toISOString(),
  });
});

route('GET', '/dashboard/bottlenecks', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const u = getUser(req);
  if (!['Administrator','Regional Manager'].includes(u.role)) return fail(res, 403, 'Forbidden');
  ok(res, [
    { journeyStage:'Engineering Design', department:'Engineering', avgExcessHours:23.4, occurrenceCount:12, rank:1 },
    { journeyStage:'Approval',           department:'Finance',     avgExcessHours:14.2, occurrenceCount:9,  rank:2 },
    { journeyStage:'Quotation',          department:'Sales',       avgExcessHours:8.7,  occurrenceCount:7,  rank:3 },
    { journeyStage:'Sales Review',       department:'Sales',       avgExcessHours:5.1,  occurrenceCount:5,  rank:4 },
    { journeyStage:'Dispatch',           department:'Logistics',   avgExcessHours:2.9,  occurrenceCount:4,  rank:5 },
  ], { total: 5 });
});

// ─────────────────────────────────────────────────────────────────────────────
// SERVICE REQUESTS
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/requests', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const q = qs(req.url);
  const { records, meta } = paginate(requests, q);
  ok(res, records, meta);
});

route('GET', '/requests/:id', (req, res, p) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const r = requests.find(x => x.id === p.id || x.requestNumber === p.id);
  if (!r) return fail(res, 404, 'Not found');
  ok(res, r);
});

route('POST', '/requests', async (req, res) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (!['Administrator','Sales Engineer'].includes(u.role)) return fail(res, 403, 'Forbidden');
  const b = await body(req);
  if (!b.customerName) return fail(res, 422, 'customerName is required');
  if (!b.requestType)  return fail(res, 422, 'requestType is required');
  const now = new Date().toISOString();
  const seq = requests.length + 1;
  const r = {
    id: `req-${String(seq).padStart(3,'0')}`,
    requestNumber: `SR-${new Date().getFullYear()}-${String(seq).padStart(5,'0')}`,
    customerName: b.customerName, customerContact: b.customerContact || null,
    requestType: b.requestType, currentStage: 'Inquiry', currentStatus: 'Open',
    assignedDepartment: b.assignedDepartment || null, assignedUserId: u.sub,
    metadata: b.metadata || {}, slaBreached: false, createdAt: now, updatedAt: now,
  };
  requests.push(r);
  ok(res, r, null, 201);
});

route('PATCH', '/requests/:id', async (req, res, p) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  const r = requests.find(x => x.id === p.id);
  if (!r) return fail(res, 404, 'Not found');
  const b = await body(req);
  // Immutable fields silently dropped (matches real API)
  delete b.id; delete b.requestNumber; delete b.currentStage;
  Object.assign(r, b, { updatedAt: new Date().toISOString() });
  ok(res, r);
});

// ─────────────────────────────────────────────────────────────────────────────
// EVENTS
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/events', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const q = qs(req.url);
  let list = [...events];
  if (q.requestId) list = list.filter(e => e.requestId === q.requestId);
  if (q.department) list = list.filter(e => e.department === q.department);
  if (q.eventType)  list = list.filter(e => e.eventType  === q.eventType);
  if (q.from) list = list.filter(e => new Date(e.occurredAt) >= new Date(q.from));
  if (q.to)   list = list.filter(e => new Date(e.occurredAt) <= new Date(q.to));
  list.sort((a,b) => new Date(b.occurredAt) - new Date(a.occurredAt));
  const { records, meta } = paginate(list, q);
  ok(res, records, meta);
});

route('POST', '/events', async (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const b = await body(req);
  if (!b.eventId || !b.requestId || !b.eventType)
    return fail(res, 422, 'eventId, requestId, and eventType are required');
  if (events.find(e => e.id === b.eventId)) return fail(res, 409, 'Duplicate event ID');
  const evt = { id:b.eventId, ...b, occurredAt:b.occurredAt||new Date().toISOString(), pipelineStatus:'complete', failedSteps:[] };
  events.push(evt);
  ok(res, { eventId:evt.id, requestId:evt.requestId, pipelineStatus:'complete', failedSteps:[], receivedAt:new Date().toISOString() }, null, 202);
});

// ─────────────────────────────────────────────────────────────────────────────
// TIMELINE  — GET /timeline/:requestId
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/timeline/:requestId', (req, res, p) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  // Accept both UUID and requestNumber
  const r = requests.find(x => x.id === p.requestId || x.requestNumber === p.requestId);
  if (!r) return fail(res, 404, 'Service request not found');
  const entries = events
    .filter(e => e.requestId === r.id)
    .sort((a,b) => {
      const dt = new Date(a.occurredAt) - new Date(b.occurredAt);
      return dt !== 0 ? dt : a.id.localeCompare(b.id);
    })
    .map((e,i) => ({
      ...e,
      position: i+1,
      triggeredByUser: USERS.find(u => u.id === e.triggeredByUser)?.name || null,
    }));
  ok(res, entries, { total: entries.length });
});

// ─────────────────────────────────────────────────────────────────────────────
// SLA ROUTES — match real routes exactly
// GET  /sla/compliance?from=ISO&to=ISO
// GET  /sla/rules
// PUT  /sla/rules/:stage
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/sla/compliance', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const q = qs(req.url);
  // Real API requires from/to ISO datetime params
  const from = q.from ? new Date(q.from) : new Date(Date.now() - 30*86400000);
  const to   = q.to   ? new Date(q.to)   : new Date();
  const diffDays = (to - from) / 86400000;
  if (diffDays < 1)   return fail(res, 422, 'Period must be at least 1 calendar day');
  if (diffDays > 365) return fail(res, 422, 'Period must not exceed 365 calendar days');

  // byDepartment and byStage are plain objects (Record<string, number>) matching real API
  const byDepartment = {};
  DEPTS.forEach(d => { byDepartment[d] = +(0.62 + Math.random()*0.36).toFixed(3); });
  const byStage = {};
  slaRules.forEach(r => { byStage[r.journeyStage] = +(0.55 + Math.random()*0.44).toFixed(3); });

  ok(res, {
    byDepartment,
    byStage,
    overallComplianceRate: 0.837,
    recordsProcessed: 124,
  }, { from: from.toISOString(), to: to.toISOString() });
});

route('GET', '/sla/rules', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  ok(res, slaRules);
});

route('PUT', '/sla/rules/:stage', async (req, res, p) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (u.role !== 'Administrator') return fail(res, 403, 'Administrator only');
  const rule = slaRules.find(r => r.journeyStage === p.stage);
  if (!rule) return fail(res, 404, 'Rule not found');
  const b = await body(req);
  if (b.thresholdHours) rule.thresholdHours = b.thresholdHours;
  if (b.description)    rule.description    = b.description;
  rule.updatedAt = new Date().toISOString();
  ok(res, rule);
});

// ─────────────────────────────────────────────────────────────────────────────
// ALERTS
// GET  /alerts?severity=&lifecycleState=&alertType=&from=&to=&page=&pageSize=
// PATCH /alerts/:id   body: { action: 'acknowledge'|'resolve'|'archive' }
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/alerts', (req, res) => {
  if (!getUser(req)) return fail(res, 401, 'Unauthorized');
  const q = qs(req.url);
  let list = [...alerts];
  if (q.severity)       list = list.filter(a => a.severity       === q.severity);
  if (q.alertType)      list = list.filter(a => a.alertType      === q.alertType);
  if (q.lifecycleState) list = list.filter(a => a.lifecycleState === q.lifecycleState);
  if (q.from) list = list.filter(a => new Date(a.createdAt) >= new Date(q.from));
  if (q.to)   list = list.filter(a => new Date(a.createdAt) <= new Date(q.to));
  list.sort((a,b) => new Date(b.createdAt) - new Date(a.createdAt));
  const { records, meta } = paginate(list, q);
  ok(res, records, meta);
});

route('PATCH', '/alerts/:id', async (req, res, p) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  const alert = alerts.find(a => a.id === p.id);
  if (!alert) return fail(res, 404, 'Not found');
  const b = await body(req);
  // Real API uses body: { action: 'acknowledge'|'resolve'|'archive' }
  const transitions = { Created:'Acknowledged', Acknowledged:'Resolved', Resolved:'Archived' };
  const actionMap   = { acknowledge:'Acknowledged', resolve:'Resolved', archive:'Archived' };
  const target = actionMap[b.action] || b.lifecycleState || b.action;
  if (transitions[alert.lifecycleState] !== target)
    return fail(res, 409, `Invalid transition: '${alert.lifecycleState}' → '${target}'. Allowed: '${transitions[alert.lifecycleState]}'`);
  alert.lifecycleState = target;
  if (target==='Acknowledged') { alert.acknowledgedBy=u.sub; alert.acknowledgedAt=new Date().toISOString(); }
  if (target==='Resolved')     { alert.resolvedBy=u.sub;     alert.resolvedAt=new Date().toISOString(); }
  if (target==='Archived')     { alert.archivedAt=new Date().toISOString(); }
  ok(res, alert);
});

// ─────────────────────────────────────────────────────────────────────────────
// ANALYTICS — match real route signatures exactly
// GET /analytics/trends?from=ISO&to=ISO
// GET /analytics/departments?from=ISO&to=ISO
// GET /analytics/reports?page=&pageSize=
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/analytics/trends', (req, res) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (!['Administrator','Regional Manager'].includes(u.role)) return fail(res, 403, 'Forbidden');
  const q = qs(req.url);
  if (!q.from || !q.to) return fail(res, 422, 'from and to are required ISO datetime params');
  const from = new Date(q.from);
  const to   = new Date(q.to);
  if (isNaN(from) || isNaN(to)) return fail(res, 422, 'from and to must be valid ISO datetimes');
  const diffDays = Math.ceil((to - from) / 86400000);
  if (diffDays < 1)   return fail(res, 422, 'Range must be at least 1 day');
  if (diffDays > 366) return fail(res, 422, 'Trend range must be between 1 and 366 days');

  // Generate day-by-day points matching real TrendData shape: { requestVolume[], slaComplianceRate[], periodStart, periodEnd }
  const requestVolume = [];
  const slaComplianceRate = [];
  for (let d = 0; d < Math.min(diffDays, 120); d++) {
    const ts = new Date(from.getTime() + d*86400000).toISOString().slice(0,10);
    requestVolume.push({ timestamp: ts, value: Math.round(2 + Math.sin(d/3)*2 + Math.random()*3 + (d>20?(d-20)*0.3:0)) });
    slaComplianceRate.push({ timestamp: ts, value: +(0.70 + Math.sin(d/5)*0.14 + Math.random()*0.04).toFixed(3) });
  }
  ok(res, { requestVolume, slaComplianceRate, periodStart: from.toISOString(), periodEnd: to.toISOString() });
});

route('GET', '/analytics/departments', (req, res) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (!['Administrator','Regional Manager'].includes(u.role)) return fail(res, 403, 'Forbidden');
  // Returns DepartmentMetrics[] matching real interface
  ok(res, DEPTS.map(d => ({
    department: d,
    avgProcessingTimeHours: +(8 + Math.random()*42).toFixed(1),
    bottleneckFrequency: Math.round(Math.random()*5),
    slaComplianceRate: +(0.62 + Math.random()*0.36).toFixed(3),
  })));
});

route('GET', '/analytics/reports', (req, res) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (!['Administrator','Regional Manager'].includes(u.role)) return fail(res, 403, 'Forbidden');
  const q = qs(req.url);
  const { records, meta } = paginate(Array.from({length:18},(_,i)=>({
    id: randomUUID(),
    snapshotType: ['Daily','Weekly','Monthly','Quarterly'][i%4],
    periodStart: dAgo(30-i*1.5),
    periodEnd:   dAgo(29-i*1.5),
    kpiKey: ['sla_compliance_rate','avg_completion_time','request_throughput','completion_rate'][i%4],
    kpiValue: +(0.65+Math.random()*0.32).toFixed(4),
    createdAt: dAgo(30-i*1.5),
  })), q);
  ok(res, records, meta);
});

// ─────────────────────────────────────────────────────────────────────────────
// AI — GET /ai/predictions/:requestId  POST /ai/copilot
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/ai/predictions/:requestId', (req, res, p) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (!['Administrator','Regional Manager'].includes(u.role)) return fail(res, 403, 'Forbidden');
  const pred = aiPredictions.get(p.requestId);
  if (!pred) return fail(res, 404, 'No prediction available for this request');
  ok(res, pred);
});

route('POST', '/ai/copilot', async (req, res) => {
  const u = getUser(req);
  if (!u) return fail(res, 401, 'Unauthorized');
  if (!['Administrator','Regional Manager'].includes(u.role)) return fail(res, 403, 'Forbidden');
  const b = await body(req);
  if (!b.query || !b.query.trim()) return fail(res, 422, 'Query is required');
  const query = b.query.toLowerCase();

  await new Promise(r => setTimeout(r, 600 + Math.random()*500));

  if (query.includes('delayed') || query.includes('delay') || query.includes('behind')) {
    const delayed = requests.filter(r => r.slaBreached);
    return ok(res, {
      answer: `Found ${delayed.length} requests with SLA breaches. Engineering Design is the primary bottleneck, averaging 23.4 hours over the SLA threshold. Recommend reviewing resource allocation in Engineering.`,
      data: delayed.slice(0,6).map(r => ({ requestNumber:r.requestNumber, stage:r.currentStage, customer:r.customerName, slaBreached:r.slaBreached, updatedAt:r.updatedAt })),
      sourceQuery: "SELECT * FROM service_requests WHERE sla_breached = TRUE ORDER BY updated_at DESC",
    });
  }
  if (query.includes('department') || query.includes('bottleneck') || query.includes('causes')) {
    return ok(res, {
      answer: 'Engineering Design is the primary operational bottleneck with +23.4h average excess over SLA. Finance (Approval stage, +14.2h) is second. Consider redistributing Engineering workload or extending SLA thresholds for complex borehole design requests.',
      data: [
        { department:'Engineering', avgExcessHours:23.4, activeRequests:12, breachRate:'68%' },
        { department:'Finance',     avgExcessHours:14.2, activeRequests:9,  breachRate:'41%' },
        { department:'Sales',       avgExcessHours:5.1,  activeRequests:7,  breachRate:'22%' },
      ],
      sourceQuery: "SELECT department, AVG(elapsed_hours - threshold_hours) AS avg_excess FROM sla_evaluations GROUP BY department ORDER BY avg_excess DESC",
    });
  }
  if (query.includes('sla') || query.includes('compliance')) {
    return ok(res, {
      answer: `Current overall SLA compliance: 83.7%. Best performing: Inquiry (95.2%), Dispatch (91.4%). Needs attention: Engineering Design (62.1%), Approval (74.3%). Trend: slight improvement over last 7 days (+2.1 percentage points).`,
      data: slaRules.map(r => ({
        stage: r.journeyStage,
        thresholdHours: r.thresholdHours,
        compliance: `${(55+Math.random()*42).toFixed(1)}%`,
        breachedCount: Math.round(Math.random()*8),
      })),
      sourceQuery: "SELECT journey_stage, COUNT(*) FILTER(WHERE NOT sla_breached)/COUNT(*)::float AS rate FROM service_requests GROUP BY journey_stage",
    });
  }
  if (query.includes('critical') || query.includes('urgent') || query.includes('risk')) {
    const crit = alerts.filter(a => a.severity==='Critical' && a.lifecycleState==='Created');
    return ok(res, {
      answer: `${crit.length} unacknowledged Critical alerts require immediate attention. ${crit.filter(a=>a.alertType==='SLA Breach Alert').length} are SLA Breach Alerts, ${crit.filter(a=>a.alertType==='Critical Delay Alert').length} are AI-predicted Critical Delay Alerts.`,
      data: crit.slice(0,5).map(a => ({ alertType:a.alertType, message:a.message.slice(0,80), request:a.requestId, created:a.createdAt })),
      sourceQuery: "SELECT * FROM alerts WHERE severity='Critical' AND lifecycle_state='Created' ORDER BY created_at DESC",
    });
  }
  // Unrecognised query — return suggestedReformulations (Req 11.3)
  return ok(res, {
    answer: "I wasn't able to interpret that query. Here are some queries I can answer:",
    data: [],
    sourceQuery: null,
    suggestedReformulations: [
      'Show all delayed requests',
      'Which department causes the most delays?',
      "What is today's SLA compliance?",
    ],
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HEALTH
// ─────────────────────────────────────────────────────────────────────────────
route('GET', '/health', (req, res) => ok(res, { status:'ok', timestamp:new Date().toISOString(), mode:'demo' }));

// ─────────────────────────────────────────────────────────────────────────────
// STATIC FILE SERVER
// ─────────────────────────────────────────────────────────────────────────────
function serveFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  try {
    const content = fs.readFileSync(filePath);
    cors(res);
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('404 Not Found: ' + filePath);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP SERVER
// ─────────────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  const urlPath = new URL(req.url, 'http://x').pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') { cors(res); res.writeHead(204); return res.end(); }

  // API routes — try each registered route
  for (const r of routes) {
    if (r.method !== req.method) continue;
    const m = urlPath.match(r.re);
    if (m) { r.fn(req, res, m.groups || {}); return; }
  }

  // Static files
  if (req.method !== 'GET') { fail(res, 405, 'Method Not Allowed'); return; }

  if (urlPath === '/' || urlPath === '/index.html') return serveFile(res, path.join(__dir, 'Html', 'index.html'));
  if (urlPath.startsWith('/Css/')) return serveFile(res, path.join(__dir, urlPath.slice(1)));
  if (urlPath.startsWith('/JS/'))  return serveFile(res, path.join(__dir, urlPath.slice(1)));

  // SPA fallback
  serveFile(res, path.join(__dir, 'Html', 'index.html'));
});

server.listen(PORT, () => {
  console.log('');
  console.log('  ╔══════════════════════════════════════════════════════════╗');
  console.log('  ║      Dayliff 1000 Eyes  ·  Development Server           ║');
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log(`  ║  🌐  Open   →   http://localhost:${PORT}                   ║`);
  console.log('  ╠══════════════════════════════════════════════════════════╣');
  console.log('  ║  admin@dayliff.com      /  admin123   (Administrator)   ║');
  console.log('  ║  manager@dayliff.com    /  manager123 (Regional Mgr)    ║');
  console.log('  ║  engineer@dayliff.com   /  engineer123 (Sales Eng.)     ║');
  console.log('  ╚══════════════════════════════════════════════════════════╝');
  console.log('');
});
