/**
 * Dayliff 1000 Eyes — Frontend Application
 * API contracts aligned to the real Fastify backend.
 * Design palette: Black · White · Cyan (#00E5FF)
 */

// ── Config ────────────────────────────────────────────────────────────────────
// Same-origin — dev-server.mjs serves both static files and the API
const API = '';

// ── State ─────────────────────────────────────────────────────────────────────
const S = {
  accessToken:  null,
  refreshToken: null,
  user:         null,   // { userId, role, email }
  view:         'dashboard',
  ws:           null,
  wsTimer:      null,
  pages:        { requests: 1, events: 1, alerts: 1 },
};

// ── DOM helpers ───────────────────────────────────────────────────────────────
const $  = (sel, ctx = document) => ctx.querySelector(sel);
const $$ = (sel, ctx = document) => [...ctx.querySelectorAll(sel)];

function el(tag, cls, html) {
  const e = document.createElement(tag);
  if (cls)  e.className = cls;
  if (html !== undefined) e.innerHTML = html;
  return e;
}

// ── Formatters ────────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
}
function fmtDateShort(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtHours(h) {
  if (h == null || isNaN(h)) return '—';
  if (h < 1)  return `${Math.round(h * 60)}m`;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}
function trunc(s, n = 65) {
  if (!s) return '—';
  return String(s).length > n ? String(s).slice(0, n) + '…' : String(s);
}
function escHtml(s) {
  return String(s ?? '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Stage/severity → badge CSS class
function stageCls(stage) {
  return ({
    'Inquiry':'badge-stage-inquiry', 'Sales Review':'badge-stage-sales',
    'Engineering Design':'badge-stage-engineering', 'Quotation':'badge-stage-quotation',
    'Approval':'badge-stage-approval', 'Dispatch':'badge-stage-dispatch',
    'Delivery':'badge-stage-delivery', 'Completed':'badge-stage-completed',
    'Cancelled':'badge-stage-cancelled',
  })[stage] || 'badge-neutral';
}
function sevCls(s)  { return ({Critical:'badge-critical',Warning:'badge-warning',Info:'badge-info'})[s]||'badge-neutral'; }
function lcCls(s)   { return ({Created:'badge-info',Acknowledged:'badge-warning',Resolved:'badge-success',Archived:'badge-neutral'})[s]||'badge-neutral'; }

// ── Toast ─────────────────────────────────────────────────────────────────────
function toast(msg, type = 'info', ms = 3800) {
  const c = $('#toast-container');
  const t = el('div', `toast toast--${type}`);
  t.innerHTML = `<span class="toast-dot"></span><span>${escHtml(msg)}</span>`;
  c.appendChild(t);
  setTimeout(() => {
    t.classList.add('fade-out');
    t.addEventListener('animationend', () => t.remove(), { once: true });
  }, ms);
}

// ── API client ────────────────────────────────────────────────────────────────
async function api(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (S.accessToken) headers['Authorization'] = `Bearer ${S.accessToken}`;

  let res = await fetch(`${API}${path}`, { ...opts, headers });

  // Auto-refresh on 401 (not for auth endpoints)
  if (res.status === 401 && S.refreshToken && !path.includes('/auth/')) {
    const ok = await doRefresh();
    if (ok) {
      headers['Authorization'] = `Bearer ${S.accessToken}`;
      res = await fetch(`${API}${path}`, { ...opts, headers });
    } else {
      doLogout();
      return null;
    }
  }

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try { const j = await res.clone().json(); msg = j.error || msg; } catch {}
    throw new Error(msg);
  }
  if (res.status === 204) return null;
  return res.json();
}

async function doRefresh() {
  try {
    const res = await fetch(`${API}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken: S.refreshToken }),
    });
    if (!res.ok) return false;
    const j = await res.json();
    S.accessToken = j.data.accessToken;
    return true;
  } catch { return false; }
}

// ── Auth ──────────────────────────────────────────────────────────────────────
function parseJwt(tok) {
  try { return JSON.parse(atob(tok.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))); }
  catch { return {}; }
}

async function doLogout() {
  if (S.accessToken && S.refreshToken) {
    try {
      await fetch(`${API}/auth/logout`, {
        method: 'POST',
        headers: { 'Content-Type':'application/json', Authorization:`Bearer ${S.accessToken}` },
        body: JSON.stringify({ refreshToken: S.refreshToken }),
      });
    } catch {}
  }
  S.accessToken = S.refreshToken = S.user = null;
  disconnectWs();
  showScreen('login-screen');
}

// ── Screen switching ──────────────────────────────────────────────────────────
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $(`#${id}`).classList.add('active');
}

// ── Login ─────────────────────────────────────────────────────────────────────
function initLogin() {
  const form  = $('#login-form');
  const email = $('#email');
  const pass  = $('#password');
  const errEl = $('#login-error');
  const btn   = $('#login-btn');

  $('#pwd-toggle').addEventListener('click', () => {
    pass.type = pass.type === 'password' ? 'text' : 'password';
  });

  form.addEventListener('submit', async e => {
    e.preventDefault();
    errEl.textContent = '';
    btn.disabled = true;
    btn.querySelector('.btn-text').hidden  = true;
    btn.querySelector('.btn-spinner').hidden = false;

    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.value.trim(), password: pass.value }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Login failed');

      S.accessToken  = j.data.accessToken;
      S.refreshToken = j.data.refreshToken;
      const claims   = parseJwt(j.data.accessToken);
      S.user = { userId: claims.sub, role: claims.role, email: email.value.trim() };

      showScreen('app-screen');
      initApp();
    } catch (err) {
      errEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      btn.querySelector('.btn-text').hidden  = false;
      btn.querySelector('.btn-spinner').hidden = true;
    }
  });
}

// ── App init ──────────────────────────────────────────────────────────────────
function initApp() {
  // User chip
  const initials = (S.user.email || 'U').slice(0, 2).toUpperCase();
  $('#user-avatar-sidebar').textContent = initials;
  $('#user-name-sidebar').textContent   = S.user.email.split('@')[0];
  $('#user-role-sidebar').textContent   = S.user.role;

  // Logout
  $('#logout-btn').addEventListener('click', () => { if (confirm('Sign out?')) doLogout(); });

  // Sidebar toggle (desktop collapse)
  $('#sidebar-toggle').addEventListener('click', () => $('#sidebar').classList.toggle('collapsed'));

  // Mobile sidebar open/close
  const backdrop = $('#sidebar-backdrop');

  function openMobileSidebar() {
    $('#sidebar').classList.add('open');
    backdrop.classList.add('visible');
    document.body.style.overflow = 'hidden';
  }

  function closeMobileSidebar() {
    $('#sidebar').classList.remove('open');
    backdrop.classList.remove('visible');
    document.body.style.overflow = '';
  }

  $('#mobile-menu-btn').addEventListener('click', openMobileSidebar);
  backdrop.addEventListener('click', closeMobileSidebar);

  // Navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', e => {
      e.preventDefault();
      closeMobileSidebar();       // close drawer on mobile after selecting
      if (item.dataset.view) go(item.dataset.view);
    });
  });

  // Refresh
  $('#refresh-btn').addEventListener('click', reload);

  // Suggestion chips (delegated)
  document.addEventListener('click', e => {
    if (e.target.classList.contains('suggestion-chip')) {
      const q = e.target.dataset.query;
      if (q) copilotSend(q);
    }
  });

  // Copilot form
  $('#copilot-form').addEventListener('submit', e => {
    e.preventDefault();
    const inp = $('#copilot-input');
    const q   = inp.value.trim();
    if (!q) return;
    inp.value = '';
    copilotSend(q);
  });

  // New-request modal
  $('#new-request-btn').addEventListener('click', openNewReqModal);
  $('#modal-close').addEventListener('click', closeModal);
  $('#modal-overlay').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });

  // Alert filters
  ['#alert-severity-filter','#alert-state-filter'].forEach(sel => {
    $(sel).addEventListener('change', () => { S.pages.alerts = 1; loadAlerts(); });
  });

  // SLA period
  $('#sla-period-select').addEventListener('change', loadSlaCompliance);

  // Analytics range
  $('#analytics-range').addEventListener('change', loadAnalytics);

  // Timeline
  $('#load-timeline-btn').addEventListener('click', () => {
    const id = $('#timeline-req-id').value.trim();
    if (id) loadTimeline(id);
  });
  $('#timeline-req-id').addEventListener('keydown', e => {
    if (e.key === 'Enter') $('#load-timeline-btn').click();
  });

  // Event search/filter
  let evtDebounce;
  $('#evt-search').addEventListener('input', () => { clearTimeout(evtDebounce); evtDebounce = setTimeout(() => { S.pages.events=1; loadEvents(); }, 380); });
  $('#evt-type-filter').addEventListener('change', () => { S.pages.events=1; loadEvents(); });

  // Request search
  let reqDebounce;
  $('#req-search').addEventListener('input', () => { clearTimeout(reqDebounce); reqDebounce = setTimeout(() => { S.pages.requests=1; loadRequests(); }, 380); });

  // WebSocket
  connectWs();

  // Initial view
  go('dashboard');
}

