/**
 * HCP Family Sync — E2EE calendar synchronization
 *
 * Flow:
 *  Create:  generate calendarId + AES-256 key → build family code → push initial state
 *  Join:    parse family code → pull remote → merge with local → save family code
 *  Sync:    pull remote → smart-merge → push merged state
 */

import { t } from '../i18n/i18n.js';
import { showModal, hideModal } from '../app.js';
import { getAllPersons, getHolidaysForYear, getAllLeaves, addPerson, addHolidaysBatch, addLeave, clearUserStores } from '../db/store.js';
import { getYear } from '../calendar/renderer.js';
import { generateKey, generateCalendarId, encryptPayload, decryptPayload, buildFamilyCode, parseFamilyCode } from './crypto.js';
import { pushCalendar, pullCalendar, getFamilyCode, setFamilyCode, clearFamilyCode, getLastSync, getEndpoint, setEndpoint } from './cloud-store.js';
import { getTombstones, saveTombstones, mergeTombstones, leaveSig } from './tombstone.js';
import { escapeHtml } from '../utils.js';

// ── Public API ───────────────────────────────────────────────────────────────

export async function showFamilySyncModal(onChanged) {
  const code = getFamilyCode();
  if (code) {
    await showSyncStatusModal(code, onChanged);
  } else {
    showSetupModal(onChanged);
  }
}

// ── Setup modal (create / join) ──────────────────────────────────────────────

function showSetupModal(onChanged) {
  const html = `
    <h3>${t('sync.title')}</h3>
    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:16px;">${t('sync.intro')}</p>

    <div class="sync-tabs">
      <button class="sync-tab active" id="tab-create-btn">${t('sync.create')}</button>
      <button class="sync-tab" id="tab-join-btn">${t('sync.join')}</button>
    </div>

    <div id="tab-create">
      <p class="sync-hint">${t('sync.createHint')}</p>
      <button class="btn btn-primary" id="sync-do-create" style="width:100%; margin-top:8px;">${t('sync.createBtn')}</button>
    </div>

    <div id="tab-join" style="display:none;">
      <p class="sync-hint">${t('sync.joinHint')}</p>
      <textarea id="sync-join-code" rows="3" placeholder="hcp_xxxx_xxxx" style="font-family:monospace; font-size:0.8rem; width:100%; margin-top:8px;"></textarea>
      <button class="btn btn-primary" id="sync-do-join" style="width:100%; margin-top:8px;">${t('sync.joinBtn')}</button>
    </div>

    <div id="sync-setup-status" class="sync-status-msg" style="display:none;"></div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
    </div>
  `;

  showModal(html);
  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  // Tabs
  document.getElementById('tab-create-btn').addEventListener('click', () => {
    document.getElementById('tab-create').style.display = '';
    document.getElementById('tab-join').style.display = 'none';
    document.getElementById('tab-create-btn').classList.add('active');
    document.getElementById('tab-join-btn').classList.remove('active');
  });
  document.getElementById('tab-join-btn').addEventListener('click', () => {
    document.getElementById('tab-create').style.display = 'none';
    document.getElementById('tab-join').style.display = '';
    document.getElementById('tab-join-btn').classList.add('active');
    document.getElementById('tab-create-btn').classList.remove('active');
  });

  document.getElementById('sync-do-create').addEventListener('click', async () => {
    const btn = document.getElementById('sync-do-create');
    const status = document.getElementById('sync-setup-status');
    btn.disabled = true;
    btn.textContent = '...';
    status.style.display = '';
    status.className = 'sync-status-msg sync-info';
    status.textContent = t('sync.creating');

    try {
      const calendarId = generateCalendarId();
      const cryptoKey = await generateKey();
      const code = await buildFamilyCode(calendarId, cryptoKey);

      // Push initial state
      const payload = await buildPayload();
      const encrypted = await encryptPayload(cryptoKey, payload);
      await pushCalendar(calendarId, encrypted);

      setFamilyCode(code);
      hideModal();
      await showSyncStatusModal(code, onChanged);
    } catch (err) {
      console.error('[HCP Sync] Create failed:', err);
      status.className = 'sync-status-msg sync-error';
      status.textContent = `${err.message} (endpoint: ${getEndpoint()})`;
      btn.disabled = false;
      btn.textContent = t('sync.createBtn');
    }
  });

  document.getElementById('sync-do-join').addEventListener('click', async () => {
    const btn = document.getElementById('sync-do-join');
    const status = document.getElementById('sync-setup-status');
    const codeInput = document.getElementById('sync-join-code').value.trim();
    btn.disabled = true;
    status.style.display = '';
    status.className = 'sync-status-msg sync-info';
    status.textContent = t('sync.joining');

    try {
      await joinFamilySyncCode(codeInput, onChanged);
    } catch (err) {
      status.className = 'sync-status-msg sync-error';
      status.textContent = err.message;
      btn.disabled = false;
    }
  });
}

