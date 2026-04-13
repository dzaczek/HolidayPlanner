/**
 * HCP Cloud Store — backend-agnostic HTTP client
 *
 * Compatible with:
 *  - Cloudflare Workers + KV  (see /backend/cloudflare-worker/)
 *  - Self-hosted VPS/Docker   (see /backend/vps/)
 *
 * API contract:
 *   GET  <endpoint>/v1/calendar/:id  → { iv, data, updatedAt } | 404
 *   PUT  <endpoint>/v1/calendar/:id  → body: { iv, data }      → { ok, updatedAt }
 */

const DEFAULT_ENDPOINT = 'https://hcp-sync.sysop.cat';
const LS_ENDPOINT_KEY = 'hcp-sync-endpoint';
const LS_FAMILY_KEY   = 'hcp-family-code';
const LS_LAST_SYNC    = 'hcp-last-sync';

export function getEndpoint() {
  return localStorage.getItem(LS_ENDPOINT_KEY) || DEFAULT_ENDPOINT;
}

export function setEndpoint(url) {
  localStorage.setItem(LS_ENDPOINT_KEY, url.replace(/\/$/, ''));
}

export function getFamilyCode() {
  return localStorage.getItem(LS_FAMILY_KEY) || null;
}

export function setFamilyCode(code) {
  localStorage.setItem(LS_FAMILY_KEY, code);
}

export function clearFamilyCode() {
  localStorage.removeItem(LS_FAMILY_KEY);
  localStorage.removeItem(LS_LAST_SYNC);
}

export function getLastSync() {
  return localStorage.getItem(LS_LAST_SYNC) || null;
}

function setLastSync(ts) {
  localStorage.setItem(LS_LAST_SYNC, ts);
}

/**
 * Upload an encrypted blob to the server.
 * @param {string} calendarId
 * @param {{ iv: string, data: string }} encrypted
 */
function clientHeaders() {
  const token = typeof __HCP_CLIENT_TOKEN__ !== 'undefined' ? __HCP_CLIENT_TOKEN__ : '';
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'X-HCP-Client': token } : {}),
  };
}

export async function pushCalendar(calendarId, encrypted) {
  const url = `${getEndpoint()}/v1/calendar/${encodeURIComponent(calendarId)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: clientHeaders(),
    body: JSON.stringify(encrypted),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => res.status);
    throw new Error(`Push failed: ${text}`);
  }

  const json = await res.json();
  setLastSync(json.updatedAt || new Date().toISOString());
  return json;
}

/**
 * Download an encrypted blob from the server.
 * Returns null if calendar not found (first sync).
 * @param {string} calendarId
 */
export async function pullCalendar(calendarId) {
  const url = `${getEndpoint()}/v1/calendar/${encodeURIComponent(calendarId)}`;
  const res = await fetch(url, { headers: clientHeaders() });

  if (res.status === 404) return null;
  if (!res.ok) {
    const text = await res.text().catch(() => res.status);
    throw new Error(`Pull failed: ${text}`);
  }

  const json = await res.json();
  setLastSync(json.updatedAt || new Date().toISOString());
  return json;
}
