import { addGemeindenBatch, addTemplatesBatch, isSeeded, clearSeedStores, setSeedVersion, hasTemplatesForYear } from '../store.js';
import gemeinden from './gemeinden.json';
import studentsCH from './holidays/ch/students.json';

// Lazy imports - only loaded when needed
const schoolModules = import.meta.glob('./holidays/ch/school_*.json');
const workerModules = import.meta.glob('./holidays/ch/workers_*.json');

// Canton -> gemeinde IDs (built once)
let cantonGemeinden = null;

function buildCantonMap() {
  if (cantonGemeinden) return cantonGemeinden;
  cantonGemeinden = {};
  for (const g of gemeinden) {
    if (!g.canton) continue;
    if (!cantonGemeinden[g.canton]) cantonGemeinden[g.canton] = [];
    cantonGemeinden[g.canton].push(g.id);
  }
  return cantonGemeinden;
}

/**
 * Initial seed: only Gemeinden (once).
 */
export async function seedDatabase() {
  if (await isSeeded()) return;

  console.log('[HCP] Seeding Gemeinden...');
  await clearSeedStores();
  await addGemeindenBatch(gemeinden);
  setSeedVersion(11);
  console.log(`[HCP] Seeded ${gemeinden.length} Gemeinden`);
}

/**
 * Ensure holiday templates for a given year are loaded.
 * Called on year change - loads only if not already in IndexedDB.
 */
export async function ensureYearLoaded(year, onProgress) {
  if (await hasTemplatesForYear(year)) return;

  if (onProgress) onProgress('loading', 0);
  const cMap = buildCantonMap();
  const templates = [];

  // School holidays
  if (onProgress) onProgress('school', 20);
  const schoolKey = Object.keys(schoolModules).find(k => k.includes(`school_${year}`));
  if (schoolKey) {
    const mod = await schoolModules[schoolKey]();
    const entries = mod.default || mod;
    expandEntries(entries, 'school', '#4CAF50', cMap, templates);
  }

  // Worker holidays
  if (onProgress) onProgress('worker', 50);
  const workerKey = Object.keys(workerModules).find(k => k.includes(`workers_${year}`));
  if (workerKey) {
    const mod = await workerModules[workerKey]();
    const entries = mod.default || mod;
    expandEntries(entries, 'worker', '#FF9800', cMap, templates);
  }

  // Student holidays
  for (const entry of studentsCH) {
    if (entry.year !== year) continue;
    for (const holiday of entry.holidays) {
      templates.push({
        category: entry.category,
        gemeinde: entry.gemeinde_id,
        name: holiday.name,
        startDate: holiday.start,
        endDate: holiday.end,
        type: holiday.type,
        year: entry.year,
        color: '#2196F3',
      });
    }
  }

  if (templates.length > 0) {
    if (onProgress) onProgress('saving', 70);
    const CHUNK = 5000;
    for (let i = 0; i < templates.length; i += CHUNK) {
      await addTemplatesBatch(templates.slice(i, i + CHUNK));
      if (onProgress) onProgress('saving', 70 + Math.round((i / templates.length) * 30));
    }
    console.log(`[HCP] Loaded ${templates.length} templates for ${year}`);
  }

  if (onProgress) onProgress('done', 100);
}

function expandEntries(entries, category, color, cMap, out) {
  for (const entry of entries) {
    const gemeindeIds = cMap[entry.canton] || [entry.canton.toLowerCase()];
    for (const gemId of gemeindeIds) {
      for (const holiday of entry.holidays) {
        out.push({
          category,
          gemeinde: gemId,
          name: holiday.name,
          startDate: holiday.start,
          endDate: holiday.end,
          type: holiday.type,
          year: entry.year,
          color,
        });
      }
    }
  }
}