export async function joinFamilySyncCode(codeInput, onChanged) {
  const { calendarId, cryptoKey } = await parseFamilyCode(codeInput);

  // Pull remote
  const remote = await pullCalendar(calendarId);
  if (remote) {
    const remotePayload = await decryptPayload(cryptoKey, remote);
    const local = await buildPayload();
    const merged = mergePayloads(local, remotePayload);
    // Save merged data to local DB before pushing
    await applyPayloadToLocalDB(merged);
    const mergedEnc = await encryptPayload(cryptoKey, merged);
    await pushCalendar(calendarId, mergedEnc);
  }

  setFamilyCode(codeInput);
  hideModal();
  if (onChanged) onChanged();
  await showSyncStatusModal(codeInput, onChanged);
}

function saveEndpoint() {
  const val = document.getElementById('sync-endpoint')?.value.trim();
  if (val) setEndpoint(val);
}

// ── Status modal (already paired) ───────────────────────────────────────────

async function showSyncStatusModal(code, onChanged) {
  const { calendarId } = await parseFamilyCode(code);
  const lastSync = getLastSync();
  const lastSyncStr = lastSync ? new Date(lastSync).toLocaleString() : '—';

  const html = `
    <h3>${t('sync.title')}</h3>

    <div class="sync-status-card">
      <div class="sync-status-row">
        <span class="sync-dot sync-dot-ok"></span>
        <span>${t('sync.paired')}: <code>${escapeHtml(calendarId)}</code></span>
      </div>
      <div class="sync-status-row" style="margin-top:4px; font-size:0.75rem; color:var(--text-muted);">
        ${t('sync.lastSync')}: ${escapeHtml(lastSyncStr)}
      </div>
    </div>

    <div class="sync-code-block">
      <label style="font-size:0.75rem; color:var(--text-muted);">${t('sync.familyCode')}</label>
      <div class="sync-code-display">
        <code id="sync-code-text" style="word-break:break-all; font-size:0.72rem;">${escapeHtml(code)}</code>
      </div>
      <div style="display:flex; gap:8px; margin-top:8px;">
        <button class="btn btn-secondary btn-sm" id="sync-copy-code" style="flex:1;">${t('sync.copyCode')}</button>
        <button class="btn btn-secondary btn-sm" id="sync-copy-link" style="flex:1;">${t('sync.copyLink')}</button>
      </div>
      <p class="sync-hint">${t('sync.codeHint')}</p>
    </div>

    <div style="display:flex; gap:8px; margin-top:16px; flex-wrap:wrap;">
      <button class="btn btn-primary" id="sync-do-sync" style="flex:1;">${t('sync.syncNow')}</button>
      <button class="btn btn-secondary" id="sync-do-push" style="flex:1;">${t('sync.pushOnly')}</button>
    </div>

    <div id="sync-run-status" class="sync-status-msg" style="display:none; margin-top:8px;"></div>

    <div class="modal-actions">
      <button class="btn btn-danger btn-sm" id="sync-leave">${t('sync.leave')}</button>
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.close')}</button>
    </div>
  `;

  showModal(html);
  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  document.getElementById('sync-copy-code').addEventListener('click', () => {
    navigator.clipboard.writeText(code).then(() => {
      document.getElementById('sync-copy-code').textContent = '✓';
      setTimeout(() => { document.getElementById('sync-copy-code').textContent = t('sync.copyCode'); }, 1500);
    });
  });

  document.getElementById('sync-copy-link').addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.hash = '';
    url.search = '';
    url.searchParams.set('sync', code);
    navigator.clipboard.writeText(url.toString()).then(() => {
      document.getElementById('sync-copy-link').textContent = '✓';
      setTimeout(() => { document.getElementById('sync-copy-link').textContent = t('sync.copyLink'); }, 1500);
    });
  });

  document.getElementById('sync-do-sync').addEventListener('click', async () => {
    await runSync({ code, pushAfterMerge: true, onChanged });
  });

  document.getElementById('sync-do-push').addEventListener('click', async () => {
    await runSync({ code, pushAfterMerge: false, onChanged });
  });

  document.getElementById('sync-leave').addEventListener('click', () => {
    clearFamilyCode();
    hideModal();
  });
}

