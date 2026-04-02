import { t } from '../i18n/i18n.js';
import { sanitizeColor } from '../utils.js';
import { addPerson, deletePerson, getAllPersons, updatePerson } from '../db/store.js';
import { getAllGemeinden } from '../db/store.js';
import { showModal, hideModal } from '../app.js';
import { showHolidayPicker } from '../holidays/holiday-picker.js';
import { countTotalDaysOff } from '../holidays/workday-counter.js';

const PERSON_COLORS = ['#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4', '#FF5722', '#607D8B'];
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
        <button class="btn-person-edit" title="${t('persons.edit')}">&#9998;</button>
        <button class="btn-person-delete" title="${t('persons.remove')}">&#10005;</button>
      </div>
    `;

    li.querySelector('.btn-person-add-days').addEventListener('click', () => {
      if (onChange) onChange('add-days', person);
    });

    li.querySelector('.btn-person-edit').addEventListener('click', () => {
      showPersonModal(year, person, onChange);
    });

    li.querySelector('.btn-person-delete').addEventListener('click', async () => {
      await deletePerson(person.id);
      if (onChange) onChange('refresh');
    });

    list.appendChild(li);
  }
}

export async function showPersonModal(year, existingPerson, onChange) {
  const gemeinden = await getAllGemeinden();
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
      <input type="color" id="modal-person-color" value="${person.color}" />
    </div>
    <div class="modal-actions">
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="modal-save">${t('btn.save')}</button>
    </div>
  `;

  showModal(html);

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
      li.textContent = `${g.name}${cantonStr ? ' (' + cantonStr + ')' : ''}${plzStr ? ' — ' + plzStr : ''}`;
      li.addEventListener('mousedown', (e) => {
        e.preventDefault();
        hiddenInput.value = g.id;
        searchInput.value = `${g.name}${cantonStr ? ' (' + cantonStr + ')' : ''}`;
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
      await updatePerson(data);
      hideModal();
      if (onChange) onChange('refresh');
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
