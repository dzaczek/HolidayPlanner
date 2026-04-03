import { setLang, getLang, applyTranslations, t } from './i18n/i18n.js';
import { renderCalendar, setYear, getYear, setLayout, setHolidayMap, setLeaveMap } from './calendar/renderer.js';
import { renderPersonsList, showPersonModal } from './persons/person-manager.js';
import { buildHolidayMap } from './holidays/holiday-source.js';
import { showHolidayPicker } from './holidays/holiday-picker.js';
import { renderLeavesPanel, showLeaveModal, buildLeaveMap } from './leaves/leave-manager.js';
import { seedDatabase, ensureYearLoaded } from './db/seed/loader.js';
import { getAllPersons, carryOverPersons, getTemplates, addHolidaysBatch, getHolidaysForPerson, clearAllStores, setSeedVersion } from './db/store.js';
import { generateShareURL, importFromURL, applySharedData } from './share/share.js';
import { showBackupModal } from './share/backup.js';

let calendarContainer;

export async function initApp() {
  await seedDatabase();

  calendarContainer = document.getElementById('calendar-container');

  // Check for shared data in URL
  const shared = await importFromURL();
  if (shared) {
    const year = await applySharedData(shared);
    setYear(year);
    if (shared.lang) setLang(shared.lang);
    window.history.replaceState({}, '', window.location.pathname);
  } else {
    setYear(new Date().getFullYear());
  }

  document.getElementById('current-year').textContent = getYear();

  const langSelect = document.getElementById('lang-select');
  langSelect.value = getLang();

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

function showResetConfirm() {
  const html = `
    <h3>${t('reset.title')}</h3>
    <p class="reset-warning">${t('reset.warning')}</p>
    <p class="reset-info">${t('reset.info')}</p>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-danger" id="reset-confirm">${t('reset.confirm')}</button>
    </div>
  `;
  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.getElementById('reset-confirm').addEventListener('click', async () => {
    await clearAllStores();
    setSeedVersion(0);
    hideModal();
    location.reload();
  });
}
