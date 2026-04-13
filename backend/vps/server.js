'use strict';

// Load .env file if present (ignored in Docker — use environment variables there)
require('dotenv').config();

/**
 * HCP Sync — Self-hosted VPS server (Node.js + SQLite)
 *
 * Stores only opaque encrypted blobs. Has no access to calendar content.
 *
 * API:
 *   GET  /v1/calendar/:id  → { iv, data, updatedAt }
 *   PUT  /v1/calendar/:id  → body: { iv, data }
 *
 * Security:
 *   - Rate limiting: 60 req / 10 min per IP
 *   - Max payload: 512 KB
 *   - Calendar ID validated: base64url 22 chars
 *   - Helmet.js security headers
 *   - No logging of calendar content
 */

const express      = require('express');
const Database     = require('better-sqlite3');
const rateLimit    = require('express-rate-limit');
const helmet       = require('helmet');
const cors         = require('cors');
const path         = require('path');

const PORT       = process.env.PORT       || 3000;
const DB_PATH    = process.env.DB_PATH    || '/data/hcp.db';
const MAX_BYTES  = parseInt(process.env.MAX_BLOB_BYTES || String(512 * 1024));
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const ID_RE      = /^[A-Za-z0-9_-]{22}$/;

// ── Database ─────────────────────────────────────────────────────────────────

const db = new Database(DB_PATH);

db.exec(`
  CREATE TABLE IF NOT EXISTS calendars (
    id         TEXT    PRIMARY KEY,
    iv         TEXT    NOT NULL,
    data       TEXT    NOT NULL,
    updated_at TEXT    NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_updated ON calendars(updated_at);
`);

// Cleanup job: remove entries older than 180 days (runs hourly)
function cleanup() {
  const cutoff = new Date(Date.now() - 180 * 86400_000).toISOString();
  const { changes } = db.prepare('DELETE FROM calendars WHERE updated_at < ?').run(cutoff);
  if (changes > 0) console.log(`[cleanup] Removed ${changes} expired calendars`);
}
setInterval(cleanup, 3600_000);

// ── App ───────────────────────────────────────────────────────────────────────

const app = express();

app.set('trust proxy', 1);

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'PUT', 'OPTIONS'] }));
app.use(express.json({ limit: `${MAX_BYTES}b` }));

// Rate limit: 60 requests per 10 minutes per IP
app.use('/v1/', rateLimit({
  windowMs: 10 * 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
}));

// ── Routes ────────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => res.json({ ok: true }));

app.get('/v1/calendar/:id', (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid calendar ID' });

  const row = db.prepare('SELECT iv, data, updated_at FROM calendars WHERE id = ?').get(id);
  if (!row) return res.status(404).json({ error: 'Calendar not found' });

  res.json({ iv: row.iv, data: row.data, updatedAt: row.updated_at });
});

app.put('/v1/calendar/:id', (req, res) => {
  const { id } = req.params;
  if (!ID_RE.test(id)) return res.status(400).json({ error: 'Invalid calendar ID' });

  const { iv, data } = req.body || {};
  if (!isValidBlob(iv, data)) {
    return res.status(400).json({ error: 'Invalid payload: expected { iv, data }' });
  }

  const updatedAt = new Date().toISOString();
  db.prepare('INSERT OR REPLACE INTO calendars (id, iv, data, updated_at) VALUES (?, ?, ?, ?)')
    .run(id, iv, data, updatedAt);

  res.json({ ok: true, updatedAt });
});

function isValidBlob(iv, data) {
  if (typeof iv !== 'string' || !/^[A-Za-z0-9_-]{16}$/.test(iv)) return false;
  if (typeof data !== 'string' || data.length < 32 || data.length > MAX_BYTES) return false;
  return true;
}

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`[hcp-sync] Listening on :${PORT}`));
