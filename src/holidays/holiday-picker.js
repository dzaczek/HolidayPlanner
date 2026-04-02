import { t, getLang } from '../i18n/i18n.js';
import { addHolidaysBatch } from '../db/store.js';
import { getAvailableTemplates, expandTemplateToDates } from './holiday-source.js';
import { showModal, hideModal } from '../app.js';
import { startPlacementMode } from '../calendar/drag-drop.js';

function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  const day = d.getDate();
  const month = d.toLocaleString(getLang(), { month: 'short' });
  return `${day}. ${month}`;
}

function countDays(start, end) {
  const s = new Date(start + 'T00:00:00');
  const e = new Date(end + 'T00:00:00');
  return Math.round((e - s) / 86400000) + 1;
}

/**
 * Show modal to add holidays for a person.
 * Templates are pre-checked by default. User can uncheck.
 */
export async function showHolidayPicker(person, year, onDone, { autoChecked = true } = {}) {
  const templates = await getAvailableTemplates(person, year);
  const lang = getLang();

  const templateOptions = templates.map((tmpl, i) => {
    const name = typeof tmpl.name === 'object' ? (tmpl.name[lang] || tmpl.name.de) : tmpl.name;
    const days = countDays(tmpl.startDate, tmpl.endDate);
    const from = formatDateNice(tmpl.startDate);
    const to = formatDateNice(tmpl.endDate);
    const typeIcon = tmpl.type === 'public_holiday' ? '&#9733;' : '&#9776;';
    const checked = autoChecked ? 'checked' : '';

    return `<label class="template-option" data-type="${tmpl.type}">
      <input type="checkbox" data-index="${i}" ${checked} />
      <span class="template-icon">${typeIcon}</span>
      <div class="template-info">
        <span class="template-name">${escapeHtml(name)}</span>
        <span class="template-range">${from} — ${to}<span class="template-days">${days} ${t('holidays.days')}</span></span>
      </div>
    </label>`;
  }).join('');

  const html = `
    <h3>${t('holidays.menu')} — ${escapeHtml(person.name)}</h3>
    <div class="picker-tabs">
      <button class="btn btn-secondary picker-tab active" data-tab="menu">${t('holidays.source.menu')}</button>
      <button class="btn btn-secondary picker-tab" data-tab="manual">${t('holidays.source.manual')}</button>
    </div>

    <div id="tab-menu" class="picker-tab-content">
      ${templateOptions
        ? `<div class="template-list-header">
            <label class="template-select-all"><input type="checkbox" id="select-all" ${autoChecked ? 'checked' : ''} /> <span>${t('holidays.selectAll') || 'Alle'}</span></label>
          </div>
          <div class="template-list">${templateOptions}</div>`
        : '<p class="template-empty">—</p>'}
    </div>

    <div id="tab-manual" class="picker-tab-content" style="display:none;">
      <div class="manual-mode-toggle">
        <button class="btn btn-secondary manual-mode-btn active" data-mode="range">${t('holidays.modeRange')}</button>
        <button class="btn btn-secondary manual-mode-btn" data-mode="place">${t('holidays.modePlace')}</button>
      </div>

      <div id="manual-range" class="manual-section">
        <div class="form-group">
          <label>${t('holidays.from')}</label>
          <input type="date" id="manual-from" value="${year}-01-01" />
        </div>
        <div class="form-group">
          <label>${t('holidays.to')}</label>
          <input type="date" id="manual-to" value="${year}-01-01" />
        </div>
        <div class="form-group">
          <label>${t('holidays.label')}</label>
          <input type="text" id="manual-label" placeholder="${t('holidays.label')}" />
        </div>
      </div>

      <div id="manual-place" class="manual-section" style="display:none;">
        <div class="form-group">
          <label>${t('holidays.dayCount')}</label>
          <input type="number" id="manual-daycount" min="1" max="365" value="5" />
        </div>
        <div class="form-group">
          <label>${t('holidays.label')}</label>
          <input type="text" id="manual-place-label" placeholder="${t('holidays.label')}" />
        </div>
        <p class="manual-place-hint">${t('holidays.placeHint')}</p>
      </div>
    </div>

    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="modal-save">${t('btn.save')}</button>
    </div>
  `;

  showModal(html);

  // Manual mode toggle (range vs place)
  let manualMode = 'range';
  document.querySelectorAll('.manual-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      manualMode = btn.dataset.mode;
      document.querySelectorAll('.manual-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('manual-range').style.display = manualMode === 'range' ? '' : 'none';
      document.getElementById('manual-place').style.display = manualMode === 'place' ? '' : 'none';
      // Change save button text
      const saveBtn = document.getElementById('modal-save');
      saveBtn.textContent = manualMode === 'place' ? t('holidays.placeBtn') : t('btn.save');
    });
  });

  // Select all toggle
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    selectAll.addEventListener('change', () => {
      document.querySelectorAll('#tab-menu .template-option input[type="checkbox"]').forEach(cb => {
        cb.checked = selectAll.checked;
      });
    });
    document.querySelectorAll('#tab-menu .template-option input[type="checkbox"]').forEach(cb => {
      cb.addEventListener('change', () => {
        const all = document.querySelectorAll('#tab-menu .template-option input[type="checkbox"]');
        const checked = document.querySelectorAll('#tab-menu .template-option input[type="checkbox"]:checked');
        selectAll.checked = all.length === checked.length;
        selectAll.indeterminate = checked.length > 0 && checked.length < all.length;
      });
    });
  }

  // Tab switching
  let activeTab = 'menu';
  document.querySelectorAll('.picker-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeTab = btn.dataset.tab;
      document.querySelectorAll('.picker-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('tab-menu').style.display = activeTab === 'menu' ? '' : 'none';
      document.getElementById('tab-manual').style.display = activeTab === 'manual' ? '' : 'none';
    });
  });

  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  document.getElementById('modal-save').addEventListener('click', async () => {
    if (activeTab === 'menu') {
      const holidays = [];
      const checked = document.querySelectorAll('#tab-menu .template-option input[type="checkbox"]:checked');
      for (const cb of checked) {
        const tmpl = templates[parseInt(cb.dataset.index)];
        const dates = expandTemplateToDates(tmpl);
        for (const date of dates) {
          holidays.push({
            personId: person.id,
            date,
            source: 'menu',
            label: tmpl.name,
            year,
          });
        }
      }
      if (holidays.length > 0) {
        await addHolidaysBatch(holidays);
      }
      hideModal();
      if (onDone) onDone();

    } else if (manualMode === 'range') {
      const from = document.getElementById('manual-from').value;
      const to = document.getElementById('manual-to').value;
      const labelVal = document.getElementById('manual-label').value.trim();
      const holidays = [];

      if (from && to) {
        const start = new Date(from);
        const end = new Date(to);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          holidays.push({
            personId: person.id,
            date: formatDate(new Date(d)),
            source: 'manual',
            label: labelVal,
            year,
          });
        }
      }
      if (holidays.length > 0) {
        await addHolidaysBatch(holidays);
      }
      hideModal();
      if (onDone) onDone();

    } else {
      // Place mode: close modal, enter placement on calendar
      const dayCountVal = parseInt(document.getElementById('manual-daycount').value) || 1;
      const labelVal = document.getElementById('manual-place-label').value.trim();
      hideModal();
      startPlacementMode({
        person,
        dayCount: dayCountVal,
        label: labelVal,
        year,
        onDone,
      });
    }
  });
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
