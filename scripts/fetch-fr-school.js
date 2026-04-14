#!/usr/bin/env node
/**
 * fetch-fr-school.js
 * Fetches French school zone calendars (A, B, C) from the Ministry of Education
 * API and writes src/db/seed/holidays/fr/school_YEAR.json
 *
 * Usage:
 *   node scripts/fetch-fr-school.js 2028     # academic year 2028-2029 → school_2028.json
 *   node scripts/fetch-fr-school.js 2028 2029
 *
 * NOTE: The API provides data for the academic year YEAR/YEAR+1.
 *       The output file is named school_YEAR.json and covers the CALENDAR year YEAR
 *       (Christmas ending in Jan YEAR through Christmas starting in Dec YEAR).
 *
 * Source:
 *   https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../src/db/seed/holidays/fr');

const API_BASE = 'https://data.education.gouv.fr/api/explore/v2.1/catalog/datasets/fr-en-calendrier-scolaire/records';

// Map API description → our i18n name object
const VACATION_NAMES = {
  "Vacances de la Toussaint": { fr: 'Vacances de la Toussaint', de: 'Herbstferien',       en: "All Saints' holidays" },
  "Vacances de Noël":         { fr: 'Vacances de Noël',         de: 'Weihnachtsferien',   en: 'Christmas holidays' },
  "Vacances d'Hiver":         { fr: "Vacances d'Hiver",         de: 'Winterferien',       en: 'Winter holidays' },
  "Vacances d'hiver":         { fr: "Vacances d'Hiver",         de: 'Winterferien',       en: 'Winter holidays' },
  "Vacances de Printemps":    { fr: 'Vacances de Printemps',    de: 'Frühlingsferien',    en: 'Spring holidays' },
  "Vacances de printemps":    { fr: 'Vacances de Printemps',    de: 'Frühlingsferien',    en: 'Spring holidays' },
  "Pont de l'Ascension":      { fr: "Pont de l'Ascension",      de: 'Brückentag Himmelfahrt', en: 'Ascension bridge' },
  "Vacances d'Été":           { fr: "Vacances d'Été",           de: 'Sommerferien',       en: 'Summer holidays' },
  "Vacances d'été":           { fr: "Vacances d'Été",           de: 'Sommerferien',       en: 'Summer holidays' },
  "Début des vacances d'été": { fr: "Vacances d'Été",           de: 'Sommerferien',       en: 'Summer holidays' },
  "Début des Vacances d'Été": { fr: "Vacances d'Été",           de: 'Sommerferien',       en: 'Summer holidays' },
};

// Paris is UTC+1 (CET) in winter, UTC+2 (CEST) in summer
// API dates like "2026-02-06T23:00:00+00:00" = 2026-02-07 00:00 CET
function apiDateToLocal(isoString) {
  const d = new Date(isoString);
  // Convert UTC to Paris local midnight
  // Approximate: add 1h in winter, 2h in summer
  const month = d.getUTCMonth(); // 0-indexed
  const offset = (month >= 2 && month <= 9) ? 2 : 1; // CEST Apr-Oct, CET Nov-Mar (approx)
  const local = new Date(d.getTime() + offset * 3600 * 1000);
  return local.toISOString().slice(0, 10);
}

async function fetchZone(academicYear, zone, limit = 50) {
  const where = `annee_scolaire="${academicYear}" AND zones="Zone ${zone}"`;
  const url = `${API_BASE}?limit=${limit}&where=${encodeURIComponent(where)}&order_by=start_date`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching Zone ${zone} for ${academicYear}`);
  const json = await res.json();
  return json.results || [];
}

function recordsToHolidays(records) {
  const seen = new Set();
  const holidays = [];

  for (const r of records) {
    const desc = r.description?.trim() ?? '';
    const name = VACATION_NAMES[desc] ?? { fr: desc, de: desc, en: desc };
    const start = apiDateToLocal(r.start_date);

    // end_date from API is "resume date" (first school day), so last free day = end - 1 day
    const endRaw = new Date(r.end_date);
    const endOffset = (endRaw.getUTCMonth() >= 2 && endRaw.getUTCMonth() <= 9) ? 2 : 1;
    const endLocal = new Date(endRaw.getTime() + endOffset * 3600 * 1000);
    // Subtract one day to get last free day
    const lastFree = new Date(endLocal.getTime() - 24 * 3600 * 1000);
    const end = lastFree.toISOString().slice(0, 10);

    // Deduplicate by description+start
    const key = `${desc}|${start}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const isPont = desc.toLowerCase().includes('ascension');
    const isSummer = desc.toLowerCase().includes('été') || desc.toLowerCase().includes('ete');

    // Summer end: API gives school resume (Sept 1), use Aug 31 as last free
    const finalEnd = (start === end && (isSummer || isPont)) ? start : end;

    holidays.push({
      name,
      start,
      end: isSummer ? end : finalEnd,
      type: isPont ? 'bridge_day' : 'vacation',
    });
  }

  // Sort by start date
  holidays.sort((a, b) => a.start.localeCompare(b.start));
  return holidays;
}

async function fetchYear(calendarYear) {
  // Academic year YEAR-1/YEAR covers Jan-Aug YEAR (winter, spring, summer)
  // Academic year YEAR/YEAR+1 covers Oct-Dec YEAR (Toussaint, Christmas)
  const prevAcademic = `${calendarYear - 1}-${calendarYear}`;
  const currAcademic = `${calendarYear}-${calendarYear + 1}`;

  console.log(`Fetching school year ${calendarYear}…`);
  console.log(`  Academic years: ${prevAcademic} + ${currAcademic}`);

  const zones = ['A', 'B', 'C'];
  const entries = [];

  for (const zone of zones) {
    // Combine records from both academic years
    const [prevRecords, currRecords] = await Promise.all([
      fetchZone(prevAcademic, zone).catch(() => []),
      fetchZone(currAcademic, zone).catch(() => []),
    ]);

    const allRecords = [...prevRecords, ...currRecords];
    // Filter to only records relevant to calendar year YEAR
    const relevant = allRecords.filter(r => {
      const start = new Date(r.start_date);
      // Include if start is in Dec of previous year (Christmas spilling into YEAR)
      // or if start is within YEAR
      const startYear = start.getUTCFullYear();
      const startMonth = start.getUTCMonth(); // 0-indexed
      return (startYear === calendarYear - 1 && startMonth === 11) || startYear === calendarYear;
    });

    const holidays = recordsToHolidays(relevant);
    const canton = `Zone-${zone}`;
    entries.push({ canton, year: calendarYear, category: 'school', holidays });

    // Zone-B-AM gets same school holidays as Zone-B
    if (zone === 'B') {
      entries.push({ canton: 'Zone-B-AM', year: calendarYear, category: 'school', holidays: [...holidays] });
    }
  }

  // Reorder: Zone-A, Zone-B, Zone-B-AM, Zone-C
  const ordered = ['Zone-A', 'Zone-B', 'Zone-B-AM', 'Zone-C'].map(c => entries.find(e => e.canton === c)).filter(Boolean);

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `school_${calendarYear}.json`);
  writeFileSync(outFile, JSON.stringify(ordered, null, 2));
  console.log(`  ✓ Written: ${outFile} (${ordered.reduce((s, e) => s + e.holidays.length, 0)} total holiday entries)`);
}

const years = process.argv.slice(2).map(Number).filter(y => y > 2020 && y < 2100);
if (years.length === 0) {
  console.error('Usage: node scripts/fetch-fr-school.js <year> [year2] ...');
  console.error('Example: node scripts/fetch-fr-school.js 2029 2030');
  console.error('Note: data for year N requires academic year N/N+1 to be published by the Ministry.');
  process.exit(1);
}

for (const year of years) await fetchYear(year);
console.log('Done. Remember to bump SEED_VERSION in src/db/store.js after adding new data!');
