import { addHolidaysBatch, updateLeave } from '../db/store.js';

// ====== Placement mode (for manual holiday days) ======

let active = false;
let person = null;
let dayCount = 0;
let label = '';
let year = 0;
let onDone = null;
let previewCells = [];
let banner = null;

export function startPlacementMode(opts) {
  person = opts.person;
  dayCount = opts.dayCount;
  label = opts.label || '';
  year = opts.year;
  onDone = opts.onDone;
  active = true;
  previewCells = [];

  showBanner(`<strong>${escapeHtml(person.name)}</strong> — ${dayCount} days${label ? ': ' + escapeHtml(label) : ''}`,
    person.color);
  document.getElementById('calendar-container').classList.add('placement-mode');
  bindPlacementEvents();
}

export function isPlacementActive() {
  return active;
}

function showBanner(html, color) {
  banner = document.createElement('div');
  banner.className = 'placement-banner';
  banner.innerHTML = `
    <span class="placement-banner-dot" style="background:${color || 'var(--primary)'}"></span>
    <span>${html}</span>
    <span class="placement-hint">Click a start date, drag to reposition. Esc to cancel.</span>
    <button class="btn btn-secondary placement-cancel">Cancel</button>
  `;
  document.body.appendChild(banner);
  banner.querySelector('.placement-cancel').addEventListener('click', cancelPlacement);
}

function hideBanner() {
  if (banner) { banner.remove(); banner = null; }
}

function bindPlacementEvents() {
  const c = document.getElementById('calendar-container');
  c.addEventListener('mousedown', onPlacementMouseDown);
  c.addEventListener('mousemove', onPlacementMouseMove);
  c.addEventListener('mouseup', onPlacementMouseUp);
  document.addEventListener('keydown', onPlacementKeyDown);
}

function unbindPlacementEvents() {
  const c = document.getElementById('calendar-container');
  c.removeEventListener('mousedown', onPlacementMouseDown);
  c.removeEventListener('mousemove', onPlacementMouseMove);
  c.removeEventListener('mouseup', onPlacementMouseUp);
  document.removeEventListener('keydown', onPlacementKeyDown);
}

function onPlacementKeyDown(e) {
  if (e.key === 'Escape') cancelPlacement();
}

let placementDragging = false;

function onPlacementMouseDown(e) {
  const cell = e.target.closest('.day-cell:not(.empty)');
  if (!cell) return;
  e.preventDefault();
  placementDragging = true;
  showPreview(cell.dataset.date);
}

function onPlacementMouseMove(e) {
  const cell = e.target.closest('.day-cell:not(.empty)');
  if (cell) showPreview(cell.dataset.date);
}

function onPlacementMouseUp(e) {
  if (!placementDragging) return;
  placementDragging = false;
  const cell = e.target.closest('.day-cell:not(.empty)');
  if (cell) confirmPlacement(cell.dataset.date);
}

function showPreview(fromDateStr) {
  clearPreview();
  const dates = expandDays(fromDateStr, dayCount);
  for (const dateStr of dates) {
    const cell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
    if (cell) {
      cell.classList.add('placement-preview');
      cell.style.setProperty('--preview-color', person.color);
      previewCells.push(cell);
    }
  }
}

function clearPreview() {
  for (const cell of previewCells) {
    cell.classList.remove('placement-preview');
    cell.style.removeProperty('--preview-color');
  }
  previewCells = [];
}

async function confirmPlacement(fromDateStr) {
  const dates = expandDays(fromDateStr, dayCount);
  const holidays = dates.map(date => ({
    personId: person.id, date, source: 'manual', label, year,
  }));
  if (holidays.length > 0) await addHolidaysBatch(holidays);
  cleanupPlacement();
  if (onDone) onDone();
}

function cancelPlacement() {
  cleanupPlacement();
  if (onDone) onDone();
}

function cleanupPlacement() {
  clearPreview();
  hideBanner();
  unbindPlacementEvents();
  active = false;
  placementDragging = false;
  document.getElementById('calendar-container').classList.remove('placement-mode');
}

// ====== Leave drag mode (move existing leave period) ======

let leaveDragActive = false;
let dragLeave = null;
let dragOffset = 0; // days offset from leave start to grab point
let dragPreviewCells = [];
let dragOnDone = null;

export function startLeaveDrag(leave, onDone) {
  dragLeave = leave;
  dragOnDone = onDone;
  leaveDragActive = true;
  dragPreviewCells = [];

  const duration = countDaysBetween(leave.startDate, leave.endDate);
  showBanner(`Move: <strong>${escapeHtml(leave.label || 'Leave')}</strong> (${duration} days)`, '#666');
  document.getElementById('calendar-container').classList.add('placement-mode');
  bindLeaveDragEvents();
}

