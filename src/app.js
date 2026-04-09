import { setLang, getLang, applyTranslations, t } from './i18n/i18n.js';
import { renderCalendar, setYear, getYear, setLayout, setHolidayMap, setLeaveMap, setDayChangedCallback } from './calendar/renderer.js';
import { renderPersonsList, showPersonModal } from './persons/person-manager.js';
import { buildHolidayMap } from './holidays/holiday-source.js';
import { showHolidayPicker } from './holidays/holiday-picker.js';
import { renderLeavesPanel, showLeaveModal, buildLeaveMap } from './leaves/leave-manager.js';
import { seedDatabase, ensureYearLoaded } from './db/seed/loader.js';
import { getAllPersons, carryOverPersons, getTemplates, addHolidaysBatch, getHolidaysForPerson, clearAllStores, clearUserStores, setSeedVersion } from './db/store.js';
import { generateShareURL, importFromURL, applySharedData } from './share/share.js';
import { showBackupModal, exportBackup } from './share/backup.js';
import { exportPDF } from './share/pdf-export.js';

let calendarContainer;

export async function initApp() {
  await seedDatabase();

  calendarContainer = document.getElementById('calendar-container');

  // Check for shared data in URL
  const shared = await importFromURL();
  if (shared) {
    const accepted = await showShareImportConfirm();
    if (accepted) {
      await clearUserStores();
      const year = await applySharedData(shared);
      setYear(year);
      if (shared.lang) setLang(shared.lang);
    } else {
      setYear(new Date().getFullYear());
    }
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    setYear(new Date().getFullYear());
  }

  document.getElementById('current-year').textContent = getYear();

  const langSelect = document.getElementById('lang-select');
  langSelect.value = getLang();

  // Default to 12x1 on mobile
  if (window.innerWidth <= 900) {
    setLayout('12x1');
    document.getElementById('layout-select').value = '12x1';
  }

  setDayChangedCallback(() => refreshAll());
  applyTranslations();
  bindControls();
  await refreshAll();
}

function bindControls() {
  document.getElementById('prev-year').addEventListener('click', async () => {
    const prevYear = getYear();
    setYear(getYear() - 1);
    document.getElementById('current-year').textContent = getYear();
    await tryCarryOver(prevYear, getYear());
    await refreshAll();
  });

  document.getElementById('next-year').addEventListener('click', async () => {
    const prevYear = getYear();
    setYear(getYear() + 1);
    document.getElementById('current-year').textContent = getYear();
    await tryCarryOver(prevYear, getYear());
    await refreshAll();
  });

  document.getElementById('layout-select').addEventListener('change', (e) => {
    setLayout(e.target.value);
    renderCalendar(calendarContainer);
  });

  document.getElementById('lang-select').addEventListener('change', async (e) => {
    setLang(e.target.value);
    await refreshAll();
  });

  document.getElementById('pdf-btn').addEventListener('click', async () => {
    const btn = document.getElementById('pdf-btn');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      await exportPDF();
    } catch (err) {
      console.error('[HCP] PDF export failed:', err);
    }
    btn.innerHTML = '&#128196; PDF';
    btn.disabled = false;
  });

  document.getElementById('about-btn').addEventListener('click', () => {
    showAbout();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    showResetConfirm();
  });

  document.getElementById('backup-btn').addEventListener('click', () => {
    showBackupModal(() => refreshAll());
  });

  document.getElementById('share-btn').addEventListener('click', async () => {
    const btn = document.getElementById('share-btn');
    btn.disabled = true;
    btn.textContent = '...';
    try {
      const url = await generateShareURL();
      await navigator.clipboard.writeText(url);
      btn.textContent = 'Copied!';
      setTimeout(() => { btn.innerHTML = '&#8599; Share'; btn.disabled = false; }, 2000);
    } catch (err) {
      // Fallback: show in prompt
      const url = await generateShareURL();
      prompt('Share URL:', url);
      btn.innerHTML = '&#8599; Share';
      btn.disabled = false;
    }
  });

  document.getElementById('add-person-btn').addEventListener('click', () => {
    showPersonModal(getYear(), null, handlePersonChange);
  });

  document.getElementById('add-leave-btn').addEventListener('click', async () => {
    const persons = await getAllPersons(getYear());
    showLeaveModal(getYear(), persons, null, handleLeaveChange);
  });
}

