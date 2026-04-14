import { t } from '../i18n/i18n.js';
import { sanitizeColor } from '../utils.js';
import { addPerson, deletePerson, getAllPersons, updatePerson, getHolidaysForPerson, deleteHoliday, deleteHolidaysForPerson, isSeeded } from '../db/store.js';
import { getAllGemeinden } from '../db/store.js';
import { showModal, hideModal } from '../app.js';
import { showHolidayPicker } from '../holidays/holiday-picker.js';
import { countTotalDaysOff } from '../holidays/workday-counter.js';
import { recordPersonDeletion } from '../sync/tombstone.js';

// 12 pastel colors, mutually contrasting, calendar-friendly
const PERSON_COLORS = [
  '#7CB9E8', // pastel blue
  '#F4A6A0', // pastel red/coral
  '#A8D5A2', // pastel green
  '#F6C87E', // pastel orange
  '#C3A6D8', // pastel purple
  '#80D4C1', // pastel teal
  '#F9B4D6', // pastel pink
  '#B8C97E', // pastel olive
  '#8ECAE6', // pastel sky
  '#E8B87E', // pastel amber
  '#A0C4E8', // pastel steel
  '#D4A8C0', // pastel mauve
];
let colorIndex = 0;

export async function renderPersonsList(year, onChange) {
  const list = document.getElementById('persons-list');
  list.innerHTML = '';

  const persons = await getAllPersons(year);

  for (const person of persons) {
    const { holidayWorkdays, leaveNetWorkdays, total } = await countTotalDaysOff(person, year);

    const li = document.createElement('li');
    li.className = 'person-item';

    li.innerHTML = `
      <div class="person-color-dot" style="background-color: ${sanitizeColor(person.color)}"></div>
      <div class="person-info">
        <div class="person-name">${escapeHtml(person.name)}</div>
        <div class="person-meta">${t(`category.${person.category}`)} / ${escapeHtml(person.gemeindeName || person.gemeinde)}</div>
        <div class="person-days-off">${t('persons.daysOff')}: ${total} <span class="days-off-detail">(${holidayWorkdays} + ${leaveNetWorkdays})</span></div>
      </div>
      <div class="person-actions">
        <button class="btn-person-add-days" title="${t('holidays.manual')}">+</button>
        <button class="btn-person-clear" title="${t('holidays.clearAll')}">&#128465;</button>
        <button class="btn-person-edit" title="${t('persons.edit')}">&#9998;</button>
        <button class="btn-person-delete" title="${t('persons.remove')}">&#10005;</button>
      </div>
    `;

    li.querySelector('.btn-person-add-days').addEventListener('click', () => {
      if (onChange) onChange('add-days', person);
    });

    li.querySelector('.btn-person-clear').addEventListener('click', async () => {
      if (!confirm(t('holidays.clearConfirm'))) return;
      await deleteHolidaysForPerson(person.id);
      if (onChange) onChange('refresh');
    });

    li.querySelector('.btn-person-edit').addEventListener('click', () => {
      showPersonModal(year, person, onChange);
    });

    li.querySelector('.btn-person-delete').addEventListener('click', async () => {
      recordPersonDeletion(person);
      await deletePerson(person.id);
      if (onChange) onChange('refresh');
    });

    list.appendChild(li);
  }
}

