import { getMonthName, getWeekdayName, getLang } from '../i18n/i18n.js';
import { getLayoutClass } from './layouts.js';
import { renderDayHolidays } from './day-cell.js';
import { showDayDetail } from './day-detail.js';

let currentYear = new Date().getFullYear();
let currentLayout = '3x4';
let holidayMap = {};
let leaveMap = {};
let onDayChanged = null;

export function setYear(year) {
  currentYear = year;
}

export function getYear() {
  return currentYear;
}

export function setLayout(layout) {
  currentLayout = layout;
}

export function getLayout() {
  return currentLayout;
}

export function setHolidayMap(map) {
  holidayMap = map;
}

export function setLeaveMap(map) {
  leaveMap = map;
}

export function setDayChangedCallback(fn) {
  onDayChanged = fn;
}

export function renderCalendar(container) {
  container.innerHTML = '';

  const grid = document.createElement('div');
  grid.className = `calendar-grid ${getLayoutClass(currentLayout)}`;

  for (let month = 0; month < 12; month++) {
    grid.appendChild(createMonthBlock(month));
  }

  container.appendChild(grid);
}

function createMonthBlock(month) {
  const block = document.createElement('div');
  block.className = 'month-block';

  const title = document.createElement('div');
  title.className = 'month-title';
  title.textContent = getMonthName(month);
  block.appendChild(title);

  const weekdayHeader = document.createElement('div');
  weekdayHeader.className = 'weekday-header';
  for (let d = 0; d < 7; d++) {
    const span = document.createElement('span');
    span.textContent = getWeekdayName(d);
    weekdayHeader.appendChild(span);
  }
  block.appendChild(weekdayHeader);

  const daysGrid = document.createElement('div');
  daysGrid.className = 'days-grid';

  const firstDay = new Date(currentYear, month, 1);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6;

  const daysInMonth = new Date(currentYear, month + 1, 0).getDate();

  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  for (let i = 0; i < startDay; i++) {
    const empty = document.createElement('div');
    empty.className = 'day-cell empty';
    daysGrid.appendChild(empty);
  }

  for (let day = 1; day <= daysInMonth; day++) {
    const cell = document.createElement('div');
    cell.className = 'day-cell';

    const dateStr = `${currentYear}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cell.dataset.date = dateStr;

    const dayOfWeek = new Date(currentYear, month, day).getDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      cell.classList.add('weekend');
    }

    if (dateStr === todayStr) {
      cell.classList.add('today');
    }

    const num = document.createElement('span');
    num.className = 'day-number';
    num.textContent = day;
    cell.appendChild(num);

    // Holiday strips (person days off)
    const holidaysOnDate = holidayMap[dateStr];
    if (holidaysOnDate) {
      renderDayHolidays(cell, holidaysOnDate);
    }

    // Leave borders
    const leavesOnDate = leaveMap[dateStr];
    if (leavesOnDate) {
      renderLeaveBorders(cell, leavesOnDate);
    }

    // Tooltip with holiday/leave names
    const tipParts = [];
    if (holidaysOnDate) {
      for (const h of holidaysOnDate) {
        const lang = getLang();
        const name = typeof h.label === 'object' ? (h.label[lang] || h.label.de || '') : (h.label || '');
        if (name) tipParts.push(`${h.personName}: ${name}`);
      }
    }
    if (leavesOnDate) {
      const seen = new Set();
      for (const l of leavesOnDate) {
        if (l.label && !seen.has(l.label)) {
          seen.add(l.label);
          tipParts.push(l.label);
        }
      }
    }
    if (tipParts.length > 0) {
      cell.title = tipParts.join('\n');
    }

    // Click to show day detail popup
    cell.addEventListener('click', () => {
      showDayDetail(dateStr, holidayMap, leaveMap, currentYear, onDayChanged);
    });

    daysGrid.appendChild(cell);
  }

  block.appendChild(daysGrid);
  return block;
}

/**
 * Render leave visualization on a day cell.
 * - Holiday strips shrink to 70% height
 * - Bottom 30% shows striped bar with leave person colors
 * - Stripes alternate between person colors every few px
 */
function renderLeaveBorders(cell, leaves) {
  cell.classList.add('has-leave');

  // Collect all unique colors from all leaves on this date
  const allColors = [];
  let tooltip = '';
  for (const leave of leaves) {
    for (const c of leave.colors) {
      if (!allColors.includes(c)) allColors.push(c);
    }
    if (leave.label) tooltip += (tooltip ? ', ' : '') + leave.label;
  }

  if (allColors.length === 0) return;

  // Determine caps and label
  let capLeft = false;
  let capRight = false;
  let showLabel = false;
  let labelText = '';
  for (const leave of leaves) {
    if (leave.capLeft) capLeft = true;
    if (leave.capRight) capRight = true;
    if (leave.showLabel && leave.label) {
      showLabel = true;
      labelText = leave.label;
    }
  }

  // Create the leave stripe bar (bottom 30%)
  const bar = document.createElement('div');
  bar.className = 'leave-bar';
  if (tooltip) bar.title = tooltip;

  // Build vertical repeating stripe from person colors
  if (allColors.length === 1) {
    bar.style.background = allColors[0];
  } else {
    const px = 4;
    const stops = [];
    for (let i = 0; i < allColors.length; i++) {
      stops.push(`${allColors[i]} ${i * px}px, ${allColors[i]} ${(i + 1) * px}px`);
    }
    const totalPx = allColors.length * px;
    bar.style.background = `repeating-linear-gradient(90deg, ${stops.join(', ')})`;
    bar.style.backgroundSize = `${totalPx}px 100%`;
  }

  // Caps: rounded ends vs fused edges
  if (capLeft) {
    bar.classList.add('leave-cap-left');
  } else {
    bar.classList.add('leave-fuse-left');
  }
  if (capRight) {
    bar.classList.add('leave-cap-right');
  } else {
    bar.classList.add('leave-fuse-right');
  }

  // Label in the middle of each week segment
  if (showLabel && labelText) {
    const lbl = document.createElement('span');
    lbl.className = 'leave-label-text';
    lbl.textContent = labelText;
    bar.appendChild(lbl);
  }

  cell.appendChild(bar);
}