async function handlePersonChange(action, person) {
  if (action === 'add-days' && person) {
    showHolidayPicker(person, getYear(), () => refreshAll(), { autoChecked: false });
  } else if (action === 'reassign' && person) {
    // Category or Gemeinde changed — re-assign holidays from new templates
    await autoAssignSinglePerson(person, getYear());
    await refreshAll();
  } else {
    await refreshAll();
  }
}

async function autoAssignSinglePerson(person, year) {
  const templates = await getTemplates(person.category, person.gemeinde, year);
  let extraTemplates = [];
  if (person.category === 'school' || person.category === 'student') {
    extraTemplates = await getTemplates('worker', person.gemeinde, year);
  }
  const allTemplates = [...templates, ...extraTemplates];
  const holidays = [];
  const seen = new Set();
  for (const tmpl of allTemplates) {
    const start = new Date(tmpl.startDate + 'T00:00:00');
    const end = new Date(tmpl.endDate + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (seen.has(dateStr)) continue;
      seen.add(dateStr);
      holidays.push({ personId: person.id, date: dateStr, source: 'menu', label: tmpl.name, year });
    }
  }
  if (holidays.length > 0) await addHolidaysBatch(holidays);
}

async function handleLeaveChange() {
  await refreshAll();
}

async function tryCarryOver(fromYear, toYear) {
  await carryOverPersons(fromYear, toYear);
}

/**
 * For each person in the year, if they have no holidays yet,
 * auto-assign from templates.
 * School kids get: school holidays + worker (public) holidays.
 * Workers get: worker holidays.
 * Students get: student holidays + worker holidays.
 */
async function autoAssignHolidays(year) {
  const persons = await getAllPersons(year);
  let assigned = 0;

  for (const person of persons) {
    // Skip if already has holidays
    const existing = await getHolidaysForPerson(person.id, year);
    if (existing.length > 0) continue;

    // Get templates for person's own category
    const templates = await getTemplates(person.category, person.gemeinde, year);
    console.log(`[HCP] autoAssign ${person.name} (${person.category}, gem=${person.gemeinde}): ${templates.length} templates`);

    // School kids and students also get public holidays (worker category)
    let extraTemplates = [];
    if (person.category === 'school' || person.category === 'student') {
      extraTemplates = await getTemplates('worker', person.gemeinde, year);
    }

    const allTemplates = [...templates, ...extraTemplates];
    const holidays = [];
    const seen = new Set(); // deduplicate dates

    for (const tmpl of allTemplates) {
      const start = new Date(tmpl.startDate + 'T00:00:00');
      const end = new Date(tmpl.endDate + 'T00:00:00');
      for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
        const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (seen.has(dateStr)) continue;
        seen.add(dateStr);
        holidays.push({
          personId: person.id,
          date: dateStr,
          source: 'menu',
          label: tmpl.name,
          year,
        });
      }
    }

    if (holidays.length > 0) {
      await addHolidaysBatch(holidays);
      assigned++;
    }
  }

  if (assigned > 0) {
    console.log(`[HCP] Auto-assigned holidays for ${assigned} persons in ${year}`);
  }
}

async function refreshAll() {
  const year = getYear();

  await ensureYearLoaded(year, showLoadingProgress);
  hideLoading();

  await autoAssignHolidays(year);
  const persons = await getAllPersons(year);

  const hMap = await buildHolidayMap(year);
  setHolidayMap(hMap);

  const lMap = await buildLeaveMap(year, persons);
  setLeaveMap(lMap);

  renderCalendar(calendarContainer);
  await renderPersonsList(year, handlePersonChange);
  await renderLeavesPanel(year, persons, handleLeaveChange);
  applyTranslations();
}

// === Loading indicator ===

const STEP_LABELS = {
  loading: 'Loading…',
  school: 'School holidays…',
  worker: 'Public holidays…',
  saving: 'Saving…',
  done: '',
};

function showLoadingProgress(step, pct) {
  let bar = document.getElementById('loading-bar');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'loading-bar';
    bar.innerHTML = '<div class="loading-fill"></div><span class="loading-text"></span>';
    document.getElementById('calendar-container').prepend(bar);
  }
  bar.style.display = '';
  bar.querySelector('.loading-fill').style.width = `${pct}%`;
  bar.querySelector('.loading-text').textContent = STEP_LABELS[step] || step;
}

