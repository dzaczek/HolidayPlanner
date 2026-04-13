/**
 * HCP E2EE Crypto — AES-256-GCM via Web Crypto API (built-in, no deps)
 *
 * Security properties:
 *  - AES-256-GCM: authenticated encryption (confidentiality + integrity)
 *  - Fresh 96-bit random IV per encryption (probabilistic collision: 2^-48)
 *  - Keys never leave the browser / URL fragment (#)
 *  - Calendar ID is 128-bit random → 2^128 space, unguessable
 */

const ALGO = { name: 'AES-GCM', length: 256 };

// ── Key generation ──────────────────────────────────────────────────────────

/** Generate a new random AES-256 key. */
export async function generateKey() {
  return crypto.subtle.generateKey(ALGO, true, ['encrypt', 'decrypt']);
}

/** Export CryptoKey → base64url string. */
export async function exportKey(cryptoKey) {
  const raw = await crypto.subtle.exportKey('raw', cryptoKey);
  return bufToBase64url(raw);
}

/** Import base64url string → CryptoKey. */
export async function importKey(b64url) {
  const raw = base64urlToBuf(b64url);
  return crypto.subtle.importKey('raw', raw, ALGO, false, ['encrypt', 'decrypt']);
}

// ── Calendar ID ─────────────────────────────────────────────────────────────

/** Generate a random 128-bit calendar ID (base64url, 22 chars). */
export function generateCalendarId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return bufToBase64url(bytes);
}

// ── Encrypt / Decrypt ───────────────────────────────────────────────────────

/**
 * Encrypt arbitrary object → { iv, data } (both base64url).
 * A fresh 96-bit IV is generated for every call.
 */
export async function encryptPayload(cryptoKey, obj) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plain = new TextEncoder().encode(JSON.stringify(obj));
  const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, cryptoKey, plain);
  return {
    iv: bufToBase64url(iv),
    data: bufToBase64url(cipher),
  };
}

/**
 * Decrypt { iv, data } (base64url) → original object.
 * Throws if key is wrong or data tampered (GCM auth tag mismatch).
 */
export async function decryptPayload(cryptoKey, { iv, data }) {
  const plain = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64urlToBuf(iv) },
    cryptoKey,
    base64urlToBuf(data),
  );
  return JSON.parse(new TextDecoder().decode(plain));
}

// ── Family Code ─────────────────────────────────────────────────────────────

/**
 * Build a shareable family code:  hcp_<calendarId>_<keyBase64url>
 */
export async function buildFamilyCode(calendarId, cryptoKey) {
  const keyB64 = await exportKey(cryptoKey);
  return `hcp_${calendarId}_${keyB64}`;
}

/**
 * Parse a family code → { calendarId, cryptoKey }
 * Throws if the format is invalid.
 */
export async function parseFamilyCode(code) {
  const clean = code.trim();
  const m = clean.match(/^hcp_([A-Za-z0-9_-]{22})_([A-Za-z0-9_-]{43})$/);
  if (!m) throw new Error('Invalid family code format');
  const calendarId = m[1];
  const cryptoKey = await importKey(m[2]);
  return { calendarId, cryptoKey, keyRaw: m[2] };
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function bufToBase64url(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : buf;
  let str = '';
  for (const b of bytes) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlToBuf(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padded = b64 + '='.repeat((4 - b64.length % 4) % 4);
  const str = atob(padded);
  const buf = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) buf[i] = str.charCodeAt(i);
  return buf;
}
