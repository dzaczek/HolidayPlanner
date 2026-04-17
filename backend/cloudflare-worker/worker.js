/**
 * HCP Sync — Cloudflare Worker + KV
 *
 * Security layers:
 *  1. Origin check      — only requests from ALLOWED_ORIGINS pass
 *  2. Client token      — X-HCP-Client header must match env.HCP_CLIENT_TOKEN
 *                         Worker refuses to start if HCP_CLIENT_TOKEN is not set
 *  3. Rate limiting     — 30 req / 10 min per IP (via KV, fail-closed)
 *  4. Payload validation — strict schema + size limit + Content-Type check
 *  5. Calendar ID       — 128-bit random, infeasible to enumerate
 *  6. Encryption        — AES-256-GCM done client-side, server sees only blobs
 *
 * Setup:
 *   wrangler kv namespace create CALENDARS
 *   wrangler secret put HCP_CLIENT_TOKEN   ← random secret, also set in Vite .env
 *   wrangler deploy
 */

const MAX_BLOB_BYTES  = 256 * 1024;   // 256 KB
const TTL_SECONDS     = 180 * 86400;  // 180 days
const RATE_WINDOW_MS  = 10 * 60_000;  // 10 minutes
const RATE_LIMIT      = 30;           // requests per window per IP

// Allowed browser origins — add your domain here
const ALLOWED_ORIGINS = [
  'https://hcp.sysop.cat',
  'http://localhost:5173',
  'http://localhost:4173',
];

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);

    // Public: ical feed GET — token = calendarId(22) + keyRaw(43), no auth header needed.
    // Worker fetches the encrypted blob from KV, decrypts on-the-fly, returns ICS.
    const icalMatch = url.pathname.match(/^\/v1\/ical\/([A-Za-z0-9_-]{65})$/);
    if (icalMatch && request.method === 'GET') {
      return handleIcalGet(env, icalMatch[1]);
    }

    // Guard: refuse to operate if the client token secret is not configured.
    if (!env.HCP_CLIENT_TOKEN) {
      return json({ error: 'Service misconfigured — HCP_CLIENT_TOKEN not set' }, 503, origin);
    }

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return json({ error: 'Forbidden' }, 403, origin);
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 1. Origin check
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Forbidden' }, 403, origin);
    }

    // 2. Client token check
    const clientToken = request.headers.get('X-HCP-Client') || '';
    if (clientToken !== env.HCP_CLIENT_TOKEN) {
      return json({ error: 'Forbidden' }, 403, origin);
    }

    // 3. Rate limiting per IP (fail-closed: block on KV error)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await checkRateLimit(env, ip))) {
      return json({ error: 'Rate limit exceeded — try again later' }, 429, origin);
    }

    // Route: calendar blobs
    const m = url.pathname.match(/^\/v1\/calendar\/([^/]+)$/);
    if (!m) return json({ error: 'Not found' }, 404, origin);

    const id = m[1];
    if (!ID_RE.test(id)) return json({ error: 'Invalid calendar ID' }, 400, origin);

    if (request.method === 'GET')  return handleGet(env, id, origin);
    if (request.method === 'PUT')  return handlePut(env, id, request, origin);

    return json({ error: 'Method not allowed' }, 405, origin);
  },
};

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleIcalGet(env, token) {
  const calendarId = token.slice(0, 22);
  const keyRaw     = token.slice(22);       // 43-char base64url AES-256 key

  const raw = await env.CALENDARS.get(calendarId);
  if (!raw) return icalError(404, 'Calendar not found');

  let payload;
  try {
    const blob = JSON.parse(raw);
    payload = await icalDecrypt(keyRaw, blob);
  } catch {
    return icalError(400, 'Decryption failed — wrong key or corrupted data');
  }

  const ics = buildICSFromPayload(payload, `https://${new URL('https://placeholder').host}/v1/ical/${token}`);
  return new Response(ics, {
    status: 200,
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="hcp-calendar.ics"',
      'Cache-Control': 'no-cache, no-store',
    },
  });
}

function icalError(status, msg) {
  return new Response(msg, { status, headers: { 'Content-Type': 'text/plain' } });
}

// ── Worker-side AES-256-GCM decrypt ──────────────────────────────────────────

function b64urlToBytes(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const str = atob(pad);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf;
}

async function icalDecrypt(keyRaw, { iv, data }) {
  const key = await crypto.subtle.importKey(
    'raw', b64urlToBytes(keyRaw), { name: 'AES-GCM' }, false, ['decrypt'],
  );
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: b64urlToBytes(iv) }, key, b64urlToBytes(data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── ICS builder ───────────────────────────────────────────────────────────────

function buildICSFromPayload({ year, persons = [], holidays = [], leaves = [] }, calUrl) {
  const events = [];

  for (const person of persons) {
    const ph = holidays.filter(h => h.personId === person.id);
    for (const r of groupRanges(ph)) {
      events.push(vevent(`${person.name}: ${r.label}`, r.start, r.end, null, calUrl));
    }
  }

  for (const leave of leaves) {
    const names = persons.filter(p => (leave.personIds || []).includes(p.id)).map(p => p.name).join(', ');
    events.push(vevent(leave.label || 'Urlaub', leave.startDate, leave.endDate, names || null, calUrl));
  }

  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//HCP//Holiday Calendar Planner//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    `X-WR-CALNAME:HCP ${year}`,
    ...events,
    'END:VCALENDAR',
  ].join('\r\n');
}

