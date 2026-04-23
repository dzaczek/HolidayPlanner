import { getDB } from './schema.js';
import { logger } from '../utils.js';

// === Persons ===

export async function getAllPersons(year) {
  const db = await getDB();
  return db.getAllFromIndex('persons', 'by-year', year);
}

export async function addPerson(person) {
  const db = await getDB();
  return db.add('persons', person);
}

export async function updatePerson(person) {
  const db = await getDB();
  return db.put('persons', person);
}

/**
 * Copy persons from sourceYear to targetYear (with their properties, without holidays).
 * Only copies persons not already present in targetYear (matched by name + category + gemeinde).
 * Returns count of newly copied persons.
 */
export async function carryOverPersons(sourceYear, targetYear) {
  const db = await getDB();
  const existing = await db.getAllFromIndex('persons', 'by-year', targetYear);
  const source = await db.getAllFromIndex('persons', 'by-year', sourceYear);
  if (source.length === 0) return 0;

  // Build set of existing person signatures to avoid duplicates
  const existingKeys = new Set(
    existing.map(p => `${p.name}|${p.category}|${p.gemeinde}`)
  );

  const toAdd = source.filter(p => {
    const key = `${p.name}|${p.category}|${p.gemeinde}`;
    const exists = existingKeys.has(key);
    if (exists) {
      logger.debug(`[HCP] carryOver skip (exists): ${key}`);
    }
    return !exists;
  });

  logger.debug(`[HCP] carryOver ${sourceYear}→${targetYear}: source=${source.length}, existing=${existing.length}, toAdd=${toAdd.length}`);
  if (toAdd.length === 0) return 0;

  const tx = db.transaction('persons', 'readwrite');
  for (const p of toAdd) {
    const { id, ...rest } = p;
    await tx.store.add({ ...rest, year: targetYear });
  }
  await tx.done;
  return toAdd.length;
}

export async function deletePerson(id) {
  const db = await getDB();
  // Delete person's holidays too
  const holidays = await db.getAllFromIndex('holidays', 'by-person', id);
  const tx = db.transaction(['persons', 'holidays'], 'readwrite');
  await tx.objectStore('persons').delete(id);
  for (const h of holidays) {
    await tx.objectStore('holidays').delete(h.id);
  }
  await tx.done;
}

// === Holidays ===

export async function getHolidaysForPerson(personId, year) {
  const db = await getDB();
  return db.getAllFromIndex('holidays', 'by-person-year', [personId, year]);
}

export async function getHolidaysForYear(year) {
  const db = await getDB();
  return db.getAllFromIndex('holidays', 'by-year', year);
}

export async function addHoliday(holiday) {
  const db = await getDB();
  return db.add('holidays', holiday);
}

export async function addHolidaysBatch(holidays) {
  const db = await getDB();
  const tx = db.transaction('holidays', 'readwrite');
  for (const h of holidays) {
    tx.store.add(h);
  }
  await tx.done;
}

export async function deleteHoliday(id) {
  const db = await getDB();
  return db.delete('holidays', id);
}

export async function deleteHolidaysForPerson(personId) {
  const db = await getDB();
  const holidays = await db.getAllFromIndex('holidays', 'by-person', personId);
  const tx = db.transaction('holidays', 'readwrite');
  for (const h of holidays) {
    await tx.store.delete(h.id);
  }
  await tx.done;
}

export async function deleteManualHolidaysForPerson(personId) {
  const db = await getDB();
  const holidays = await db.getAllFromIndex('holidays', 'by-person', personId);
  const tx = db.transaction('holidays', 'readwrite');
  for (const h of holidays) {
    if (h.source === 'manual') await tx.store.delete(h.id);
  }
  await tx.done;
}

// === Holiday Templates ===

export async function getTemplates(category, gemeinde, year) {
  const db = await getDB();
  return db.getAllFromIndex('holidayTemplates', 'by-cat-gem-year', [category, gemeinde, year]);
}

export async function getAllTemplatesForYear(year) {
  const db = await getDB();
  return db.getAllFromIndex('holidayTemplates', 'by-year', year);
}