// ── Sync logic ───────────────────────────────────────────────────────────────

async function runSync({ code, pushAfterMerge, onChanged }) {
  const status = document.getElementById('sync-run-status');
  const btn = document.getElementById('sync-do-sync');
  const pushBtn = document.getElementById('sync-do-push');
  if (status) { status.style.display = ''; status.className = 'sync-status-msg sync-info'; status.textContent = t('sync.syncing'); }
  if (btn) btn.disabled = true;
  if (pushBtn) pushBtn.disabled = true;

  try {
    const { calendarId, cryptoKey } = await parseFamilyCode(code);
    const local = await buildPayload();

    if (pushAfterMerge) {
      // Pull → merge → apply locally → push
      const remote = await pullCalendar(calendarId);
      let merged = local;
      if (remote) {
        const remotePayload = await decryptPayload(cryptoKey, remote);
        merged = mergePayloads(local, remotePayload);
        await applyPayloadToLocalDB(merged);
      }
      const encrypted = await encryptPayload(cryptoKey, merged);
      await pushCalendar(calendarId, encrypted);
    } else {
      // Push only (overwrite remote with local — no local DB change)
      const encrypted = await encryptPayload(cryptoKey, local);
      await pushCalendar(calendarId, encrypted);
    }

    if (status) { status.className = 'sync-status-msg sync-ok'; status.textContent = '✓ ' + t('sync.done'); }
    if (onChanged) onChanged();
  } catch (err) {
    if (status) { status.className = 'sync-status-msg sync-error'; status.textContent = err.message; }
  } finally {
    if (btn) btn.disabled = false;
    if (pushBtn) pushBtn.disabled = false;
  }
}

// ── Data helpers ─────────────────────────────────────────────────────────────

async function buildPayload() {
  const year = getYear();
  const persons = await getAllPersons(year);
  const holidays = await getHolidaysForYear(year);
  const leaves = await getAllLeaves(year);
  const tombstones = getTombstones();
  return { year, persons, holidays, leaves, tombstones, updatedAt: new Date().toISOString() };
}

/**
 * Smart merge: union of persons (by name+category+gemeinde),
 * union of leaves (by label+startDate+endDate),
 * union of holidays (by personId+date — newer overrides older).
 * Always uses local year as authoritative.
 */
function mergePayloads(local, remote) {
  const year = local.year;

  // Merge persons: keep all unique by signature
  const personSig = p => `${p.name}|${p.category}|${p.gemeinde}`;
  const personMap = new Map();
  for (const p of [...local.persons, ...remote.persons]) {
    const sig = personSig(p);
    if (!personMap.has(sig)) personMap.set(sig, p);
  }
  const persons = Array.from(personMap.values()).map((p, i) => ({ ...p, id: i + 1, year }));

  // Build old→new ID remaps
  const localRemap = buildIdRemap(local.persons, persons, personSig);
  const remoteRemap = buildIdRemap(remote.persons, persons, personSig);

  // Merge holidays: by personId+date, newer timestamp wins (fall back to local)
  const holidayMap = new Map();
  const addHolidays = (holidays, remap, isRemote) => {
    for (const h of holidays) {
      const newId = remap.get(h.personId);
      if (newId == null) continue;
      const key = `${newId}|${h.date}`;
      if (!holidayMap.has(key) || isRemote) {
        holidayMap.set(key, { ...h, personId: newId, year, id: undefined });
      }
    }
  };
  addHolidays(remote.holidays, remoteRemap, true);
  addHolidays(local.holidays, localRemap, false); // local wins on conflict
  const holidays = Array.from(holidayMap.values());

  // Merge tombstones from both sides
  const tombstones = mergeTombstones(local.tombstones || [], remote.tombstones || []);
  const tombstoneSet = new Set(tombstones.map(t => t.sig));

  // Merge leaves: unique by label+startDate+endDate, exclude tombstoned entries
  const leaveMap = new Map();
  const addLeaves = (leaves, remap) => {
    for (const l of leaves) {
      const sig = leaveSig(l);
      if (tombstoneSet.has(sig)) continue; // deleted — don't restore
      if (!leaveMap.has(sig)) {
        leaveMap.set(sig, {
          ...l,
          id: undefined,
          year,
          personIds: (l.personIds || []).map(pid => remap.get(pid)).filter(Boolean),
        });
      }
    }
  };
  addLeaves(local.leaves, localRemap);
  addLeaves(remote.leaves, remoteRemap);
  const leaves = Array.from(leaveMap.values());

  return { year, persons, holidays, leaves, tombstones, updatedAt: new Date().toISOString() };
}

