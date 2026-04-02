import { t } from '../i18n/i18n.js';
import { addLeave, deleteLeave, getAllLeaves, updateLeave, getAllPersons } from '../db/store.js';
import { showModal, hideModal } from '../app.js';
import { startPlacementMode, startLeaveDrag } from '../calendar/drag-drop.js';
import { countLeaveWorkdaysForPerson } from '../holidays/workday-counter.js';

export async function renderLeavesPanel(year, persons, onChange) {
  const panel = document.getElementById('leaves-panel');
  if (!panel) return;

  const list = document.getElementById('leaves-list');
  list.innerHTML = '';

  const leaves = await getAllLeaves(year);
  const personMap = {};
  for (const p of persons) personMap[p.id] = p;

  for (const leave of leaves) {
    const li = document.createElement('li');
    li.className = 'leave-item';

    // Person dots + net workday badges (excluding holidays already free for that person)
    const badgeParts = [];
    for (const pid of (leave.personIds || [])) {
      const p = personMap[pid];
      if (!p) continue;
      const netDays = await countLeaveWorkdaysForPerson(leave, p, year);
      badgeParts.push(`<span class="leave-person-badge" style="background:${p.color}" title="${escapeHtml(p.name)}: ${netDays} ${t('leaves.workdays')}">${netDays}</span>`);
    }
    const personDots = badgeParts.join('');

    const dateFrom = formatDateShort(leave.startDate);
    const dateTo = formatDateShort(leave.endDate);

    li.innerHTML = `
      <div class="leave-info">
        <div class="leave-label">${escapeHtml(leave.label || t('leaves.title'))}</div>
        <div class="leave-dates">${dateFrom} — ${dateTo}</div>
        <div class="leave-persons-badges">${personDots}</div>
      </div>
      <div class="leave-actions">
        <button class="btn-leave-move" title="Move">&#8693;</button>
        <button class="btn-leave-edit" title="${t('persons.edit')}">&#9998;</button>
        <button class="btn-leave-delete" title="${t('persons.remove')}">&#10005;</button>
      </div>
    `;

    li.querySelector('.btn-leave-move').addEventListener('click', () => {
      startLeaveDrag(leave, () => { if (onChange) onChange('refresh'); });
    });

    li.querySelector('.btn-leave-edit').addEventListener('click', () => {
      showLeaveModal(year, persons, leave, onChange);
    });

    li.querySelector('.btn-leave-delete').addEventListener('click', async () => {
      await deleteLeave(leave.id);
      if (onChange) onChange('refresh');
    });

    list.appendChild(li);
  }
}

export async function showLeaveModal(year, persons, existingLeave, onChange) {
  const isEdit = !!existingLeave;
  const leave = existingLeave || {
    label: '',
    startDate: `${year}-01-01`,
    endDate: `${year}-01-05`,
    personIds: [],
    year,
  };

  const personCheckboxes = persons.map(p => {
    const checked = leave.personIds.includes(p.id) ? 'checked' : '';
    return `<label class="leave-person-option">
      <input type="checkbox" value="${p.id}" ${checked} />
      <span class="leave-person-dot" style="background:${p.color}"></span>
      <span>${escapeHtml(p.name)}</span>
    </label>`;
  }).join('');

  const html = `
    <h3>${isEdit ? t('persons.edit') : t('leaves.add')}</h3>
    <div class="form-group">
      <label>${t('leaves.label')}</label>
      <input type="text" id="leave-label" value="${escapeHtml(leave.label || '')}" />
    </div>
    <div class="form-group">
      <label>${t('holidays.from')}</label>
      <input type="date" id="leave-from" value="${leave.startDate}" />
    </div>
    <div class="form-group">
      <label>${t('holidays.to')}</label>
      <input type="date" id="leave-to" value="${leave.endDate}" />
    </div>
    <div class="form-group">
      <label>${t('leaves.persons')}</label>
      <div class="leave-persons-list">
        ${personCheckboxes || '<p style="color:var(--text-muted);font-size:0.85rem;">—</p>'}
      </div>
    </div>
    <div class="modal-actions">
      ${isEdit ? `<button class="btn btn-danger" id="leave-delete">${t('btn.delete')}</button>` : ''}
      <button class="btn btn-secondary" id="modal-cancel">${t('btn.cancel')}</button>
      <button class="btn btn-primary" id="modal-save">${t('btn.save')}</button>
    </div>
  `;

  showModal(html);

  document.getElementById('modal-cancel').addEventListener('click', hideModal);

  if (isEdit) {
    document.getElementById('leave-delete').addEventListener('click', async () => {
      await deleteLeave(leave.id);
      hideModal();
      if (onChange) onChange('refresh');
    });
  }

  document.getElementById('modal-save').addEventListener('click', async () => {
    const selectedPersonIds = [];
    document.querySelectorAll('.leave-person-option input:checked').forEach(cb => {
      selectedPersonIds.push(parseInt(cb.value));
    });

    const data = {
      ...(isEdit ? leave : {}),
      label: document.getElementById('leave-label').value.trim(),
      startDate: document.getElementById('leave-from').value,
      endDate: document.getElementById('leave-to').value,
      personIds: selectedPersonIds,
      year,
    };

    if (isEdit) {
      await updateLeave(data);
    } else {
      await addLeave(data);
    }

    hideModal();
    if (onChange) onChange('refresh');
  });
}

/**
 * Build a leave map for calendar rendering.
 * Returns: { "2026-03-15": [{ leaveId, personColors: ["#4CAF50", "#2196F3"], label }] }
 */
export async function buildLeaveMap(year, persons) {
  const leaves = await getAllLeaves(year);
  const personMap = {};
  for (const p of persons) personMap[p.id] = p;

  const map = {};

  for (const leave of leaves) {
    const colors = (leave.personIds || [])
      .map(pid => personMap[pid]?.color)
      .filter(Boolean);

    const start = new Date(leave.startDate + 'T00:00:00');
    const end = new Date(leave.endDate + 'T00:00:00');

    // First pass: collect all days and split into week-row segments
    const allDays = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      allDays.push(new Date(d));
    }

    // Split into segments by week row (Mon-Sun)
    const segments = [];
    let seg = [];
    for (const d of allDays) {
      if (seg.length > 0 && d.getDay() === 1) {
        segments.push(seg);
        seg = [];
      }
      seg.push(d);
    }
    if (seg.length > 0) segments.push(seg);

    // Find the middle date of each segment for label placement
    const labelDates = new Set();
    for (const seg of segments) {
      const midIdx = Math.floor(seg.length / 2);
      labelDates.add(formatDate(seg[midIdx]));
    }

    // Second pass: build map entries
    for (const d of allDays) {
      const dateStr = formatDate(d);
      if (!map[dateStr]) map[dateStr] = [];

      const isFirst = dateStr === leave.startDate;
      const isLast = dateStr === leave.endDate;
      const dow = d.getDay();
      const isWeekStart = dow === 1;
      const isWeekEnd = dow === 0;

      const prevD = new Date(d); prevD.setDate(prevD.getDate() - 1);
      const nextD = new Date(d); nextD.setDate(nextD.getDate() + 1);
      const hasPrev = prevD >= start && !isWeekStart;
      const hasNext = nextD <= end && !isWeekEnd;

      map[dateStr].push({
        leaveId: leave.id,
        colors,
        label: leave.label,
        isFirst,
        isLast,
        capLeft: !hasPrev,
        capRight: !hasNext,
        showLabel: labelDates.has(dateStr),
      });
    }
  }

  return map;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatDateShort(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()}.${d.getMonth() + 1}.`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