// ── Navigation ────────────────────────────────────────────────────────────────
const VIEW_TITLES = {
  dashboard: ['Dashboard',           ''],
  requests:  ['Service Requests',    ''],
  events:    ['Events',              'immutable event log'],
  timeline:  ['Journey Timeline',    ''],
  alerts:    ['Alerts',              ''],
  sla:       ['SLA Monitor',         ''],
  analytics: ['Operational Analytics',''],
  ai:        ['AI Copilot',          'Level 2'],
};

function go(view) {
  S.view = view;
  $$('.nav-item').forEach(i => i.classList.toggle('active', i.dataset.view === view));
  const [title, sub] = VIEW_TITLES[view] || [view,''];
  $('#page-title').textContent    = title;
  $('#page-subtitle').textContent = sub;
  $$('.view').forEach(v => v.classList.remove('active'));
  $(`#view-${view}`)?.classList.add('active');
  reload();
}

function reload() {
  ({ dashboard:loadDashboard, requests:loadRequests, events:loadEvents,
     alerts:loadAlerts, sla:loadSla, analytics:loadAnalytics,
     timeline:()=>{}, ai:()=>{} })[S.view]?.();
}

// ── Pagination renderer ───────────────────────────────────────────────────────
function renderPagination(containerEl, meta, key) {
  if (!meta || !containerEl) return;
  const { page, pageSize, total } = meta;
  const pages = Math.ceil(total / pageSize);
  if (pages <= 1) { containerEl.innerHTML = ''; return; }

  let h = `<span class="page-info">Page ${page} of ${pages} (${total})</span>`;
  h += `<button class="page-btn" ${page===1?'disabled':''} onclick="changePage('${key}',1)">«</button>`;
  h += `<button class="page-btn" ${page===1?'disabled':''} onclick="changePage('${key}',${page-1})">‹</button>`;
  for (let p = Math.max(1,page-2); p <= Math.min(pages,page+2); p++) {
    h += `<button class="page-btn${p===page?' active':''}" onclick="changePage('${key}',${p})">${p}</button>`;
  }
  h += `<button class="page-btn" ${page===pages?'disabled':''} onclick="changePage('${key}',${page+1})">›</button>`;
  h += `<button class="page-btn" ${page===pages?'disabled':''} onclick="changePage('${key}',${pages})">»</button>`;
  containerEl.innerHTML = h;
}
window.changePage = (key, page) => { S.pages[key] = page; reload(); };