export function isLeaveDragActive() {
  return leaveDragActive;
}

function bindLeaveDragEvents() {
  const c = document.getElementById('calendar-container');
  c.addEventListener('mousedown', onLeaveDragDown);
  c.addEventListener('mousemove', onLeaveDragMove);
  c.addEventListener('mouseup', onLeaveDragUp);
  document.addEventListener('keydown', onLeaveDragKey);
}

function unbindLeaveDragEvents() {
  const c = document.getElementById('calendar-container');
  c.removeEventListener('mousedown', onLeaveDragDown);
  c.removeEventListener('mousemove', onLeaveDragMove);
  c.removeEventListener('mouseup', onLeaveDragUp);
  document.removeEventListener('keydown', onLeaveDragKey);
}

function onLeaveDragKey(e) {
  if (e.key === 'Escape') cancelLeaveDrag();
}

let leaveDragging = false;

function onLeaveDragDown(e) {
  const cell = e.target.closest('.day-cell:not(.empty)');
  if (!cell) return;
  e.preventDefault();
  leaveDragging = true;

  // Calculate offset: how far is the click from the leave start
  const clickDate = new Date(cell.dataset.date + 'T00:00:00');
  const leaveStart = new Date(dragLeave.startDate + 'T00:00:00');
  dragOffset = Math.round((clickDate - leaveStart) / 86400000);
  if (dragOffset < 0) dragOffset = 0;

  showLeavePreview(cell.dataset.date);
}

function onLeaveDragMove(e) {
  const cell = e.target.closest('.day-cell:not(.empty)');
  if (cell) showLeavePreview(cell.dataset.date);
}

function onLeaveDragUp(e) {
  if (!leaveDragging) return;
  leaveDragging = false;
  const cell = e.target.closest('.day-cell:not(.empty)');
  if (cell) confirmLeaveDrag(cell.dataset.date);
}

function showLeavePreview(grabDateStr) {
  clearLeavePreview();

  const duration = countDaysBetween(dragLeave.startDate, dragLeave.endDate);
  const grabDate = new Date(grabDateStr + 'T00:00:00');
  const newStart = new Date(grabDate);
  newStart.setDate(newStart.getDate() - dragOffset);

  for (let i = 0; i < duration; i++) {
    const d = new Date(newStart);
    d.setDate(d.getDate() + i);
    const dateStr = formatDate(d);
    const cell = document.querySelector(`.day-cell[data-date="${dateStr}"]`);
    if (cell) {
      cell.classList.add('placement-preview');
      cell.style.setProperty('--preview-color', '#666');
      dragPreviewCells.push(cell);
    }
  }
}

function clearLeavePreview() {
  for (const cell of dragPreviewCells) {
    cell.classList.remove('placement-preview');
    cell.style.removeProperty('--preview-color');
  }
  dragPreviewCells = [];
}

async function confirmLeaveDrag(grabDateStr) {
  const duration = countDaysBetween(dragLeave.startDate, dragLeave.endDate);
  const grabDate = new Date(grabDateStr + 'T00:00:00');
  const newStart = new Date(grabDate);
  newStart.setDate(newStart.getDate() - dragOffset);
  const newEnd = new Date(newStart);
  newEnd.setDate(newEnd.getDate() + duration - 1);

  await updateLeave({
    ...dragLeave,
    startDate: formatDate(newStart),
    endDate: formatDate(newEnd),
  });

  cleanupLeaveDrag();
  if (dragOnDone) dragOnDone();
}

function cancelLeaveDrag() {
  cleanupLeaveDrag();
  if (dragOnDone) dragOnDone();
}

function cleanupLeaveDrag() {
  clearLeavePreview();
  hideBanner();
  unbindLeaveDragEvents();
  leaveDragActive = false;
  leaveDragging = false;
  dragLeave = null;
  document.getElementById('calendar-container').classList.remove('placement-mode');
}

// ====== Helpers ======

function expandDays(fromDateStr, count) {
  const dates = [];
  const start = new Date(fromDateStr + 'T00:00:00');
  for (let i = 0; i < count; i++) {
    const d = new Date(start);
    d.setDate(d.getDate() + i);
    dates.push(formatDate(d));
  }
  return dates;
}

function countDaysBetween(startStr, endStr) {
  const s = new Date(startStr + 'T00:00:00');
  const e = new Date(endStr + 'T00:00:00');
  return Math.round((e - s) / 86400000) + 1;
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