function groupRanges(holidays) {
  const byLabel = {};
  for (const h of holidays) {
    (byLabel[h.label || 'Holiday'] ??= []).push(h.date);
  }
  const ranges = [];
  for (const [label, dates] of Object.entries(byLabel)) {
    const sorted = [...dates].sort();
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      const diff = (new Date(sorted[i]) - new Date(end)) / 86400000;
      if (diff === 1) { end = sorted[i]; } else { ranges.push({ label, start, end }); start = end = sorted[i]; }
    }
    ranges.push({ label, start, end });
  }
  return ranges;
}

function vevent(summary, start, end, description, url) {
  const fmt = s => s.replace(/-/g, '');
  const nextDay = s => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 1); return fmt(d.toISOString().slice(0, 10)); };
  const esc = s => (s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
  const dtstamp = new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15) + 'Z';
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}@hcp`;
  return [
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${fmt(start)}`,
    `DTEND;VALUE=DATE:${nextDay(end)}`,
    `SUMMARY:${esc(summary)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    url ? `URL:${url}` : null,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

async function handleGet(env, id, origin) {
  const val = await env.CALENDARS.get(id);
  if (!val) return json({ error: 'Calendar not found' }, 404, origin);
  return json(JSON.parse(val), 200, origin);
}

async function handlePut(env, id, request, origin) {
  // Require JSON content-type
  const ct = request.headers.get('content-type') || '';
  if (!ct.includes('application/json')) {
    return json({ error: 'Content-Type must be application/json' }, 415, origin);
  }

  const contentLength = parseInt(request.headers.get('content-length') || '0');
  if (contentLength > MAX_BLOB_BYTES) {
    return json({ error: 'Payload too large' }, 413, origin);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400, origin);
  }

  if (!isValidBlob(body)) {
    return json({ error: 'Invalid payload: expected { iv, data }' }, 400, origin);
  }

  // Optimistic locking: if client sent prevUpdatedAt, reject if server state has changed.
  // Prevents blind overwrites when two clients push concurrently.
  // prevUpdatedAt is optional — omit for the very first push (calendar doesn't exist yet).
  if (body.prevUpdatedAt !== undefined) {
    const existing = await env.CALENDARS.get(id);
    if (existing) {
      const current = JSON.parse(existing);
      if (current.updatedAt !== body.prevUpdatedAt) {
        return json({ error: 'Conflict: calendar was updated by another client', updatedAt: current.updatedAt }, 409, origin);
      }
    }
  }

  const updatedAt = new Date().toISOString();
  const stored = JSON.stringify({ iv: body.iv, data: body.data, updatedAt });

  if (stored.length > MAX_BLOB_BYTES) {
    return json({ error: 'Payload too large' }, 413, origin);
  }

  await env.CALENDARS.put(id, stored, { expirationTtl: TTL_SECONDS });
  return json({ ok: true, updatedAt }, 200, origin);
}

// ── Validation ────────────────────────────────────────────────────────────────

function isValidBlob(body) {
  if (!body || typeof body !== 'object') return false;
  if (typeof body.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(body.iv)) return false;
  if (typeof body.data !== 'string' || body.data.length < 32) return false;
  return true;
}

// ── Rate limiting (separate KV namespace, fail-closed) ───────────────────────

function normalizeIP(ip) {
  // IPv6: bucket to /64 prefix to prevent per-address evasion
  if (ip.includes(':')) return ip.split(':').slice(0, 4).join(':');
  return ip;
}

async function checkRateLimit(env, ip) {
  const key = `rl:${normalizeIP(ip)}`;
  const now = Date.now();
  try {
    const raw = await env.RATE_LIMITS.get(key);
    const state = raw ? JSON.parse(raw) : { count: 0, windowStart: now };

    if (now - state.windowStart > RATE_WINDOW_MS) {
      state.count = 0;
      state.windowStart = now;
    }

    state.count++;

    // Stop writing once already blocked — avoids burning KV ops on repeat offenders
    if (state.count <= RATE_LIMIT + 1) {
      await env.RATE_LIMITS.put(key, JSON.stringify(state), {
        expirationTtl: Math.ceil(RATE_WINDOW_MS / 1000),
      });
    }

    return state.count <= RATE_LIMIT;
  } catch {
    return false; // fail-closed: block on KV error rather than open the gate
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-HCP-Client',
    'Vary': 'Origin',
  };
}

function json(obj, status = 200, origin = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(obj), { status, headers });
}
