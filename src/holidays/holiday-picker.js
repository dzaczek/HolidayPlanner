import { t, getLang } from '../i18n/i18n.js';
import { addHolidaysBatch, getHolidaysForPerson, deleteHoliday, deleteManualHolidaysForPerson } from '../db/store.js';
import { getAvailableTemplates, expandTemplateToDates } from './holiday-source.js';
import { showModal, hideModal } from '../app.js';
import { startPlacementMode } from '../calendar/drag-drop.js';

function formatDateNice(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}. ${d.toLocaleString(getLang(), { month: 'short' })}`;
}

function countDays(start, end) {
  return Math.round((new Date(end + 'T00:00:00') - new Date(start + 'T00:00:00')) / 86400000) + 1;
}

/**
 * Show unified holiday picker for a person.
 * Shows:
 *  - Tab "From database": templates with current check state (checked if person already has them)
 *  - Tab "Manual": existing manual holidays (editable/deletable) + add new
 */
export async function showHolidayPicker(person, year, onDone, { autoChecked = true } = {}) {
  const templates = await getAvailableTemplates(person, year);
  const existingHolidays = await getHolidaysForPerson(person.id, year);
  const lang = getLang();

  // Build set of dates person already has from menu source
  const existingMenuDates = new Set();
  for (const h of existingHolidays) {
    if (h.source === 'menu') existingMenuDates.add(h.date);
  }

  // Check which templates are already assigned (by checking if any date of template is in existing)
  const templateChecked = templates.map(tmpl => {
    if (autoChecked && existingHolidays.length === 0) return true; // new person: all checked
    const dates = expandTemplateToDates(tmpl);
    return dates.some(d => existingMenuDates.has(d));
  });

  // Existing manual holidays (grouped by label+style+portion)
  const manualHolidays = existingHolidays.filter(h => h.source === 'manual');
  const manualGroups = [];
  const groupMap = {};
  for (const h of manualHolidays) {
    const key = `${h.label || ''}|${h.style || 'solid'}|${h.portion || 100}`;
    if (!groupMap[key]) {
      groupMap[key] = { label: h.label || '', style: h.style || 'solid', portion: h.portion || 100, dates: [], ids: [] };
      manualGroups.push(groupMap[key]);
    }
    groupMap[key].dates.push(h.date);
    groupMap[key].ids.push(h.id);
  }
  // Sort dates within groups and compute range
  for (const g of manualGroups) {
    g.dates.sort();
    g.from = g.dates[0];
    g.to = g.dates[g.dates.length - 1];
  }

  // === Build HTML ===
  const templateOptions = templates.map((tmpl, i) => {
    const name = typeof tmpl.name === 'object' ? (tmpl.name[lang] || tmpl.name.de) : tmpl.name;
    const days = countDays(tmpl.startDate, tmpl.endDate);
    const from = formatDateNice(tmpl.startDate);
    const to = formatDateNice(tmpl.endDate);
    const typeIcon = tmpl.type === 'public_holiday' ? '&#9733;' : '&#9776;';
    const checked = templateChecked[i] ? 'checked' : '';

    return `<label class="template-option" data-type="${tmpl.type}">
      <input type="checkbox" data-index="${i}" ${checked} />
      <span class="template-icon">${typeIcon}</span>
      <div class="template-info">
        <span class="template-name">${escapeHtml(name)}</span>
        <span class="template-range">${from} — ${to}<span class="template-days">${days} ${t('holidays.days')}</span></span>
      </div>
    </label>`;
  }).join('');

  const allChecked = templateChecked.every(c => c);
  const someChecked = templateChecked.some(c => c);

  const manualListHtml = manualGroups.map((g, i) => {
    const styleLabel = g.style === 'striped' ? t('holidays.styleStriped') : t('holidays.styleSolid');
    const portionLabel = g.portion === 50 ? '50%' : '100%';
    return `<div class="manual-entry" data-group="${i}">
      <div class="manual-entry-info">
        <span class="manual-entry-label">${escapeHtml(g.label || '—')}</span>
        <span class="manual-entry-dates">${formatDateNice(g.from)} — ${formatDateNice(g.to)} (${g.dates.length}d)</span>
        <span class="manual-entry-meta">${styleLabel} / ${portionLabel}</span>
      </div>
      <button class="btn-manual-delete" data-group="${i}" title="${t('btn.delete')}">&#10005;</button>
    </div>`;
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
            <label class="template-select-all"><input type="checkbox" id="select-all" ${allChecked ? 'checked' : ''} ${someChecked && !allChecked ? 'indeterminate' : ''} /> <span>${t('holidays.selectAll')}</span></label>
          </div>
          <div class="template-list">${templateOptions}</div>`
        : '<p class="template-empty">—</p>'}
    </div>

    <div id="tab-manual" class="picker-tab-content" style="display:none;">
      ${manualGroups.length > 0 ? `
        <div class="manual-existing">
          <div class="manual-existing-header">
            <h4>${t('holidays.existing')}</h4>
            <button class="btn btn-danger btn-sm" id="btn-clear-all-manual">${t('holidays.clearManual')}</button>
          </div>
          ${manualListHtml}
        </div>
        <hr class="manual-divider" />
      ` : ''}

      <h4>${t('holidays.addNew')}</h4>
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
        <div class="manual-options">
          <div class="form-group">
            <label>${t('holidays.style')}</label>
            <div class="radio-row">
              <label class="radio-opt"><input type="radio" name="manual-style" value="solid" checked /> ${t('holidays.styleSolid')}</label>
              <label class="radio-opt"><input type="radio" name="manual-style" value="striped" /> ${t('holidays.styleStriped')}</label>
            </div>
          </div>
          <div class="form-group">
            <label>${t('holidays.portion')}</label>
            <div class="radio-row">
              <label class="radio-opt"><input type="radio" name="manual-portion" value="100" checked /> 100%</label>
              <label class="radio-opt"><input type="radio" name="manual-portion" value="50" /> 50%</label>
            </div>
          </div>
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
        <div class="manual-options">
          <div class="form-group">
            <label>${t('holidays.style')}</label>
            <div class="radio-row">
              <label class="radio-opt"><input type="radio" name="place-style" value="solid" checked /> ${t('holidays.styleSolid')}</label>
              <label class="radio-opt"><input type="radio" name="place-style" value="striped" /> ${t('holidays.styleStriped')}</label>
            </div>
          </div>
          <div class="form-group">
            <label>${t('holidays.portion')}</label>
            <div class="radio-row">
              <label class="radio-opt"><input type="radio" name="place-portion" value="100" checked /> 100%</label>
              <label class="radio-opt"><input type="radio" name="place-portion" value="50" /> 50%</label>
            </div>
          </div>
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

  // Track deleted manual groups
  const deletedGroups = new Set();

  // Delete manual holiday group buttons
  document.querySelectorAll('.btn-manual-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const gi = parseInt(btn.dataset.group);
      const group = manualGroups[gi];
      for (const id of group.ids) {
        await deleteHoliday(id);
      }
      deletedGroups.add(gi);
      btn.closest('.manual-entry').remove();
    });
  });

  // Clear all manual holidays at once
  document.getElementById('btn-clear-all-manual')?.addEventListener('click', async () => {
    if (!confirm(t('holidays.clearConfirm'))) return;
    await deleteManualHolidaysForPerson(person.id);
    hideModal();
    if (onDone) onDone();
  });

  // Manual mode toggle
  let manualMode = 'range';
  document.querySelectorAll('.manual-mode-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      manualMode = btn.dataset.mode;
      document.querySelectorAll('.manual-mode-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('manual-range').style.display = manualMode === 'range' ? '' : 'none';
      document.getElementById('manual-place').style.display = manualMode === 'place' ? '' : 'none';
      const saveBtn = document.getElementById('modal-save');
      saveBtn.textContent = manualMode === 'place' ? t('holidays.placeBtn') : t('btn.save');
    });
  });

  // Select all toggle
  const selectAll = document.getElementById('select-all');
  if (selectAll) {
    // Fix indeterminate state on load
    if (someChecked && !allChecked) selectAll.indeterminate = true;

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
      // Sync menu holidays: delete unchecked, add newly checked
      const checkedNow = new Set();
      document.querySelectorAll('#tab-menu .template-option input[type="checkbox"]').forEach(cb => {
        if (cb.checked) checkedNow.add(parseInt(cb.dataset.index));
      });

      // Delete holidays for templates that were checked before but unchecked now
      for (let i = 0; i < templates.length; i++) {
        if (templateChecked[i] && !checkedNow.has(i)) {
          // Was checked, now unchecked — remove these dates
          const dates = new Set(expandTemplateToDates(templates[i]));
          for (const h of existingHolidays) {
            if (h.source === 'menu' && dates.has(h.date)) {
              await deleteHoliday(h.id);
            }
          }
        }
      }

      // Add holidays for templates that were unchecked before but checked now
      const newHolidays = [];
      for (let i = 0; i < templates.length; i++) {
        if (checkedNow.has(i) && !templateChecked[i]) {
          const tmpl = templates[i];
          const dates = expandTemplateToDates(tmpl);
          for (const date of dates) {
            newHolidays.push({
              personId: person.id,
              date,
              source: 'menu',
              label: tmpl.name,
              year,
            });
          }
        }
      }
      if (newHolidays.length > 0) {
        await addHolidaysBatch(newHolidays);
      }

      hideModal();
      if (onDone) onDone();

    } else if (manualMode === 'range') {
      const from = document.getElementById('manual-from').value;
      const to = document.getElementById('manual-to').value;
      const labelVal = document.getElementById('manual-label').value.trim();
      const style = document.querySelector('input[name="manual-style"]:checked')?.value || 'solid';
      const portion = parseInt(document.querySelector('input[name="manual-portion"]:checked')?.value || '100');

      if (from && to) {
        const holidays = [];
        const start = new Date(from);
        const end = new Date(to);
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          holidays.push({
            personId: person.id,
            date: formatDate(new Date(d)),
            source: 'manual',
            label: labelVal,
            style,
            portion,
            year,
          });
        }
        if (holidays.length > 0) await addHolidaysBatch(holidays);
      }
      hideModal();
      if (onDone) onDone();

    } else {
      const dayCountVal = parseInt(document.getElementById('manual-daycount').value) || 1;
      const labelVal = document.getElementById('manual-place-label').value.trim();
      const style = document.querySelector('input[name="place-style"]:checked')?.value || 'solid';
      const portion = parseInt(document.querySelector('input[name="place-portion"]:checked')?.value || '100');
      hideModal();
      startPlacementMode({ person, dayCount: dayCountVal, label: labelVal, style, portion, year, onDone });
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