export async function hasTemplatesForYear(year) {
  const db = await getDB();
  const tx = db.transaction('holidayTemplates', 'readonly');
  const index = tx.store.index('by-year');
  const all = await index.getAll(year);
  return all.some(t => t.category === 'worker');
}

export async function clearYearTemplates(year) {
  const db = await getDB();
  const all = await db.getAllFromIndex('holidayTemplates', 'by-year', year);
  const tx = db.transaction('holidayTemplates', 'readwrite');
  for (const t of all) {
    await tx.store.delete(t.id);
  }
  await tx.done;
}

export async function addTemplate(template) {
  const db = await getDB();
  return db.add('holidayTemplates', template);
}

export async function addTemplatesBatch(templates) {
  const db = await getDB();
  const tx = db.transaction('holidayTemplates', 'readwrite');
  for (const t of templates) {
    tx.store.add(t);
  }
  await tx.done;
}

// === Gemeinden ===

export async function getAllGemeinden() {
  const db = await getDB();
  return db.getAll('gemeinden');
}

export async function getGemeindenByCountry(country) {
  const db = await getDB();
  return db.getAllFromIndex('gemeinden', 'by-country', country);
}

export async function addGemeinde(gemeinde) {
  const db = await getDB();
  return db.put('gemeinden', gemeinde);
}

export async function addGemeindenBatch(gemeinden) {
  const db = await getDB();
  const tx = db.transaction('gemeinden', 'readwrite');
  for (const g of gemeinden) {
    tx.store.put(g);
  }
  await tx.done;
}

// === Leaves (vacation periods) ===

export async function getAllLeaves(year) {
  const db = await getDB();
  return db.getAllFromIndex('leaves', 'by-year', year);
}

export async function addLeave(leave) {
  const db = await getDB();
  return db.add('leaves', leave);
}

export async function updateLeave(leave) {
  const db = await getDB();
  return db.put('leaves', leave);
}

export async function deleteLeave(id) {
  const db = await getDB();
  return db.delete('leaves', id);
}

// === Seed check ===

export const SEED_VERSION = 22; // per-canton template storage (100x fewer DB entries)

export async function getSeedVersion() {
  try {
    return parseInt(localStorage.getItem('hcp-seed-version') || '0');
  } catch {
    return 0;
  }
}

export function setSeedVersion(v) {
  localStorage.setItem('hcp-seed-version', String(v));
}

export async function isSeeded() {
  return (await getSeedVersion()) >= SEED_VERSION;
}

/**
 * Clear only seed data (gemeinden + templates).
 * Preserves user data: persons, holidays, leaves.
 */
export async function clearUserStores() {
  const db = await getDB();
  const tx = db.transaction(['persons', 'holidays', 'leaves'], 'readwrite');
  await tx.objectStore('persons').clear();
  await tx.objectStore('holidays').clear();
  await tx.objectStore('leaves').clear();
  await tx.done;
}

export async function clearSeedStores() {
  const db = await getDB();
  const tx = db.transaction(['gemeinden', 'holidayTemplates'], 'readwrite');
  await tx.objectStore('gemeinden').clear();
  await tx.objectStore('holidayTemplates').clear();
  await tx.done;
}

/**
 * Clear everything including user data. Only for full reset.
 */
export async function clearAllStores() {
  const db = await getDB();
  const storeNames = [...db.objectStoreNames];
  const tx = db.transaction(storeNames, 'readwrite');
  for (const name of storeNames) {
    await tx.objectStore(name).clear();
  }
  await tx.done;
}


// --- Tasks ---

export async function getAllTaskLists() {
  const db = await getDB();
  return db.getAll('taskLists');
}

export async function saveTaskList(taskList) {
  const db = await getDB();
  await db.put('taskLists', taskList);
}

export async function deleteTaskList(id) {
  const db = await getDB();
  await db.delete('taskLists', id);
}

export async function getTaskList(id) {
  const db = await getDB();
  return db.get('taskLists', id);
}