// ── DASHBOARD ─────────────────────────────────────────────────────────────────
async function loadDashboard() {
  await Promise.all([loadKpis(), loadBottlenecks(), loadRecentAlerts()]);
}

async function loadKpis() {
  const grid = $('#kpi-grid');
  try {
    const res = await api('/dashboard/overview');
    if (!res) return;
    const kpis = res.data.kpis;

    const cards = [
      { label:'Avg Completion Time', icon:'<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>', value: fmtHours(kpis.avgCompletionTimeHours), sub:'per request' },
      { label:'SLA Compliance',      icon:'<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>', value: kpis.slaComplianceRate!=null ? `${(kpis.slaComplianceRate*100).toFixed(1)}%` : '—', sub:'overall', trend: kpis.slaComplianceRate>=0.9?'up':kpis.slaComplianceRate>=0.7?'flat':'down' },
      { label:'Request Throughput',  icon:'<line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>', value: kpis.requestThroughput!=null ? kpis.requestThroughput.toFixed(1) : '—', sub:'requests / day' },
      { label:'Completion Rate',     icon:'<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>', value: kpis.completionRate!=null ? `${(kpis.completionRate*100).toFixed(1)}%` : '—', sub:'of all requests', trend: kpis.completionRate>=0.8?'up':kpis.completionRate>=0.5?'flat':'down' },
      { label:'Delay Frequency',     icon:'<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', value: kpis.delayFrequency!=null ? kpis.delayFrequency.toFixed(1) : '—', sub:'delayed / day', trend: kpis.delayFrequency===0?'up':kpis.delayFrequency<2?'flat':'down' },
      { label:'Avg Dept Processing', icon:'<rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/>', value: (() => { const vals=Object.values(kpis.avgDepartmentProcessingTime||{}); return vals.length ? fmtHours(vals.reduce((a,b)=>a+b,0)/vals.length) : '—'; })(), sub:'across departments' },
    ];

    grid.innerHTML = cards.map(c => {
      const trendCls = c.trend ? `kpi-trend-${c.trend}` : '';
      const arrow    = c.trend==='up' ? '↑' : c.trend==='down' ? '↓' : '';
      return `<div class="kpi-card">
        <div class="kpi-label">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${c.icon}</svg>
          ${c.label}
        </div>
        <div class="kpi-value">${c.value}</div>
        <div class="kpi-sub ${trendCls}">${arrow ? `<strong>${arrow}</strong> ` : ''}${c.sub}</div>
      </div>`;
    }).join('');
  } catch (err) {
    grid.innerHTML = `<div class="empty-state" style="grid-column:1/-1">Failed to load KPIs: ${escHtml(err.message)}</div>`;
  }
}

