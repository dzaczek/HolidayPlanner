import { addGemeindenBatch, addTemplatesBatch, isSeeded, clearSeedStores, setSeedVersion, hasTemplatesForYear, clearYearTemplates, SEED_VERSION } from '../store.js';
import { logger } from '../../utils.js';

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
  pl: {
    school: import.meta.glob('./holidays/pl/school_*.json'),
    workers: import.meta.glob('./holidays/pl/workers_*.json'),
    students: () => import('./holidays/pl/students.json').catch(() => ({ default: [] })),
  },
  si: {
    school: import.meta.glob('./holidays/si/school_*.json'),
    workers: import.meta.glob('./holidays/si/workers_*.json'),
    students: () => import('./holidays/si/students.json').catch(() => ({ default: [] })),
  },
  galaxy: {
    school: import.meta.glob('./holidays/galaxy/school_*.json'),
    workers: import.meta.glob('./holidays/galaxy/workers_*.json'),
    students: () => import('./holidays/galaxy/students.json').catch(() => ({ default: [] })),
  },
};

// Country codes derived from registered modules
const COUNTRIES = Object.keys(countryModules);

let gemeindenCache = null;

async function getGemeinden() {
  if (!gemeindenCache) gemeindenCache = await loadGemeinden();
  return gemeindenCache;
}

// In-memory lock to prevent concurrent loads for the same year
const loadingYears = new Set();

/**
 * Initial seed: only Gemeinden (once).
 */
export async function seedDatabase(onProgress) {
  if (await isSeeded()) return;

  logger.debug('[HCP] Seeding Gemeinden...');
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
  logger.debug(`[HCP] Seeded ${gemeinden.length} Gemeinden`);
  if (onProgress) onProgress('done', 100);
}

/**
 * Ensure holiday templates for a given year are loaded.
 * Called on year change - loads only if not already in IndexedDB.
 * Iterates over all registered countries.
 */
function getTemplatesVersion(year) {
  return parseInt(localStorage.getItem(`hcp-templates-v-${year}`) || '0');
}
function setTemplatesVersion(year, v) {
  localStorage.setItem(`hcp-templates-v-${year}`, String(v));
}

export async function ensureYearLoaded(year, onProgress) {
  // Prevent concurrent loads for the same year (re-entry guard)
  if (loadingYears.has(year)) return;
  // If templates exist for this year AND were built with the current SEED_VERSION, skip.
  if (await hasTemplatesForYear(year) && getTemplatesVersion(year) >= SEED_VERSION) return;

  loadingYears.add(year);
  try {
    // Templates are stale or missing — force a reload for this year.
    await clearYearTemplates(year);

    if (onProgress) onProgress('loading', 0);
    const templates = [];

    for (const country of COUNTRIES) {
      const mods = countryModules[country];

      // School holidays — stored keyed by canton code (e.g. 'ZH', 'BY', 'MZ')
      if (onProgress) onProgress('school', 20);
      const schoolKey = Object.keys(mods.school).find(k => k.includes(`school_${year}`));
      if (schoolKey) {
        const mod = await mods.school[schoolKey]();
        const entries = mod.default || mod;
        expandEntries(entries, 'school', '#4CAF50', templates);
      }

      // Worker holidays — stored keyed by canton code
      if (onProgress) onProgress('worker', 50);
      const workerKey = Object.keys(mods.workers).find(k => k.includes(`workers_${year}`));
      if (workerKey) {
        const mod = await mods.workers[workerKey]();
        const entries = mod.default || mod;
        expandEntries(entries, 'worker', '#FF9800', templates);
      }

      // Student holidays — stored keyed by specific gemeinde_id (university)
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
      const CHUNK = 2000;
      for (let i = 0; i < templates.length; i += CHUNK) {
        await addTemplatesBatch(templates.slice(i, i + CHUNK));
        if (onProgress) onProgress('saving', 70 + Math.round((i / templates.length) * 30));
      }
      logger.debug(`[HCP] Loaded ${templates.length} templates for ${year}`);
    }

    setTemplatesVersion(year, SEED_VERSION);
    if (onProgress) onProgress('done', 100);
  } finally {
    loadingYears.delete(year);
  }
}

// Store templates keyed by canton code (e.g. 'ZH', 'BY', 'MZ') — not by individual municipality.
// This reduces template count from ~300K to ~3K entries per year.
function expandEntries(entries, category, color, out) {
  for (const entry of entries) {
    for (const holiday of entry.holidays) {
      out.push({
        category,
        gemeinde: entry.canton,
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
