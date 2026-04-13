/**
 * Leave tombstones — track deletions so sync doesn't re-add removed leaves.
 *
 * Stored in localStorage as [{sig, deletedAt}].
 * Tombstones expire after EXPIRE_DAYS to prevent unbounded growth.
 */

const LS_KEY = 'hcp-leave-tombstones';
const EXPIRE_DAYS = 60;

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

/** Returns non-expired tombstones from localStorage. */
export function getTombstones() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    const cutoff = Date.now() - EXPIRE_DAYS * 86_400_000;
    return JSON.parse(raw).filter(t => new Date(t.deletedAt).getTime() > cutoff);
  } catch {
    return [];
  }
}

export function saveTombstones(tombstones) {
  localStorage.setItem(LS_KEY, JSON.stringify(tombstones));
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
