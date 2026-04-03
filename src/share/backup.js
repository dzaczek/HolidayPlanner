import { getDB } from '../db/schema.js';
import { showModal, hideModal } from '../app.js';
import { t } from '../i18n/i18n.js';
import { exportICS, exportLeavesICS } from './ics-export.js';

/**
 * Export all user data (persons, holidays, leaves) as JSON file download.
 */
async function exportBackup() {
  const db = await getDB();
  const data = {
    version: 1,
    date: new Date().toISOString(),
    persons: await db.getAll('persons'),
    holidays: await db.getAll('holidays'),
    leaves: await db.getAll('leaves'),
  };

  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = `hcp-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Import user data from JSON backup file.
 */
async function importBackup(file) {
  const text = await file.text();
  const data = JSON.parse(text);

  if (!data.version || !data.persons) {
    throw new Error('Invalid backup file');
  }

  const db = await getDB();

  // Clear existing user data
  const tx = db.transaction(['persons', 'holidays', 'leaves'], 'readwrite');
  await tx.objectStore('persons').clear();
  await tx.objectStore('holidays').clear();
  await tx.objectStore('leaves').clear();
  await tx.done;

  // Restore persons with new IDs, build old→new ID map
  const idMap = {};
  const txAdd = db.transaction(['persons', 'holidays', 'leaves'], 'readwrite');

  for (const p of data.persons) {
    const oldId = p.id;
    delete p.id;
    const newId = await txAdd.objectStore('persons').add(p);
    idMap[oldId] = newId;
  }

  // Restore holidays with remapped personIds
  for (const h of (data.holidays || [])) {
    delete h.id;
    h.personId = idMap[h.personId] ?? h.personId;
    await txAdd.objectStore('holidays').add(h);
  }

  // Restore leaves with remapped personIds
  for (const l of (data.leaves || [])) {
    delete l.id;
    l.personIds = (l.personIds || []).map(id => idMap[id] ?? id);
    await txAdd.objectStore('leaves').add(l);
  }

  await txAdd.done;
  return data.persons.length;
}

/**
 * Show backup/restore modal.
 */
export function showBackupModal(onRestore) {
  const html = `
    <h3>${t('backup.title')}</h3>
    <div class="backup-options">
      <button class="btn btn-primary backup-btn" id="backup-download">
        <span class="backup-icon">&#8681;</span>
        ${t('backup.download')}
      </button>
      <div class="backup-divider"></div>
      <label class="btn btn-secondary backup-btn" id="backup-restore-label">
        <span class="backup-icon">&#8679;</span>
        ${t('backup.restore')}
        <input type="file" id="backup-file" accept=".json" style="display:none" />
      </label>
      <div class="backup-divider"></div>
      <p class="backup-section-title">${t('backup.exportCal')}</p>
      <button class="btn btn-secondary backup-btn" id="export-ics-all">
        <span class="backup-icon">&#128197;</span>
        ${t('backup.icsAll')}
      </button>
      <button class="btn btn-secondary backup-btn" id="export-ics-leaves">
        <span class="backup-icon">&#9992;</span>
        ${t('backup.icsLeaves')}
      </button>
      <p class="backup-ics-hint">${t('backup.icsHint')}</p>
      <p id="backup-status" class="backup-status"></p>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.close')}</button>
    </div>
  `;

  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  document.getElementById('backup-download').addEventListener('click', async () => {
    const status = document.getElementById('backup-status');
    status.textContent = '...';
    try {
      await exportBackup();
      status.textContent = '✓';
      status.className = 'backup-status success';
    } catch (err) {
      status.textContent = err.message;
      status.className = 'backup-status error';
    }
  });

  document.getElementById('export-ics-all').addEventListener('click', async () => {
    const status = document.getElementById('backup-status');
    status.textContent = '...';
    try {
      const count = await exportICS();
      status.textContent = `✓ ${count} events`;
      status.className = 'backup-status success';
    } catch (err) {
      status.textContent = err.message;
      status.className = 'backup-status error';
    }
  });

  document.getElementById('export-ics-leaves').addEventListener('click', async () => {
    const status = document.getElementById('backup-status');
    status.textContent = '...';
    try {
      const count = await exportLeavesICS();
      status.textContent = `✓ ${count} events`;
      status.className = 'backup-status success';
    } catch (err) {
      status.textContent = err.message;
      status.className = 'backup-status error';
    }
  });

  document.getElementById('backup-file').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const status = document.getElementById('backup-status');
    status.textContent = '...';
    try {
      const count = await importBackup(file);
      status.textContent = `✓ ${count} persons`;
      status.className = 'backup-status success';
      hideModal();
      if (onRestore) onRestore();
    } catch (err) {
      status.textContent = err.message;
      status.className = 'backup-status error';
    }
  });
}