async function loadBottlenecks() {
  const el = $('#bottlenecks-list');
  try {
    const res = await api('/dashboard/bottlenecks');
    if (!res) return;
    const items = res.data;
    if (!items.length) { el.innerHTML = '<div class="empty-state">No bottlenecks detected</div>'; return; }
    const max = items[0].avgExcessHours || 1;
    el.innerHTML = items.map((item, i) => `
      <div class="bottleneck-item">
        <span class="bottleneck-rank">${i+1}</span>
        <span class="bottleneck-stage">${item.journeyStage || item.stage || '—'}</span>
        <div class="bottleneck-bar-wrap">
          <div class="bottleneck-bar" style="width:${Math.min(100,(item.avgExcessHours/max)*100)}%"></div>
        </div>
        <span class="bottleneck-excess">+${fmtHours(item.avgExcessHours)}</span>
      </div>`).join('');
  } catch (err) {
    el.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
  }
}

async function loadRecentAlerts() {
  const container = $('#recent-alerts-list');
  try {
    const res = await api('/alerts?pageSize=5&page=1');
    if (!res) return;
    const list = res.data;
    if (!list.length) { container.innerHTML = '<div class="empty-state">No active alerts</div>'; return; }
    container.innerHTML = list.map(a => `
      <div class="alert-item-inline">
        <span class="badge ${sevCls(a.severity)}">${a.severity}</span>
        <span style="flex:1;font-size:.8rem">${trunc(a.message, 55)}</span>
        <span class="badge ${lcCls(a.lifecycleState)}">${a.lifecycleState}</span>
      </div>`).join('');
    // Update badge
    const active = list.filter(a => a.lifecycleState === 'Created').length;
    const badge  = $('#alert-badge');
    badge.textContent = active;
    badge.hidden = active === 0;
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
  }
}

// ── REQUESTS ──────────────────────────────────────────────────────────────────
async function loadRequests() {
  const tbody = $('#requests-tbody');
  tbody.innerHTML = '<tr><td colspan="8" class="table-loading">Loading…</td></tr>';

  const page = S.pages.requests;
  let url = `/requests?page=${page}&pageSize=20`;
  try {
    const res = await api(url);
    if (!res) return;
    const rows = res.data;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="8" class="table-loading">No service requests found</td></tr>';
      renderPagination($('#requests-pagination'), res.meta, 'requests');
      return;
    }
    tbody.innerHTML = rows.map(r => `
      <tr>
        <td><code style="color:var(--cyan);font-size:.78rem">${r.requestNumber}</code></td>
        <td>${escHtml(r.customerName)}</td>
        <td style="color:var(--subtle)">${escHtml(r.requestType)}</td>
        <td><span class="badge ${stageCls(r.currentStage)}">${r.currentStage}</span></td>
        <td><span class="badge ${r.currentStatus==='Open'?'badge-info':'badge-success'}">${r.currentStatus}</span></td>
        <td>${r.slaBreached ? '<span class="badge badge-critical">Breached</span>' : '<span class="badge badge-success">OK</span>'}</td>
        <td style="font-size:.75rem;color:var(--subtle)">${fmtDateShort(r.createdAt)}</td>
        <td><button class="btn btn-ghost btn-sm" onclick="viewTimeline('${r.id}')">Timeline</button></td>
      </tr>`).join('');
    renderPagination($('#requests-pagination'), res.meta, 'requests');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="8" class="table-loading">${escHtml(err.message)}</td></tr>`;
  }
}

window.viewTimeline = id => { go('timeline'); $('#timeline-req-id').value = id; loadTimeline(id); };

// ── EVENTS ────────────────────────────────────────────────────────────────────
async function loadEvents() {
  const tbody = $('#events-tbody');
  tbody.innerHTML = '<tr><td colspan="6" class="table-loading">Loading…</td></tr>';

  const page    = S.pages.events;
  const reqId   = $('#evt-search')?.value.trim();
  const evtType = $('#evt-type-filter')?.value;
  let url = `/events?page=${page}&pageSize=20`;
  if (reqId)   url += `&requestId=${encodeURIComponent(reqId)}`;
  if (evtType) url += `&eventType=${encodeURIComponent(evtType)}`;

  try {
    const res = await api(url);
    if (!res) return;
    const rows = res.data;
    const total = res.meta?.total ?? rows.length;
    $('#evt-count').textContent = `${total.toLocaleString()} event${total!==1?'s':''}`;

    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="6" class="table-loading">No events found</td></tr>';
      renderPagination($('#events-pagination'), res.meta, 'events');
      return;
    }

    const pipelineLbl = s => ({
      complete: '<span class="pipeline-complete">✓ Complete</span>',
      partial:  '<span class="pipeline-partial">⚠ Partial</span>',
      pending:  '<span class="pipeline-pending">○ Pending</span>',
    })[s] || `<span class="pipeline-pending">${s}</span>`;

    tbody.innerHTML = rows.map(e => `
      <tr>
        <td style="font-weight:500">${escHtml(e.eventType)}</td>
        <td><code style="font-size:.75rem;color:var(--cyan)">${(e.requestId||'—').slice(0,8)}…</code></td>
        <td style="color:var(--subtle)">${escHtml(e.department||'—')}</td>
        <td><span class="badge badge-neutral">${escHtml(e.sourceSystem||'—')}</span></td>
        <td>${pipelineLbl(e.pipelineStatus)}</td>
        <td style="font-family:var(--font-mono);font-size:.75rem;color:var(--subtle)">${fmtDate(e.occurredAt)}</td>
      </tr>`).join('');
    renderPagination($('#events-pagination'), res.meta, 'events');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="6" class="table-loading">${escHtml(err.message)}</td></tr>`;
  }
}