/**
 * Write a payload (persons + holidays + leaves) into local IndexedDB,
 * replacing all existing user data for the current year.
 *
 * Persons keep their explicit numeric IDs (holidays reference them via personId).
 * Holidays and leaves drop their id field so IDB auto-assigns a fresh key
 * (prevents "not a valid key" error when id is undefined or stale).
 */
async function applyPayloadToLocalDB(payload) {
  await clearUserStores();
  for (const { id, ...p } of payload.persons) {
    await addPerson({ id, ...p });
  }
  // Strip id (was undefined from merge) so IDB autoIncrement works correctly
  const holidays = payload.holidays.map(({ id: _id, ...h }) => h);
  if (holidays.length) await addHolidaysBatch(holidays);
  for (const { id: _id, ...l } of payload.leaves) {
    await addLeave(l);
  }
  // Persist merged tombstones so future syncs remember deletions
  if (payload.tombstones) saveTombstones(payload.tombstones);
}

/**
 * Lightweight sync for header quick-buttons (no modal UI).
 * @param {boolean} pushAfterMerge  true = pull+merge+push, false = push only
 * @param {Function} onChanged  called on success
 * @returns {{ ok: boolean, error?: string }}
 */
/**
 * Lightweight sync for header quick-buttons (no modal UI).
 * mode: 'push'  — push local to remote (no pull)
 *       'pull'  — pull remote, merge, apply locally (no push back)
 *       'sync'  — pull + merge + apply + push (full sync)
 */
export async function quickSync(mode, onChanged) {
  const code = getFamilyCode();
  if (!code) return { ok: false, error: 'No family code' };
  try {
    const { calendarId, cryptoKey } = await parseFamilyCode(code);
    const local = await buildPayload();

    if (mode === 'push') {
      const encrypted = await encryptPayload(cryptoKey, local);
      await pushCalendar(calendarId, encrypted);

    } else if (mode === 'pull') {
      const remote = await pullCalendar(calendarId);
      if (remote) {
        const remotePayload = await decryptPayload(cryptoKey, remote);
        const merged = mergePayloads(local, remotePayload);
        await applyPayloadToLocalDB(merged);
      }

    } else { // 'sync'
      const remote = await pullCalendar(calendarId);
      if (remote) {
        const remotePayload = await decryptPayload(cryptoKey, remote);
        const merged = mergePayloads(local, remotePayload);
        await applyPayloadToLocalDB(merged);
        const encrypted = await encryptPayload(cryptoKey, merged);
        await pushCalendar(calendarId, encrypted);
      } else {
        const encrypted = await encryptPayload(cryptoKey, local);
        await pushCalendar(calendarId, encrypted);
      }
    }

    if (onChanged) onChanged();
    return { ok: true };
  } catch (err) {
    console.error('[HCP Sync] quickSync failed:', err);
    return { ok: false, error: err.message };
  }
}

function buildIdRemap(originalPersons, mergedPersons, sigFn) {
  const map = new Map();
  for (const orig of originalPersons) {
    const merged = mergedPersons.find(m => sigFn(m) === sigFn(orig));
    if (merged) map.set(orig.id, merged.id);
  }
  return map;
}
