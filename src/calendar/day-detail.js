import { t, getLang } from '../i18n/i18n.js';
import { showModal, hideModal } from '../app.js';
import { getAllPersons, addHolidaysBatch, getHolidaysForYear, deleteHoliday } from '../db/store.js';
import { escapeHtml, sanitizeColor } from '../utils.js';
import { showLeaveModal } from '../leaves/leave-manager.js';

/**
 * Show a day-detail popup when clicking a calendar day cell.
 * Shows holidays and leaves for that date, and allows adding new ones.
 */
export function showDayDetail(dateStr, holidayMap, leaveMap, year, onChanged) {
  const date = new Date(dateStr + 'T00:00:00');
  const lang = getLang();

  const dayName = date.toLocaleDateString(lang, { weekday: 'long' });
  const dateDisplay = date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

  const holidays = holidayMap[dateStr] || [];
  const leaves = leaveMap[dateStr] || [];

  // Group holidays by person
  const holidayRows = holidays.map((h, i) => {
    const label = typeof h.label === 'object' ? (h.label[lang] || h.label.de || '') : (h.label || '');
    const canDelete = h.source === 'manual' && h.id != null;
    return `<div class="dd-row" data-h-index="${i}">
      <span class="dd-dot" style="background:${sanitizeColor(h.color)}"></span>
      <span class="dd-person">${escapeHtml(h.personName)}</span>
      <span class="dd-label">${escapeHtml(label)}</span>
      ${canDelete ? `<button class="btn-dd-delete" data-h-id="${h.id}" title="${t('btn.delete')}">&#10005;</button>` : ''}
    </div>`;
  }).join('');

  // Group leaves
  const leaveRows = leaves.map(l => {
    return `<div class="dd-row">
      <span class="dd-colors">${l.colors.map(c => `<span class="dd-dot" style="background:${sanitizeColor(c)}"></span>`).join('')}</span>
      <span class="dd-label">${escapeHtml(l.label || t('leaves.title'))}</span>
    </div>`;
  }).join('');

  const html = `
    <div class="day-detail">
      <h3>${dayName}, ${dateDisplay}</h3>

      <div class="dd-section">
        <h4>${t('day.holidays')}</h4>
        ${holidayRows || `<p class="dd-empty">${t('day.none')}</p>`}
      </div>

      <div class="dd-section">
        <h4>${t('day.leaves')}</h4>
        ${leaveRows || `<p class="dd-empty">${t('day.none')}</p>`}
      </div>

      <div class="dd-actions-section">
        <button class="btn btn-primary btn-sm" id="dd-add-holiday">${t('day.addHoliday')}</button>
        <button class="btn btn-secondary btn-sm" id="dd-add-leave">${t('day.addLeave')}</button>
      </div>

      <div class="modal-actions">
        <button class="btn btn-secondary" id="modal-cancel">${t('btn.close')}</button>
      </div>
    </div>
  `;

  showModal(html);
  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  // Delete manual holidays directly from day detail
  document.querySelectorAll('.btn-dd-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = parseInt(btn.dataset.hId);
      await deleteHoliday(id);
      hideModal();
      if (onChanged) onChanged();
    });
  });

  document.getElementById('dd-add-holiday').addEventListener('click', async () => {
    hideModal();
    showAddHolidayForDay(dateStr, year, onChanged);
  });

  document.getElementById('dd-add-leave').addEventListener('click', async () => {
    hideModal();
    const persons = await getAllPersons(year);
    // Pass null for new leave; showLeaveModal will use defaults, we override dates after
    showLeaveModal(year, persons, null, () => { if (onChanged) onChanged(); }, dateStr);
  });
}

/**
 * Show modal to add a holiday (day off) for selected persons on a specific date.
 */
async function showAddHolidayForDay(dateStr, year, onChanged) {
  const persons = await getAllPersons(year);
  const existingHolidays = await getHolidaysForYear(year);

  // Find which persons already have a holiday on this date
  const personsWithHoliday = new Set();
  for (const h of existingHolidays) {
    if (h.date === dateStr) personsWithHoliday.add(h.personId);
  }

  const personCheckboxes = persons.map(p => {
    const hasIt = personsWithHoliday.has(p.id);
    return `<label class="leave-person-option ${hasIt ? 'dd-already' : ''}">
      <input type="checkbox" value="${p.id}" ${hasIt ? 'disabled checked' : ''} />
      <span class="dd-dot" style="background:${sanitizeColor(p.color)}"></span>
      <span>${escapeHtml(p.name)}</span>
      ${hasIt ? '<span class="dd-existing-mark">&#10003;</span>' : ''}
    </label>`;
  }).join('');

  const date = new Date(dateStr + 'T00:00:00');
  const lang = getLang();
  const dateDisplay = date.toLocaleDateString(lang, { day: 'numeric', month: 'long', year: 'numeric' });

  const html = `
    <h3>${t('day.addHoliday')}</h3>
    <p class="dd-date-hint">${dateDisplay}</p>
    <div class="form-group">
      <label>${t('day.label')}</label>
      <input type="text" id="dd-holiday-label" placeholder="${t('day.labelPlaceholder')}" />
    </div>
    <div class="form-group">
      <label>${t('leaves.persons')}</label>
      <div class="leave-persons-list">
        ${personCheckboxes || `<p class="dd-empty">${t('day.noPersons')}</p>`}
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="dd-save">${t('btn.save')}</button>
    </div>
  `;

  showModal(html);
  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  document.getElementById('dd-save').addEventListener('click', async () => {
    const label = document.getElementById('dd-holiday-label').value.trim() || t('day.manualHoliday');
    const selected = [];
    document.querySelectorAll('.leave-person-option input:checked:not(:disabled)').forEach(cb => {
      selected.push(parseInt(cb.value));
    });

    if (selected.length === 0) {
      hideModal();
      return;
    }

    const holidays = selected.map(personId => ({
      personId,
      date: dateStr,
      source: 'manual',
      label,
      year,
      style: 'striped',
    }));

    await addHolidaysBatch(holidays);
    hideModal();
    if (onChanged) onChanged();
  });
}