// ── TIMELINE ──────────────────────────────────────────────────────────────────
async function loadTimeline(requestId) {
  const container = $('#timeline-container');
  container.innerHTML = '<div class="empty-state">Loading timeline…</div>';
  try {
    const res = await api(`/timeline/${encodeURIComponent(requestId)}`);
    if (!res) return;
    const entries = res.data;
    if (!entries.length) {
      container.innerHTML = '<div class="empty-state">No events found for this request</div>';
      return;
    }
    const track = el('div', 'timeline-track');
    entries.forEach((evt, i) => {
      const dotCls = evt.eventType?.includes('breach') ? 'sla-breach'
                   : evt.eventType?.includes('stage')  ? 'stage-change' : '';
      const evtEl  = el('div', 'timeline-event');
      evtEl.style.animationDelay = `${i*0.04}s`;
      evtEl.innerHTML = `
        <div class="timeline-dot ${dotCls}"></div>
        <div class="timeline-card">
          <div class="timeline-card-header">
            <span class="timeline-event-type">${escHtml(evt.eventType||'—')}</span>
            ${evt.newState ? `<span class="badge ${stageCls(evt.newState)}">${evt.newState}</span>` : ''}
            <span class="timeline-time">${fmtDate(evt.occurredAt)}</span>
          </div>
          <div class="timeline-meta">
            ${evt.department ? `<span class="timeline-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
              ${escHtml(evt.department)}</span>` : ''}
            ${evt.sourceSystem ? `<span class="timeline-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/></svg>
              ${escHtml(evt.sourceSystem)}</span>` : ''}
            ${evt.triggeredByUser ? `<span class="timeline-meta-item">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
              ${escHtml(evt.triggeredByUser)}</span>` : ''}
          </div>
        </div>`;
      track.appendChild(evtEl);
    });
    container.innerHTML = '';
    container.appendChild(track);
  } catch (err) {
    const msg = err.message.includes('404') ? 'Request not found' : err.message;
    container.innerHTML = `<div class="empty-state">${escHtml(msg)}</div>`;
  }
}

// ── ALERTS ────────────────────────────────────────────────────────────────────
async function loadAlerts() {
  const tbody = $('#alerts-tbody');
  tbody.innerHTML = '<tr><td colspan="7" class="table-loading">Loading…</td></tr>';

  const severity  = $('#alert-severity-filter').value;
  const lifecycle = $('#alert-state-filter').value;
  const page = S.pages.alerts;
  let url = `/alerts?page=${page}&pageSize=20`;
  if (severity)  url += `&severity=${encodeURIComponent(severity)}`;
  if (lifecycle) url += `&lifecycleState=${encodeURIComponent(lifecycle)}`;

  try {
    const res = await api(url);
    if (!res) return;
    const rows = res.data;
    if (!rows.length) {
      tbody.innerHTML = '<tr><td colspan="7" class="table-loading">No alerts found</td></tr>';
      renderPagination($('#alerts-pagination'), res.meta, 'alerts');
      return;
    }
    tbody.innerHTML = rows.map(a => {
      const canAck  = a.lifecycleState === 'Created';
      const canRes  = a.lifecycleState === 'Acknowledged';
      const actions = [
        canAck ? `<button class="btn btn-ghost btn-sm" onclick="ackAlert('${a.id}')">Acknowledge</button>` : '',
        canRes ? `<button class="btn btn-ghost btn-sm" onclick="resAlert('${a.id}')">Resolve</button>` : '',
      ].filter(Boolean).join('');
      return `<tr>
        <td><span class="badge ${sevCls(a.severity)}">${a.severity}</span></td>
        <td style="color:var(--subtle);font-size:.78rem">${escHtml(a.alertType)}</td>
        <td style="max-width:280px">${trunc(a.message,65)}</td>
        <td><span class="badge ${lcCls(a.lifecycleState)}">${a.lifecycleState}</span></td>
        <td><code style="font-size:.72rem;color:var(--subtle)">${a.requestId?a.requestId.slice(0,8)+'…':'—'}</code></td>
        <td style="font-size:.75rem;color:var(--subtle)">${fmtDateShort(a.createdAt)}</td>
        <td>${actions||'<span style="color:var(--muted);font-size:.75rem">—</span>'}</td>
      </tr>`;
    }).join('');
    renderPagination($('#alerts-pagination'), res.meta, 'alerts');
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="table-loading">${escHtml(err.message)}</td></tr>`;
  }
}

// Use real API body: { action: 'acknowledge' } and { action: 'resolve' }
async function ackAlert(id) {
  try { await api(`/alerts/${id}`, { method:'PATCH', body:JSON.stringify({ action:'acknowledge' }) }); toast('Alert acknowledged','success'); loadAlerts(); }
  catch (err) { toast(err.message,'error'); }
}
async function resAlert(id) {
  try { await api(`/alerts/${id}`, { method:'PATCH', body:JSON.stringify({ action:'resolve' }) }); toast('Alert resolved','success'); loadAlerts(); }
  catch (err) { toast(err.message,'error'); }
}
window.ackAlert = ackAlert;
window.resAlert = resAlert;

// ── SLA ───────────────────────────────────────────────────────────────────────
async function loadSla() {
  await Promise.all([loadSlaRules(), loadSlaCompliance()]);
}

async function loadSlaRules() {
  const container = $('#sla-rules-list');
  try {
    const res = await api('/sla/rules');
    if (!res) return;
    const rules = res.data;
    if (!rules.length) { container.innerHTML = '<div class="empty-state">No SLA rules configured</div>'; return; }
    container.innerHTML = rules.map(r => `
      <div class="sla-rule-row">
        <span class="badge ${stageCls(r.journeyStage)}">${r.journeyStage}</span>
        <span class="sla-stage-name">${escHtml(r.description||'')}</span>
        <span class="sla-threshold">${fmtHours(r.thresholdHours)}</span>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
  }
}

