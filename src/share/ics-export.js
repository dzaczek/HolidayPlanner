import { getAllPersons, getHolidaysForPerson, getAllLeaves } from '../db/store.js';
import { getYear } from '../calendar/renderer.js';

function pad(n) {
  return String(n).padStart(2, '0');
}

function formatICSDate(dateStr) {
  return dateStr.replace(/-/g, '');
}

function nextDay(dateStr) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

function uid() {
  return `${crypto.randomUUID()}@hcp`;
}

function escapeICS(str) {
  return (str || '').replace(/[\\;,]/g, c => '\\' + c).replace(/\n/g, '\\n');
}

/**
 * Group consecutive holiday dates into ranges for cleaner events.
 */
function groupHolidaysIntoRanges(holidays) {
  const byLabel = {};
  for (const h of holidays) {
    const key = h.label || 'Holiday';
    if (!byLabel[key]) byLabel[key] = [];
    byLabel[key].push(h.date);
  }

  const ranges = [];
  for (const [label, dates] of Object.entries(byLabel)) {
    const sorted = [...dates].sort();
    let start = sorted[0];
    let end = sorted[0];

    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(end + 'T00:00:00');
      const curr = new Date(sorted[i] + 'T00:00:00');
      const diff = (curr - prev) / 86400000;

      if (diff === 1) {
        end = sorted[i];
      } else {
        ranges.push({ label, start, end });
        start = sorted[i];
        end = sorted[i];
      }
    }
    ranges.push({ label, start, end });
  }

  return ranges;
}

function buildVEvent(summary, startDate, endDate, description, calUrl) {
  const dtstart = formatICSDate(startDate);
  const dtend = nextDay(endDate);
  return [
    'BEGIN:VEVENT',
    `UID:${uid()}`,
    `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`,
    `DTSTART;VALUE=DATE:${dtstart}`,
    `DTEND;VALUE=DATE:${dtend}`,
    `SUMMARY:${escapeICS(summary)}`,
    description ? `DESCRIPTION:${escapeICS(description)}` : null,
    calUrl ? `URL:${calUrl}` : null,
    'TRANSP:TRANSPARENT',
    'END:VEVENT',
  ].filter(Boolean).join('\r\n');
}

function buildICS(events, calName) {
  const header = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HCP//Holiday Calendar Planner//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeICS(calName)}`,
  ].join('\r\n');

  const footer = 'END:VCALENDAR';
  return header + '\r\n' + events.join('\r\n') + '\r\n' + footer;
}

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Build ICS content string for all persons' holidays + leaves.
 * @param {{ calUrl?: string }} options  calUrl — if set, added as URL: field to every VEVENT
 */
export async function buildICSContent({ calUrl } = {}) {
  const year = getYear();
  const persons = await getAllPersons(year);
  const leaves = await getAllLeaves(year);
  const events = [];

  for (const person of persons) {
    const holidays = await getHolidaysForPerson(person.id, year);
    const ranges = groupHolidaysIntoRanges(holidays);
    for (const range of ranges) {
      events.push(buildVEvent(`${person.name}: ${range.label}`, range.start, range.end, null, calUrl));
    }
  }

  for (const leave of leaves) {
    const assignedNames = persons
      .filter(p => (leave.personIds || []).includes(p.id))
      .map(p => p.name)
      .join(', ');
    const desc = assignedNames ? `Personen: ${assignedNames}` : '';
    events.push(buildVEvent(leave.label || 'Urlaub', leave.startDate, leave.endDate, desc, calUrl));
  }

  return { ics: buildICS(events, `HCP ${year}`), count: events.length };
}

/**
 * Export all persons' holidays + leaves as a single ICS file.
 */
export async function exportICS() {
  const { ics, count } = await buildICSContent();
  downloadFile(ics, `hcp-calendar-${getYear()}.ics`, 'text/calendar;charset=utf-8');
  return count;
}

/**
 * Export only leaves as ICS (vacation periods).
 */
export async function exportLeavesICS() {
  const year = getYear();
  const persons = await getAllPersons(year);
  const leaves = await getAllLeaves(year);
  const events = [];

  for (const leave of leaves) {
    const assignedNames = persons
      .filter(p => (leave.personIds || []).includes(p.id))
      .map(p => p.name)
      .join(', ');
    const desc = assignedNames ? `Personen: ${assignedNames}` : '';
    events.push(buildVEvent(leave.label || 'Urlaub', leave.startDate, leave.endDate, desc));
  }

  const ics = buildICS(events, `HCP Urlaub ${year}`);
  downloadFile(ics, `hcp-leaves-${year}.ics`, 'text/calendar;charset=utf-8');
  return events.length;
}
