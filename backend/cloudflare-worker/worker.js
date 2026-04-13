/**
 * HCP Sync — Cloudflare Worker + KV
 *
 * Security layers:
 *  1. Origin check      — only requests from ALLOWED_ORIGINS pass
 *  2. Client token      — X-HCP-Client header must match env.HCP_CLIENT_TOKEN
 *  3. Rate limiting     — 30 req / 10 min per IP (via KV)
 *  4. Payload validation — strict schema + size limit
 *  5. Calendar ID       — 128-bit random, infeasible to enumerate
 *  6. Encryption        — AES-256-GCM done client-side, server sees only blobs
 *
 * Setup:
 *   wrangler kv namespace create CALENDARS
 *   wrangler secret put HCP_CLIENT_TOKEN   ← random secret, also set in Vite .env
 *   wrangler deploy
 */

const MAX_BLOB_BYTES  = 512 * 1024;   // 512 KB
const TTL_SECONDS     = 180 * 86400;  // 180 days
const RATE_WINDOW_MS  = 10 * 60_000;  // 10 minutes
const RATE_LIMIT      = 30;           // requests per window per IP

// Allowed browser origins — add your domain here
const ALLOWED_ORIGINS = [
  'https://hcp.sysop.cat',
];

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || '';

    // CORS preflight
    if (request.method === 'OPTIONS') {
      if (!ALLOWED_ORIGINS.includes(origin)) {
        return new Response(null, { status: 403 });
      }
      return new Response(null, { status: 204, headers: corsHeaders(origin) });
    }

    // 1. Origin check (browsers always send Origin for cross-origin requests)
    if (!ALLOWED_ORIGINS.includes(origin)) {
      return json({ error: 'Forbidden' }, 403, '');
    }

    // 2. Client token check (stops scripts that fake Origin)
    // Return CORS headers so browser can read the 403 response
    const clientToken = request.headers.get('X-HCP-Client') || '';
    if (env.HCP_CLIENT_TOKEN && clientToken !== env.HCP_CLIENT_TOKEN) {
      return json({ error: 'Forbidden — invalid client token' }, 403, origin);
    }

    // 3. Rate limiting per IP
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await checkRateLimit(env, ip))) {
      return json({ error: 'Rate limit exceeded — try again later' }, 429);
    }

    // Route
    const url = new URL(request.url);
    const m = url.pathname.match(/^\/v1\/calendar\/([^/]+)$/);
    if (!m) return json({ error: 'Not found' }, 404);

    const id = m[1];
    if (!ID_RE.test(id)) return json({ error: 'Invalid calendar ID' }, 400);

    if (request.method === 'GET')  return handleGet(env, id, origin);
    if (request.method === 'PUT')  return handlePut(env, id, request, origin);

    return json({ error: 'Method not allowed' }, 405);
  },
};

// ── Handlers ──────────────────────────────────────────────────────────────────

async function handleGet(env, id, origin) {
  const val = await env.CALENDARS.get(id);
  if (!val) return json({ error: 'Calendar not found' }, 404, origin);
  return json(JSON.parse(val), 200, origin);
}

async function handlePut(env, id, request, origin) {
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

// ── Rate limiting (KV-backed, best-effort) ────────────────────────────────────

async function checkRateLimit(env, ip) {
  const key = `rl:${ip}`;
  const now = Date.now();
  try {
    const raw = await env.CALENDARS.get(key);
    const state = raw ? JSON.parse(raw) : { count: 0, windowStart: now };

    if (now - state.windowStart > RATE_WINDOW_MS) {
      state.count = 0;
      state.windowStart = now;
    }

    state.count++;
    if (state.count > RATE_LIMIT) return false;

    await env.CALENDARS.put(key, JSON.stringify(state), {
      expirationTtl: Math.ceil(RATE_WINDOW_MS / 1000),
    });
    return true;
  } catch {
    return true; // fail open on KV errors
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-HCP-Client',
    'Vary': 'Origin',
  };
}

function json(obj, status = 200, origin = '') {
  const headers = { 'Content-Type': 'application/json' };
  if (origin) Object.assign(headers, corsHeaders(origin));
  return new Response(JSON.stringify(obj), { status, headers });
}
