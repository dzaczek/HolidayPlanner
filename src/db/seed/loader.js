import { addGemeindenBatch, addTemplatesBatch, isSeeded, clearSeedStores, setSeedVersion, hasTemplatesForYear } from '../store.js';
import gemeinden from './gemeinden.json';

// Lazy imports per country - only loaded when needed
const countryModules = {
  ch: {
    school: import.meta.glob('./holidays/ch/school_*.json'),
    workers: import.meta.glob('./holidays/ch/workers_*.json'),
    students: () => import('./holidays/ch/students.json'),
  },
  de: {
    school: import.meta.glob('./holidays/de/school_*.json'),
    workers: import.meta.glob('./holidays/de/workers_*.json'),
    students: () => import('./holidays/de/students.json').catch(() => ({ default: [] })),
  },
  galaxy: {
    school: import.meta.glob('./holidays/galaxy/school_*.json'),
    workers: import.meta.glob('./holidays/galaxy/workers_*.json'),
    students: () => import('./holidays/galaxy/students.json').catch(() => ({ default: [] })),
  },
};

// Country codes derived from registered modules
const COUNTRIES = Object.keys(countryModules);

// Canton/region -> gemeinde IDs (built once, keyed by country)
let regionGemeinden = null;

function buildRegionMap() {
  if (regionGemeinden) return regionGemeinden;
  regionGemeinden = {};
  for (const g of gemeinden) {
    if (!g.canton) continue;
    const key = g.country || 'CH';
    if (!regionGemeinden[key]) regionGemeinden[key] = {};
    if (!regionGemeinden[key][g.canton]) regionGemeinden[key][g.canton] = [];
    regionGemeinden[key][g.canton].push(g.id);
  }
  return regionGemeinden;
}

/**
 * Initial seed: only Gemeinden (once).
 */
export async function seedDatabase() {
  if (await isSeeded()) return;

  console.log('[HCP] Seeding Gemeinden...');
  await clearSeedStores();
  await addGemeindenBatch(gemeinden);
  setSeedVersion(13);
  console.log(`[HCP] Seeded ${gemeinden.length} Gemeinden`);
}

/**
 * Ensure holiday templates for a given year are loaded.
 * Called on year change - loads only if not already in IndexedDB.
 * Iterates over all registered countries.
 */
export async function ensureYearLoaded(year, onProgress) {
  if (await hasTemplatesForYear(year)) return;

  if (onProgress) onProgress('loading', 0);
  const rMap = buildRegionMap();
  const templates = [];

  for (const country of COUNTRIES) {
    const mods = countryModules[country];
    const cMap = rMap[country.toUpperCase()] || {};

    // School holidays
    if (onProgress) onProgress('school', 20);
    const schoolKey = Object.keys(mods.school).find(k => k.includes(`school_${year}`));
    if (schoolKey) {
      const mod = await mods.school[schoolKey]();
      const entries = mod.default || mod;
      expandEntries(entries, 'school', '#4CAF50', cMap, templates);
    }

    // Worker holidays
    if (onProgress) onProgress('worker', 50);
    const workerKey = Object.keys(mods.workers).find(k => k.includes(`workers_${year}`));
    if (workerKey) {
      const mod = await mods.workers[workerKey]();
      const entries = mod.default || mod;
      expandEntries(entries, 'worker', '#FF9800', cMap, templates);
    }

    // Student holidays
    try {
      const studentMod = await mods.students();
      const studentData = studentMod.default || studentMod;
      for (const entry of studentData) {
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
    } catch { /* no student data for this country */ }
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
