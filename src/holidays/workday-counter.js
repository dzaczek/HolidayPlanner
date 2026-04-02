import { getTemplates, getHolidaysForPerson, getAllLeaves } from '../db/store.js';

/**
 * Build a Set of all free dates (non-working) for a person in a given year.
 * Includes:
 * - Weekend days (Sat/Sun) are excluded from workday counts separately
 * - Holiday templates from DB (cantonal holidays for workers, school holidays for school kids)
 * - Manually assigned holidays (from holidays store)
 */
export async function getPersonFreeDates(person, year) {
  const freeDates = new Set();

  // 1. Get holiday templates for person's category
  const templates = await getTemplates(person.category, person.gemeinde, year);

  // School kids and students also get public holidays (worker)
  let extraTemplates = [];
  if (person.category === 'school' || person.category === 'student') {
    extraTemplates = await getTemplates('worker', person.gemeinde, year);
  }

  for (const tmpl of [...templates, ...extraTemplates]) {
    const start = new Date(tmpl.startDate + 'T00:00:00');
    const end = new Date(tmpl.endDate + 'T00:00:00');
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      freeDates.add(formatDate(d));
    }
  }

  // 2. Get personally assigned holidays (from holiday picker - both menu & manual)
  const holidays = await getHolidaysForPerson(person.id, year);
  for (const h of holidays) {
    freeDates.add(h.date);
  }

  return freeDates;
}

/**
 * Count working days in a date range, excluding weekends and person's free dates.
 * Returns the number of actual vacation days the person "uses" in this period.
 */
export function countNetWorkdays(startStr, endStr, freeDates) {
  const start = new Date(startStr + 'T00:00:00');
  const end = new Date(endStr + 'T00:00:00');
  let count = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue; // weekend
    const dateStr = formatDate(d);
    if (freeDates.has(dateStr)) continue; // already a free day
    count++;
  }
  return count;
}

/**
 * Count total days off for a person in a year.
 * = working days from assigned holidays + net working days from leaves
 */
export async function countTotalDaysOff(person, year) {
  const freeDates = await getPersonFreeDates(person, year);
  const allLeaves = await getAllLeaves(year);

  // Count working days that are holidays (from templates + manual)
  let holidayWorkdays = 0;
  for (const dateStr of freeDates) {
    const d = new Date(dateStr + 'T00:00:00');
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) holidayWorkdays++;
  }

  // Count net leave working days (excluding already-free days)
  let leaveNetWorkdays = 0;
  for (const leave of allLeaves) {
    if (leave.personIds && leave.personIds.includes(person.id)) {
      leaveNetWorkdays += countNetWorkdays(leave.startDate, leave.endDate, freeDates);
    }
  }

  return {
    holidayWorkdays,   // days off from holidays/school holidays
    leaveNetWorkdays,  // extra vacation days (net, excluding holidays)
    total: holidayWorkdays + leaveNetWorkdays,
  };
}

/**
 * Count net working days for a specific leave + person.
 * Used in leave panel badges.
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