export async function showPersonModal(year, existingPerson, onChange) {
  let gemeinden = await getAllGemeinden();

  // If no gemeinden yet, wait for seed to finish (progressive load support)
  if (gemeinden.length === 0 && !(await isSeeded())) {
    console.log('[HCP] showPersonModal: waiting for gemeinden seed...');
    // We could use a more elegant event-based wait, but a simple retry-loop is robust here
    while (gemeinden.length === 0) {
      await new Promise(r => setTimeout(r, 500));
      gemeinden = await getAllGemeinden();
    }
  }

  const isEdit = !!existingPerson;
  const person = existingPerson || {
    name: '',
    category: 'worker',
    gemeinde: gemeinden[0]?.id || '',
    color: PERSON_COLORS[colorIndex++ % PERSON_COLORS.length],
    year,
  };

  const html = `
    <h3>${isEdit ? t('persons.edit') : t('persons.add')}</h3>
    <div class="form-group">
      <label>${t('persons.name')}</label>
      <input type="text" id="modal-person-name" value="${escapeHtml(person.name)}" />
    </div>
    <div class="form-group">
      <label>${t('persons.category')}</label>
      <select id="modal-person-category">
        <option value="worker" ${person.category === 'worker' ? 'selected' : ''}>${t('category.worker')}</option>
        <option value="student" ${person.category === 'student' ? 'selected' : ''}>${t('category.student')}</option>
        <option value="school" ${person.category === 'school' ? 'selected' : ''}>${t('category.school')}</option>
      </select>
    </div>
    <div class="form-group">
      <label>${t('persons.gemeinde')}</label>
      <input type="text" id="modal-gemeinde-search" placeholder="Name / PLZ..." autocomplete="off" value="${isEdit ? escapeHtml(person.gemeindeName || '') : ''}" />
      <input type="hidden" id="modal-person-gemeinde" value="${person.gemeinde}" />
      <ul id="gemeinde-dropdown" class="gemeinde-dropdown"></ul>
    </div>
    <div class="form-group">
      <label>${t('persons.color')}</label>
      <div class="color-picker">
        <div class="color-swatches" id="color-swatches">
          ${PERSON_COLORS.map(c => `<button type="button" class="color-swatch${person.color === c ? ' active' : ''}" style="background:${c}" data-color="${c}"></button>`).join('')}
          <button type="button" class="color-swatch color-swatch-custom${!PERSON_COLORS.includes(person.color) && person.color ? ' active' : ''}" title="Custom">
            <span>...</span>
          </button>
        </div>
        <input type="color" id="modal-person-color" value="${person.color}" class="color-input-hidden" />
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="modal-save">${t('btn.save')}</button>
    </div>
  `;

  showModal(html);

  // Color picker
  const colorInput = document.getElementById('modal-person-color');
  document.querySelectorAll('.color-swatch[data-color]').forEach(swatch => {
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      colorInput.value = swatch.dataset.color;
    });
  });
  document.querySelector('.color-swatch-custom').addEventListener('click', () => {
    colorInput.click();
  });
  colorInput.addEventListener('input', () => {
    document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
    document.querySelector('.color-swatch-custom').classList.add('active');
    document.querySelector('.color-swatch-custom').style.background = colorInput.value;
  });

  // Gemeinde autocomplete
  const searchInput = document.getElementById('modal-gemeinde-search');
  const hiddenInput = document.getElementById('modal-person-gemeinde');
  const dropdown = document.getElementById('gemeinde-dropdown');

  console.log(`[HCP] Gemeinden loaded for autocomplete: ${gemeinden.length}`);

  function renderDropdown(query) {
    const q = (query || '').toLowerCase().trim();
    dropdown.innerHTML = '';

    let matches;
    if (!q) {
      // Show first 20 when empty (so user sees the list exists)
      matches = gemeinden.slice(0, 20);
    } else {
      matches = gemeinden.filter(g =>
        g.name.toLowerCase().includes(q) ||
        (g.canton && g.canton.toLowerCase().includes(q)) ||
        (g.country && g.country.toLowerCase().includes(q)) ||
        (g.plz && g.plz.some(p => p.startsWith(q)))
      ).slice(0, 30);
    }

    if (matches.length === 0) {
      dropdown.style.display = 'none';
      return;
    }

    dropdown.style.display = 'block';
    for (const g of matches) {
      const li = document.createElement('li');
      const plzStr = g.plz?.length ? g.plz[0] : '';
      const cantonStr = g.canton || '';
      const countryStr = g.country || '';
      const regionParts = [cantonStr, countryStr].filter(Boolean).join(', ');
      const regionLabel = regionParts ? ` (${regionParts})` : '';
      li.textContent = `${g.name}${regionLabel}${plzStr ? ' — ' + plzStr : ''}`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hiddenInput.value = g.id;
        searchInput.value = `${g.name}${regionLabel}`;
        dropdown.style.display = 'none';
      });
      dropdown.appendChild(li);
    }
  }

  searchInput.addEventListener('input', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('focus', () => renderDropdown(searchInput.value));
  searchInput.addEventListener('blur', () => { setTimeout(() => dropdown.style.display = 'none', 200); });

  document.getElementById('modal-cancel').addEventListener('click', hideModal);
  document.getElementById('modal-save').addEventListener('click', async () => {
    const name = document.getElementById('modal-person-name').value.trim();
    if (!name) return;

    const gemeinde = document.getElementById('modal-person-gemeinde').value;
    const gemeindeObj = gemeinden.find(g => g.id === gemeinde);

    const data = {
      ...person,
      name,
      category: document.getElementById('modal-person-category').value,
      gemeinde,
      gemeindeName: gemeindeObj?.name || gemeinde,
      color: document.getElementById('modal-person-color').value,
      year,
    };

    if (isEdit) {
      const categoryChanged = data.category !== person.category;
      const gemeindeChanged = data.gemeinde !== person.gemeinde;

      await updatePerson(data);

      // If category or Gemeinde changed, delete old menu holidays and re-assign
      if (categoryChanged || gemeindeChanged) {
        const oldHolidays = await getHolidaysForPerson(data.id, year);
        for (const h of oldHolidays) {
          if (h.source === 'menu') await deleteHoliday(h.id);
        }
        hideModal();
        // Trigger auto-assign with new category/gemeinde
        if (onChange) onChange('reassign', data);
      } else {
        hideModal();
        if (onChange) onChange('refresh');
      }
    } else {
      const newId = await addPerson(data);
      data.id = newId;
      hideModal();
      // Immediately open holiday picker with all templates pre-checked
      showHolidayPicker(data, year, () => {
        if (onChange) onChange('refresh');
      }, { autoChecked: true });
    }
  });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
