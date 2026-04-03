import { getTemplates, getHolidaysForPerson, getAllLeaves } from '../db/store.js';

/**
 * Build a map of all free dates for a person: date -> portion weight (1.0 or 0.5).
 * Includes templates (cantonal/school) and personally assigned holidays.
 */
export async function getPersonFreeDates(person, year) {
  const freeDates = new Map(); // date -> weight (1.0 full, 0.5 half)

  // 1. Templates (always full day = 1.0)
  const templates = await getTemplates(person.category, person.gemeinde, year);
  let extraTemplates = [];
  if (person.category === 'school' || person.category === 'student') {
    extraTemplates = await getTemplates('worker', person.gemeinde, year);
  }

  for (const tmpl of [...templates, ...extraTemplates]) {
    const start = new Date(tmpl.startDate + 'T00:00:00');
    const end = new Date(tmpl.endDate + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      freeDates.set(formatDate(d), 1.0);
    }
  }

  // 2. Personally assigned holidays (may be 50% = 0.5)
  const holidays = await getHolidaysForPerson(person.id, year);
  for (const h of holidays) {
    const weight = (h.portion === 50) ? 0.5 : 1.0;
    const existing = freeDates.get(h.date) || 0;
    freeDates.set(h.date, Math.max(existing, weight));
  }

  return freeDates;
}

/**
 * Count working days in a date range, excluding weekends and person's free dates.
 */
export function countNetWorkdays(startStr, endStr, freeDates) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const dateStr = formatDate(d);
    const weight = freeDates.get(dateStr) || 0;
    if (weight >= 1.0) continue; // full day off
    count += (1 - weight); // 0.5 day off = 0.5 counted
  }
  return count;
}

/**
 * Count total days off for a person in a year.
 * 50% days count as 0.5.
 */
export async function countTotalDaysOff(person, year) {
  const freeDates = await getPersonFreeDates(person, year);
  const allLeaves = await getAllLeaves(year);

  // Count working days that are holidays (respecting portion)
  let holidayWorkdays = 0;
  for (const [dateStr, weight] of freeDates) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) holidayWorkdays += weight;
  }

  // Count net leave working days (excluding already-free days)
  let leaveNetWorkdays = 0;
  for (const leave of allLeaves) {
    if (leave.personIds && leave.personIds.includes(person.id)) {
      leaveNetWorkdays += countNetWorkdays(leave.startDate, leave.endDate, freeDates);
    }
  }

  return {
    holidayWorkdays,
    leaveNetWorkdays,
    total: holidayWorkdays + leaveNetWorkdays,
  };
}

/**
 * Count net working days for a specific leave + person.
 */
export async function countLeaveWorkdaysForPerson(leave, person, year) {
  const freeDates = await getPersonFreeDates(person, year);
  return countNetWorkdays(leave.startDate, leave.endDate, freeDates);
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
