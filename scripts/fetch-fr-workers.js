#!/usr/bin/env node
/**
 * fetch-fr-workers.js
 * Fetches French public holidays from the official etalab API and writes
 * src/db/seed/holidays/fr/workers_YEAR.json
 *
 * Usage:
 *   node scripts/fetch-fr-workers.js 2029
 *   node scripts/fetch-fr-workers.js 2029 2030 2031
 *
 * Sources:
 *   https://calendrier.api.gouv.fr/jours-feries/metropole/YEAR.json
 *   https://calendrier.api.gouv.fr/jours-feries/alsace-moselle/YEAR.json
 */

import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, '../src/db/seed/holidays/fr');

const HOLIDAY_NAMES = {
  '1er janvier':           { fr: "Jour de l'An",        de: 'Neujahrstag',          en: "New Year's Day" },
  'Lundi de Pâques':       { fr: 'Lundi de Pâques',     de: 'Ostermontag',           en: 'Easter Monday' },
  '1er mai':               { fr: 'Fête du Travail',      de: 'Tag der Arbeit',        en: 'Labour Day' },
  '8 mai':                 { fr: 'Victoire 1945',        de: 'Tag des Sieges 1945',   en: 'Victory in Europe Day' },
  'Ascension':             { fr: 'Ascension',            de: 'Christi Himmelfahrt',   en: 'Ascension Day' },
  'Lundi de Pentecôte':    { fr: 'Lundi de Pentecôte',  de: 'Pfingstmontag',         en: 'Whit Monday' },
  '14 juillet':            { fr: 'Fête Nationale',       de: 'Nationalfeiertag',      en: 'Bastille Day' },
  'Assomption':            { fr: 'Assomption',           de: 'Mariä Himmelfahrt',     en: 'Assumption of Mary' },
  'Toussaint':             { fr: 'Toussaint',            de: 'Allerheiligen',         en: "All Saints' Day" },
  '11 novembre':           { fr: 'Armistice 1918',       de: 'Waffenstillstand 1918', en: 'Armistice Day' },
  'Jour de Noël':          { fr: 'Noël',                 de: 'Weihnachtstag',         en: 'Christmas Day' },
  // Alsace-Moselle extras
  'Vendredi saint':        { fr: 'Vendredi Saint',       de: 'Karfreitag',            en: 'Good Friday' },
  "2ème jour de Noël":     { fr: '2ème jour de Noël',   de: '2. Weihnachtstag',      en: '2nd Christmas Day' },
};

async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.json();
}

function buildHolidays(rawJson) {
  return Object.entries(rawJson).map(([date, label]) => {
    const name = HOLIDAY_NAMES[label] ?? { fr: label, de: label, en: label };
    return { name, start: date, end: date, type: 'public_holiday' };
  });
}

async function fetchYear(year) {
  console.log(`Fetching year ${year}…`);

  const [metro, am] = await Promise.all([
    fetchJSON(`https://calendrier.api.gouv.fr/jours-feries/metropole/${year}.json`),
    fetchJSON(`https://calendrier.api.gouv.fr/jours-feries/alsace-moselle/${year}.json`),
  ]);

  const nationalHolidays = buildHolidays(metro);
  const amHolidays = buildHolidays(am);   // superset of national

  const result = [
    { canton: 'Zone-A',    year, category: 'worker', holidays: nationalHolidays },
    { canton: 'Zone-B',    year, category: 'worker', holidays: nationalHolidays },
    { canton: 'Zone-B-AM', year, category: 'worker', holidays: amHolidays },
    { canton: 'Zone-C',    year, category: 'worker', holidays: nationalHolidays },
  ];

  mkdirSync(OUT_DIR, { recursive: true });
  const outFile = join(OUT_DIR, `workers_${year}.json`);
  writeFileSync(outFile, JSON.stringify(result, null, 2));
  console.log(`  ✓ Written: ${outFile}`);
}

const years = process.argv.slice(2).map(Number).filter(y => y > 2020 && y < 2100);
if (years.length === 0) {
  console.error('Usage: node scripts/fetch-fr-workers.js <year> [year2] ...');
  console.error('Example: node scripts/fetch-fr-workers.js 2029 2030');
  process.exit(1);
}

for (const year of years) await fetchYear(year);
console.log('Done.');