async function loadSlaCompliance() {
  const container = $('#sla-compliance-body');
  // Real API: GET /sla/compliance?from=ISO&to=ISO  (1–365 days)
  const days = parseInt($('#sla-period-select').value || '30', 10);
  const to   = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const url  = `/sla/compliance?from=${from.toISOString()}&to=${to.toISOString()}`;
  try {
    const res = await api(url);
    if (!res) return;
    const d = res.data;

    // byDepartment and byStage are Record<string,number> objects
    const byDept  = Object.entries(d.byDepartment || {});
    const byStage = Object.entries(d.byStage      || {});
    const all     = [...byStage, ...byDept];

    if (!all.length) {
      container.innerHTML = '<div class="empty-state">100% compliance — no data for this period</div>';
      return;
    }
    container.innerHTML = all.map(([label, rate]) => {
      const pct = rate * 100;
      const cls = pct >= 90 ? 'good' : pct >= 70 ? 'ok' : 'bad';
      const barCls = cls === 'good' ? 'normal' : cls === 'ok' ? 'warning' : 'breached';
      return `<div class="sla-compliance-row">
        <span class="sla-compliance-label">${escHtml(label)}</span>
        <div class="sla-bar-wrap" style="width:80px;height:5px">
          <div class="sla-bar ${barCls}" style="width:${pct.toFixed(1)}%"></div>
        </div>
        <span class="sla-compliance-pct ${cls}">${pct.toFixed(1)}%</span>
      </div>`;
    }).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
  }
}

// ── ANALYTICS ─────────────────────────────────────────────────────────────────
async function loadAnalytics() {
  const days = parseInt($('#analytics-range').value || '30', 10);
  await Promise.all([loadTrends(days), loadDeptEfficiency(days)]);
}

