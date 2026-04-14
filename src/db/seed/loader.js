import { addGemeindenBatch, addTemplatesBatch, isSeeded, clearSeedStores, setSeedVersion, hasTemplatesForYear, SEED_VERSION } from '../store.js';

// Lazy-load gemeinden (large file, ~2MB) — only loaded during seed
const loadGemeinden = () => import('./gemeinden.json').then(m => m.default || m);

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
  fr: {
    school: import.meta.glob('./holidays/fr/school_*.json'),
    workers: import.meta.glob('./holidays/fr/workers_*.json'),
    students: () => Promise.resolve({ default: [] }),
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
let gemeindenCache = null;

async function getGemeinden() {
  if (!gemeindenCache) gemeindenCache = await loadGemeinden();
  return gemeindenCache;
}

async function buildRegionMap() {
  if (regionGemeinden) return regionGemeinden;
  const gemeinden = await getGemeinden();
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
export async function seedDatabase(onProgress) {
  if (await isSeeded()) return;

  console.log('[HCP] Seeding Gemeinden...');
  if (onProgress) onProgress('loading', 0);
  await clearSeedStores();
  const gemeinden = await getGemeinden();

  // Seed in chunks to allow UI to breathe and show progress
  const CHUNK = 3000;
  for (let i = 0; i < gemeinden.length; i += CHUNK) {
    const chunk = gemeinden.slice(i, i + CHUNK);
    await addGemeindenBatch(chunk);
    if (onProgress) {
      onProgress('loading', Math.round((i / gemeinden.length) * 100));
    }
  }

  setSeedVersion(SEED_VERSION);
  console.log(`[HCP] Seeded ${gemeinden.length} Gemeinden`);
  if (onProgress) onProgress('done', 100);
}

/**
 * Ensure holiday templates for a given year are loaded.
 * Called on year change - loads only if not already in IndexedDB.
 * Iterates over all registered countries.
 */
export async function ensureYearLoaded(year, onProgress) {
  if (await hasTemplatesForYear(year)) return;

  if (onProgress) onProgress('loading', 0);
  const rMap = await buildRegionMap();
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
