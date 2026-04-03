import { getTemplates, getHolidaysForYear, getAllPersons } from '../db/store.js';
import { getLang } from '../i18n/i18n.js';

/**
 * Build a holiday map for rendering: date -> [{ personName, color, source, label }]
 */
export async function buildHolidayMap(year) {
  const persons = await getAllPersons(year);
  const allHolidays = await getHolidaysForYear(year);

  const personMap = {};
  for (const p of persons) {
    personMap[p.id] = p;
  }

  const map = {};

  for (const h of allHolidays) {
    const person = personMap[h.personId];
    if (!person) continue;

    if (!map[h.date]) map[h.date] = [];
    map[h.date].push({
      personId: h.personId,
      personName: person.name,
      color: person.color,
      source: h.source,
      label: h.label,
      style: h.style || (h.source === 'manual' ? 'striped' : 'solid'),
      portion: h.portion || 100,
    });
  }

  return map;
}

/**
 * Get available holiday templates for a person (based on category + gemeinde).
 */
export async function getAvailableTemplates(person, year) {
  const templates = await getTemplates(person.category, person.gemeinde, year);

  // School kids and students also see public holidays
  let extra = [];
  if (person.category === 'school' || person.category === 'student') {
    extra = await getTemplates('worker', person.gemeinde, year);
  }

  const lang = getLang();
  return [...templates, ...extra].map(t => ({
    ...t,
    displayName: typeof t.name === 'object' ? (t.name[lang] || t.name.de || '') : t.name,
  }));
}

/**
 * Expand a template into individual date entries.
 */
export function expandTemplateToDates(template) {
  const dates = [];
  const start = new Date(template.startDate);
  const end = new Date(template.endDate);

  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    dates.push(formatDate(new Date(d)));
  }

  return dates;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