async function loadTrends(days) {
  // Real API: GET /analytics/trends?from=ISO&to=ISO
  const to   = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const url  = `/analytics/trends?from=${from.toISOString()}&to=${to.toISOString()}`;
  try {
    const res = await api(url);
    if (!res) return;
    // res.data has shape: { requestVolume: [{timestamp, value}], slaComplianceRate: [...], periodStart, periodEnd }
    drawTrendChart(res.data);
  } catch (err) {
    const canvas = $('#trend-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = canvas.parentElement?.clientWidth || 600;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#6b6b85'; ctx.font = '13px Inter,sans-serif'; ctx.textAlign = 'center';
    ctx.fillText(err.message, canvas.width / 2, 90);
  }
}

function drawTrendChart(trendData) {
  const canvas = $('#trend-canvas');
  if (!canvas) return;
  const parent = canvas.parentElement;
  canvas.width  = parent?.clientWidth || 600;
  canvas.height = 180;
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // trendData.requestVolume is [{timestamp, value}]
  const points = (trendData?.requestVolume || []);
  if (!points.length) {
    ctx.fillStyle = '#6b6b85'; ctx.font = '13px Inter,sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('No trend data for this period', canvas.width / 2, 90);
    return;
  }

  const values = points.map(p => Number(p.value) || 0);
  const labels = points.map(p => {
    const d = new Date(p.timestamp);
    return isNaN(d) ? '' : d.toLocaleDateString('en-GB', { day:'2-digit', month:'short' });
  });

  const maxVal = Math.max(...values, 1);
  const pad = { top:20, right:20, bottom:30, left:42 };
  const w = canvas.width  - pad.left - pad.right;
  const h = canvas.height - pad.top  - pad.bottom;
  const n = points.length;

  // Grid lines + Y labels
  ctx.strokeStyle = '#1e1e28'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = pad.top + (h * i) / 4;
    ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + w, y); ctx.stroke();
    ctx.fillStyle = '#3a3a50'; ctx.font = '10px JetBrains Mono,monospace'; ctx.textAlign = 'right';
    ctx.fillText(Math.round(maxVal * (1 - i/4)), pad.left - 5, y + 3);
  }

  // Gradient fill
  const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + h);
  grad.addColorStop(0, 'rgba(0,229,255,0.18)'); grad.addColorStop(1, 'rgba(0,229,255,0)');
  ctx.beginPath();
  values.forEach((v, i) => {
    const x = pad.left + (i / Math.max(n-1,1)) * w;
    const y = pad.top  + h - (v / maxVal) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.lineTo(pad.left + w, pad.top + h); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();

  // Line
  ctx.beginPath(); ctx.strokeStyle = '#00e5ff'; ctx.lineWidth = 2; ctx.lineJoin = 'round';
  values.forEach((v, i) => {
    const x = pad.left + (i / Math.max(n-1,1)) * w;
    const y = pad.top  + h - (v / maxVal) * h;
    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
  });
  ctx.stroke();

  // Dots
  ctx.fillStyle = '#00e5ff';
  values.forEach((v, i) => {
    const x = pad.left + (i / Math.max(n-1,1)) * w;
    const y = pad.top  + h - (v / maxVal) * h;
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI*2); ctx.fill();
  });

  // X labels (max 7)
  const step = Math.ceil(n / 7);
  ctx.fillStyle = '#6b6b85'; ctx.font = '10px Inter,sans-serif'; ctx.textAlign = 'center';
  labels.forEach((lbl, i) => {
    if (i % step !== 0 && i !== n-1) return;
    const x = pad.left + (i / Math.max(n-1,1)) * w;
    ctx.fillText(lbl, x, canvas.height - 4);
  });
}

async function loadDeptEfficiency(days) {
  const container = $('#dept-efficiency-body');
  const to   = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const url  = `/analytics/departments?from=${from.toISOString()}&to=${to.toISOString()}`;
  try {
    const res = await api(url);
    if (!res) return;
    const depts = res.data;
    if (!depts.length) { container.innerHTML = '<div class="empty-state">No department data</div>'; return; }
    container.innerHTML = depts.map(d => `
      <div class="dept-row">
        <span class="dept-name">${escHtml(d.department)}</span>
        <span class="dept-time">${fmtHours(d.avgProcessingTimeHours)}</span>
      </div>`).join('');
  } catch (err) {
    container.innerHTML = `<div class="empty-state">${escHtml(err.message)}</div>`;
  }
}

// ── NEW REQUEST MODAL ─────────────────────────────────────────────────────────
function openNewReqModal() {
  $('#modal-title').textContent = 'New Service Request';
  $('#modal-body').innerHTML = `
    <form id="new-req-form" style="display:flex;flex-direction:column;gap:14px">
      <div class="form-row">
        <div class="form-group">
          <label style="font-size:.78rem;color:var(--secondary);margin-bottom:4px;display:block">Customer Name *</label>
          <input class="modal-input" name="customerName" placeholder="e.g. Nairobi Water" required />
        </div>
        <div class="form-group">
          <label style="font-size:.78rem;color:var(--secondary);margin-bottom:4px;display:block">Contact</label>
          <input class="modal-input" name="customerContact" placeholder="email or phone" />
        </div>
      </div>
      <div class="form-group">
        <label style="font-size:.78rem;color:var(--secondary);margin-bottom:4px;display:block">Request Type *</label>
        <select class="modal-select" name="requestType" required>
          <option value="">— select type —</option>
          <option>Borehole Design</option><option>Solar Installation</option>
          <option>Pump Maintenance</option><option>Water Treatment</option>
          <option>Site Survey</option><option>Other</option>
        </select>
      </div>
      <div class="form-group">
        <label style="font-size:.78rem;color:var(--secondary);margin-bottom:4px;display:block">Department</label>
        <select class="modal-select" name="assignedDepartment">
          <option value="">— unassigned —</option>
          <option>Sales</option><option>Engineering</option>
          <option>Logistics</option><option>Finance</option><option>Operations</option>
        </select>
      </div>
      <div class="modal-form-error" id="new-req-error"></div>
    </form>`;
  $('#modal-footer').innerHTML = `
    <button class="btn btn-ghost" id="modal-cancel-btn">Cancel</button>
    <button class="btn btn-primary" id="modal-submit-btn">Create Request</button>`;
  $('#modal-cancel-btn').addEventListener('click', closeModal);
  $('#modal-submit-btn').addEventListener('click', submitNewReq);
  openModal();
}

