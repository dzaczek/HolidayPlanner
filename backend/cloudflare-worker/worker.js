/**
 * HCP Sync — Cloudflare Worker + KV
 *
 * Deploy:
 *   1. wrangler kv:namespace create CALENDARS
 *   2. Paste the binding ID into wrangler.toml
 *   3. wrangler deploy
 *
 * API:
 *   GET  /v1/calendar/:id  → { iv, data, updatedAt } | 404
 *   PUT  /v1/calendar/:id  → body: { iv, data }      → { ok, updatedAt }
 *
 * Security:
 *   - Server stores only opaque encrypted blobs (AES-256-GCM done client-side)
 *   - Calendar ID is 128-bit random — infeasible to enumerate
 *   - Rate limit: 60 req / 10 min per IP
 *   - Max blob size: 512 KB
 *   - KV TTL: 180 days (reset on each write)
 */

const MAX_BLOB_BYTES = 512 * 1024;   // 512 KB
const TTL_SECONDS    = 180 * 86400;  // 180 days
const RATE_WINDOW_MS = 10 * 60_000;  // 10 minutes
const RATE_LIMIT     = 60;           // requests per window

const ID_RE = /^[A-Za-z0-9_-]{22}$/;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    // Rate limiting via KV (best-effort)
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    if (!(await checkRateLimit(env, ip))) {
      return json({ error: 'Rate limit exceeded' }, 429);
    }

    const url = new URL(request.url);
    const m = url.pathname.match(/^\/v1\/calendar\/([^/]+)$/);
    if (!m) return json({ error: 'Not found' }, 404);

    const id = m[1];
    if (!ID_RE.test(id)) return json({ error: 'Invalid calendar ID' }, 400);

    if (request.method === 'GET') {
      return handleGet(env, id);
    }
    if (request.method === 'PUT') {
      return handlePut(env, id, request);
    }

    return json({ error: 'Method not allowed' }, 405);
  },
};

async function handleGet(env, id) {
  const val = await env.CALENDARS.get(id);
  if (!val) return json({ error: 'Calendar not found' }, 404);
  return json(JSON.parse(val));
}

async function handlePut(env, id, request) {
  const contentLength = parseInt(request.headers.get('content-length') || '0');
  if (contentLength > MAX_BLOB_BYTES) {
    return json({ error: 'Payload too large' }, 413);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, 400);
  }

  if (!isValidBlob(body)) {
    return json({ error: 'Invalid payload: expected { iv, data }' }, 400);
  }

  const updatedAt = new Date().toISOString();
  const stored = JSON.stringify({ iv: body.iv, data: body.data, updatedAt });

  if (stored.length > MAX_BLOB_BYTES) {
    return json({ error: 'Payload too large' }, 413);
  }

  await env.CALENDARS.put(id, stored, { expirationTtl: TTL_SECONDS });
  return json({ ok: true, updatedAt });
}

function isValidBlob(body) {
  if (!body || typeof body !== 'object') return false;
  if (typeof body.iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(body.iv)) return false;
  if (typeof body.data !== 'string' || body.data.length < 32) return false;
  if (!/^[A-Za-z0-9_-]+=*$/.test(body.data.replace(/-/g, '+').replace(/_/g, '/'))) return false;
  return true;
}

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

    await env.CALENDARS.put(key, JSON.stringify(state), { expirationTtl: Math.ceil(RATE_WINDOW_MS / 1000) });
    return true;
  } catch {
    return true; // fail open if KV errors
  }
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  });
}
