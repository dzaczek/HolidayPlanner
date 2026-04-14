/**
 * Tombstones — track deletions so sync doesn't re-add removed items.
 *
 * Stored in localStorage as [{sig, deletedAt}].
 * Tombstones expire after EXPIRE_DAYS to prevent unbounded growth.
 */

const LS_KEY_LEAVES = 'hcp-leave-tombstones';
const LS_KEY_PERSONS = 'hcp-person-tombstones';
const EXPIRE_DAYS = 60;

// ── Leaves ───────────────────────────────────────────────────────────────────

export function leaveSig(leave) {
  return `${leave.label}|${leave.startDate}|${leave.endDate}`;
}

/** Call when user deletes a leave — records its signature. */
export function recordLeaveDeletion(leave) {
  const sig = leaveSig(leave);
  const all = getTombstones();
  if (!all.find(t => t.sig === sig)) {
    all.push({ sig, deletedAt: new Date().toISOString() });
    saveTombstones(all);
  }
}

/** Returns non-expired leave tombstones from localStorage. */
export function getTombstones() {
  return _load(LS_KEY_LEAVES);
}

export function saveTombstones(tombstones) {
  localStorage.setItem(LS_KEY_LEAVES, JSON.stringify(tombstones));
}

// ── Persons ──────────────────────────────────────────────────────────────────

export function personSig(person) {
  return `${person.name}|${person.category}|${person.gemeinde}`;
}

/** Call when user deletes a person — records its signature. */
export function recordPersonDeletion(person) {
  const sig = personSig(person);
  const all = getPersonTombstones();
  if (!all.find(t => t.sig === sig)) {
    all.push({ sig, deletedAt: new Date().toISOString() });
    savePersonTombstones(all);
  }
}

/** Returns non-expired person tombstones from localStorage. */
export function getPersonTombstones() {
  return _load(LS_KEY_PERSONS);
}

export function savePersonTombstones(tombstones) {
  localStorage.setItem(LS_KEY_PERSONS, JSON.stringify(tombstones));
}

// ── Shared helpers ────────────────────────────────────────────────────────────

function _load(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const cutoff = Date.now() - EXPIRE_DAYS * 86_400_000;
    return JSON.parse(raw).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

/**
 * Merge two tombstone arrays — keep the most recent entry per sig.
 * Also prune expired entries.
 */
export function mergeTombstones(a, b) {
  const cutoff = Date.now() - EXPIRE_DAYS * 86_400_000;
  const map = new Map();
  for (const t of [...a, ...b]) {
    if (new Date(t.deletedAt).getTime() < cutoff) continue; // skip expired
    const prev = map.get(t.sig);
    if (!prev || t.deletedAt > prev.deletedAt) map.set(t.sig, t);
  }
  return Array.from(map.values());
}