async function submitNewReq() {
  const form = $('#new-req-form');
  const data = Object.fromEntries(new FormData(form).entries());
  const errEl = $('#new-req-error');
  errEl.textContent = '';
  if (!data.customerName.trim()) { errEl.textContent = 'Customer name is required'; return; }
  if (!data.requestType)         { errEl.textContent = 'Request type is required'; return; }
  const btn = $('#modal-submit-btn');
  btn.disabled = true; btn.textContent = 'Creating…';
  try {
    await api('/requests', {
      method: 'POST',
      body: JSON.stringify({ customerName:data.customerName.trim(), customerContact:data.customerContact||null, requestType:data.requestType, assignedDepartment:data.assignedDepartment||null }),
    });
    toast('Service request created', 'success');
    closeModal();
    loadRequests();
  } catch (err) {
    errEl.textContent = err.message;
    btn.disabled = false; btn.textContent = 'Create Request';
  }
}

function openModal()  { const o=$('#modal-overlay'); o.hidden=false; o.style.display='flex'; }
function closeModal() { const o=$('#modal-overlay'); o.hidden=true;  o.style.display='none'; }

// ── AI COPILOT ────────────────────────────────────────────────────────────────
async function copilotSend(query) {
  const msgs    = $('#copilot-messages');
  const initials = (S.user?.email||'U').slice(0,2).toUpperCase();

  // User bubble
  const uMsg = el('div','copilot-msg copilot-msg--user');
  uMsg.innerHTML = `<div class="copilot-msg-avatar">${initials}</div><div class="copilot-msg-body"><p>${escHtml(query)}</p></div>`;
  msgs.appendChild(uMsg);

  // Typing indicator
  const typing = el('div','copilot-msg copilot-msg--assistant');
  typing.innerHTML = `<div class="copilot-msg-avatar">AI</div><div class="copilot-msg-body"><div class="copilot-typing"><span></span><span></span><span></span></div></div>`;
  msgs.appendChild(typing);
  msgs.scrollTop = msgs.scrollHeight;
  $('#copilot-send-btn').disabled = true;

  try {
    // Real API: POST /ai/copilot  body: { query }
    const res = await api('/ai/copilot', { method:'POST', body:JSON.stringify({ query }) });
    msgs.removeChild(typing);

    const aiMsg = el('div','copilot-msg copilot-msg--assistant');
    const d     = res?.data || {};
    let body    = `<p>${escHtml(d.answer || 'No response received.')}</p>`;

    // Data table
    if (Array.isArray(d.data) && d.data.length) {
      const keys = Object.keys(d.data[0]).slice(0,6);
      body += `<table class="copilot-data-table">
        <thead><tr>${keys.map(k=>`<th>${escHtml(k)}</th>`).join('')}</tr></thead>
        <tbody>${d.data.slice(0,8).map(row=>`<tr>${keys.map(k=>`<td>${escHtml(String(row[k]??'—'))}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>`;
      if (d.data.length>8) body += `<p style="font-size:.72rem;color:var(--subtle);margin-top:6px">Showing 8 of ${d.data.length} records</p>`;
    }

    // Reformulations (Req 11.3)
    if (d.suggestedReformulations?.length) {
      body += `<div class="copilot-suggestions">${d.suggestedReformulations.map(r=>`<button class="suggestion-chip" data-query="${escHtml(r)}">${escHtml(r)}</button>`).join('')}</div>`;
    }

    aiMsg.innerHTML = `<div class="copilot-msg-avatar">AI</div><div class="copilot-msg-body">${body}</div>`;
    msgs.appendChild(aiMsg);
  } catch (err) {
    msgs.removeChild(typing);
    const errMsg = el('div','copilot-msg copilot-msg--assistant');
    const txt = err.message.includes('503') ? 'AI service is temporarily unavailable.' : err.message;
    errMsg.innerHTML = `<div class="copilot-msg-avatar">AI</div><div class="copilot-msg-body"><p style="color:var(--danger)">${escHtml(txt)}</p></div>`;
    msgs.appendChild(errMsg);
  } finally {
    $('#copilot-send-btn').disabled = false;
    msgs.scrollTop = msgs.scrollHeight;
  }
}

// ── WEBSOCKET ─────────────────────────────────────────────────────────────────
function connectWs() {
  const wsInd = $('#ws-status');
  // The dev server doesn't implement WebSocket — we show a "No WS" indicator gracefully
  wsInd.className = 'ws-indicator';
  wsInd.querySelector('.ws-dot').style.background = 'var(--muted)';
  wsInd.querySelector('.ws-label').textContent = 'No WebSocket';
}
function disconnectWs() {}

// ── Window resize: redraw chart ───────────────────────────────────────────────
let resizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { if (S.view==='analytics') loadAnalytics(); }, 220);
});

// ── Boot ──────────────────────────────────────────────────────────────────────
initLogin();
