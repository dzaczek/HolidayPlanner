import { getAllPersons, getHolidaysForYear, getAllLeaves, addPerson, addHolidaysBatch, addLeave } from '../db/store.js';
import { t, getLang } from '../i18n/i18n.js';
import { getYear } from '../calendar/renderer.js';

/**
 * Export current year's calendar data as a compact JSON,
 * compress with deflate, encode as base64 URL parameter.
 */
export async function generateShareURL() {
  const year = getYear();
  const persons = await getAllPersons(year);
  const holidays = await getHolidaysForYear(year);
  const leaves = await getAllLeaves(year);

  // Build compact payload
  const payload = {
    v: 1,
    y: year,
    lang: getLang(),
    p: persons.map(p => ({
      n: p.name,
      c: p.category,
      g: p.gemeinde,
      gn: p.gemeindeName,
      cl: p.color,
    })),
    h: compactHolidays(holidays, persons),
    l: leaves.map(l => ({
      lb: l.label,
      s: l.startDate,
      e: l.endDate,
      pi: l.personIds.map(id => persons.findIndex(p => p.id === id)).filter(i => i >= 0),
    })),
  };

  const json = JSON.stringify(payload);
  const compressed = await compress(json);
  const base64 = btoa(String.fromCharCode(...compressed))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const url = new URL(window.location.href);
  url.hash = '';
  url.search = '';
  url.searchParams.set('share', base64);

  return url.toString();
}

/**
 * Check if URL has shared data and import it.
 * Returns true if data was imported.
 */
export async function importFromURL() {
  const params = new URLSearchParams(window.location.search);
  const encoded = params.get('share');
  if (!encoded) return false;

  try {
    const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - base64.length % 4) % 4);
    const bytes = Uint8Array.from(atob(padded), c => c.charCodeAt(0));
    const json = await decompress(bytes);
    const payload = JSON.parse(json);

    if (payload.v !== 1) throw new Error('Unsupported share version');

    return payload;
  } catch (err) {
    console.error('[HCP] Failed to import shared data:', err);
    return false;
  }
}

/**
 * Apply shared payload to IndexedDB.
 */
export async function applySharedData(payload) {
  const year = payload.y;

  // Add persons and map old index → new ID
  const personIds = [];
  for (const p of payload.p) {
    const id = await addPerson({
      name: p.n,
      category: p.c,
      gemeinde: p.g,
      gemeindeName: p.gn,
      color: p.cl,
      year,
    });
    personIds.push(id);
  }

  // Add holidays
  if (payload.h && payload.h.length > 0) {
    const holidays = [];
    for (const h of payload.h) {
      const personId = personIds[h.pi];
      if (personId == null) continue;
      holidays.push({
        personId,
        date: h.d,
        source: h.s || 'menu',
        label: h.lb || '',
        year,
      });
    }
    if (holidays.length > 0) {
      await addHolidaysBatch(holidays);
    }
  }

  // Add leaves
  if (payload.l) {
    for (const l of payload.l) {
      await addLeave({
        label: l.lb,
        startDate: l.s,
        endDate: l.e,
        personIds: l.pi.map(i => personIds[i]).filter(Boolean),
        year,
      });
    }
  }

  return year;
}

function compactHolidays(holidays, persons) {
  return holidays.map(h => ({
    pi: persons.findIndex(p => p.id === h.personId),
    d: h.date,
    s: h.source,
    lb: h.label,
  })).filter(h => h.pi >= 0);
}

async function compress(str) {
  const stream = new Blob([str]).stream().pipeThrough(new CompressionStream('deflate'));
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return result;
}

async function decompress(bytes) {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'));
  const reader = stream.getReader();
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
  }
  const totalLength = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(totalLength);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(result);
}
