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
const { webcrypto } = require('node:crypto');
const subtle = webcrypto.subtle;

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
const HCP_CLIENT_TOKEN = process.env.HCP_CLIENT_TOKEN || '';

app.use(cors({ origin: CORS_ORIGIN, methods: ['GET', 'PUT', 'DELETE', 'OPTIONS'] }));
app.use(express.json({ limit: `${MAX_BYTES}b` }));

// Rate limit: 60 requests per 10 minutes per IP
app.use('/v1/', rateLimit({
  windowMs: 10 * 60_000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Rate limit exceeded' },
}));

// ── Auth middleware ───────────────────────────────────────────────────────────

function requireClientToken(req, res, next) {
  if (!HCP_CLIENT_TOKEN) return res.status(503).json({ error: 'HCP_CLIENT_TOKEN not configured' });
  if (req.headers['x-hcp-client'] !== HCP_CLIENT_TOKEN) return res.status(403).json({ error: 'Forbidden' });
  next();
}

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

// ── iCal feed — decrypt on-the-fly (token = calendarId[22] + keyRaw[43]) ─────

const ICAL_TOKEN_RE = /^[A-Za-z0-9_-]{65}$/;

function b64urlToBuffer(s) {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = b64 + '='.repeat((4 - b64.length % 4) % 4);
  return Buffer.from(b64, 'base64');
}

async function icalDecrypt(keyRaw, { iv, data }) {
  const key = await subtle.importKey('raw', b64urlToBuffer(keyRaw), { name: 'AES-GCM' }, false, ['decrypt']);
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: b64urlToBuffer(iv) }, key, b64urlToBuffer(data));
  return JSON.parse(Buffer.from(plain).toString('utf8'));
}

function labelStr(label) {
  if (!label) return '';
  if (typeof label === 'string') return label;
  if (typeof label === 'object') return label.de || label.en || label.fr || label.it || Object.values(label)[0] || '';
  return String(label);
}

function buildICS(payload, calUrl, syncUrl) {
  const { year, persons = [], holidays = [], leaves = [] } = payload;
  const withSync = desc => [desc, syncUrl].filter(Boolean).join('\n');
  const events = [];

  for (const person of persons) {
    const ph = holidays.filter(h => h.personId === person.id);
    for (const r of groupRanges(ph)) {
      events.push(vevent(`${person.name}: ${labelStr(r.label)}`, r.start, r.end, withSync(null), calUrl));
    }
  }
  for (const leave of leaves) {
    const names = persons.filter(p => (leave.personIds || []).includes(p.id)).map(p => p.name).join(', ');
    events.push(vevent(`Urlop: ${labelStr(leave.label) || 'Urlop'}`, leave.startDate, leave.endDate, withSync(names || null), calUrl));
  }

  return ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//HCP//Holiday Calendar Planner//EN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:HCP ${year}`,
    ...events, 'END:VCALENDAR'].join('\r\n');
}

function groupRanges(holidays) {
  const byLabel = {};
  for (const h of holidays) (byLabel[labelStr(h.label) || 'Holiday'] ??= []).push(h.date);
  const ranges = [];
  for (const [label, dates] of Object.entries(byLabel)) {
    const sorted = [...dates].sort();
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if ((new Date(sorted[i]) - new Date(end)) / 86400000 === 1) { end = sorted[i]; }
      else { ranges.push({ label, start, end }); start = end = sorted[i]; }
    }
    ranges.push({ label, start, end });
  }
  return ranges;
}

function vevent(summary, start, end, description, url) {
  const fmt = s => s.replace(/-/g, '');
  const nextDay = s => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + 1); return fmt(d.toISOString().slice(0, 10)); };
  const esc = s => (s || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
  return [
    'BEGIN:VEVENT',
    `UID:${Date.now()}-${Math.random().toString(36).slice(2, 7)}@hcp`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:.]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${fmt(start)}`,
    `DTEND;VALUE=DATE:${nextDay(end)}`,
    `SUMMARY:${esc(summary)}`,
    description ? `DESCRIPTION:${esc(description)}` : null,
    url ? `URL:${url}` : null,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

app.get('/v1/ical/:token', async (req, res) => {
  const { token } = req.params;
  if (!ICAL_TOKEN_RE.test(token)) return res.status(400).send('Invalid token');

  const calendarId = token.slice(0, 22);
  const keyRaw     = token.slice(22);

  const row = db.prepare('SELECT iv, data FROM calendars WHERE id = ?').get(calendarId);
  if (!row) return res.status(404).send('Calendar not found');

  let payload;
  try {
    payload = await icalDecrypt(keyRaw, row);
  } catch {
    return res.status(400).send('Decryption failed');
  }

  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const calUrl  = `${baseUrl}/v1/ical/${token}`;
  const syncUrl = `https://hcp.sysop.cat/?sync=hcp_${calendarId}_${keyRaw}`;

  res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="hcp-calendar.ics"');
  res.setHeader('Cache-Control', 'no-cache, no-store');
  res.send(buildICS(payload, calUrl, syncUrl));
});

// ── Start ─────────────────────────────────────────────────────────────────────

app.listen(PORT, () => console.log(`[hcp-sync] Listening on :${PORT}`));