function hideLoading() {
  const bar = document.getElementById('loading-bar');
  if (bar) bar.style.display = 'none';
}

export function showModal(html) {
  const overlay = document.getElementById('modal-overlay');
  const modal = document.getElementById('modal');
  modal.innerHTML = html;
  overlay.classList.remove('hidden');

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) hideModal();
  }, { once: true });
}

export function hideModal() {
  const overlay = document.getElementById('modal-overlay');
  overlay.classList.add('hidden');
  document.getElementById('modal').innerHTML = '';
}

function showShareImportConfirm() {
  return new Promise((resolve) => {
    const html = `
      <h3>${t('share.import.title')}</h3>
      <p class="reset-warning">${t('share.import.warning')}</p>
      <p class="reset-info">${t('share.import.info')}</p>
      <div class="modal-actions">
        <button class="btn btn-secondary" id="share-cancel">${t('btn.cancel')}</button>
        <button class="btn btn-primary" id="share-confirm">${t('share.import.confirm')}</button>
      </div>
    `;
    showModal(html);

    document.getElementById('share-cancel').addEventListener('click', () => {
      hideModal();
      resolve(false);
    });
    document.getElementById('share-confirm').addEventListener('click', () => {
      hideModal();
      resolve(true);
    });

    // Also handle overlay click as cancel
    document.getElementById('modal-overlay').addEventListener('click', (e) => {
      if (e.target === document.getElementById('modal-overlay')) {
        hideModal();
        resolve(false);
      }
    }, { once: true });
  });
}

function showAbout() {
  const html = `
    <h3>${t('about.title')}</h3>
    <p>${t('about.intro')}</p>
    <ul class="about-features">
      <li>${t('about.feature.view')}</li>
      <li>${t('about.feature.clarity')}</li>
      <li>${t('about.feature.family')}</li>
    </ul>

    <h4 style="margin-top:16px">${t('about.howto.title')}</h4>
    <ol class="about-instructions">
      <li>${t('about.howto.step1')}</li>
      <li>${t('about.howto.step2')}</li>
      <li>${t('about.howto.step3')}</li>
      <li>${t('about.howto.step4')}</li>
    </ol>

    <div style="margin-top:16px; padding:12px; background:#f0f9ff; border:1px solid #bae6fd; border-radius:var(--radius);">
      <p style="font-size:0.85rem; font-weight:600; margin-bottom:6px;">Open Source — MIT License</p>
      <p style="font-size:0.8rem; line-height:1.5;">${t('about.opensource')}</p>
      <p style="font-size:0.8rem; line-height:1.5; margin-top:6px; color:#b45309; font-weight:500;">${t('about.bugs')}</p>
    </div>

    <div class="about-links" style="margin-top:12px; display:flex; gap:12px; flex-wrap:wrap;">
      <a href="https://github.com/dzaczek/HolidayPlanner" target="_blank" rel="noopener" class="btn btn-secondary">${t('about.github')}</a>
      <a href="https://github.com/dzaczek/HolidayPlanner/issues" target="_blank" rel="noopener" class="btn btn-secondary">${t('about.issues')}</a>
    </div>

    <p class="about-version" style="margin-top:12px; font-size:12px; color:var(--text-muted);">${t('about.version')}: ${document.getElementById('app-version')?.textContent || '?'}</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.close')}</button>
    </div>
  `;
  showModal(html);
  document.getElementById('modal-cancel').addEventListener('click', hideModal);
}

function showResetConfirm() {
  const html = `
    <h3>${t('reset.title')}</h3>
    <p class="reset-warning">${t('reset.warning')}</p>
    <p class="reset-info">${t('reset.info')}</p>
    <p class="reset-info" style="margin-top:8px; color:#16a34a; font-weight:500;">${t('reset.backup')}</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-danger" id="reset-confirm">${t('reset.confirm')}</button>
    </div>
  `;
  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.getElementById('reset-confirm').addEventListener('click', async () => {
    await exportBackup();
    await clearAllStores();
    setSeedVersion(0);
    hideModal();
    location.reload();
  });
}
