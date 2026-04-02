/**
 * Dynamic computation of Swiss cantonal public holidays for any year.
 * No seed data needed - works for past and future years.
 */

// Easter calculation (Anonymous Gregorian algorithm)
function easter(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function moveable(year) {
  const e = easter(year);
  return {
    karfreitag: addDays(e, -2),
    ostermontag: addDays(e, 1),
    auffahrt: addDays(e, 39),
    pfingstmontag: addDays(e, 50),
    fronleichnam: addDays(e, 60),
  };
}

// First Thursday in April
function naefelserFahrt(year) {
  const d = new Date(year, 3, 1);
  while (d.getDay() !== 4) d.setDate(d.getDate() + 1);
  return d;
}

// Thursday after first Sunday of September
function jeuneGenevois(year) {
  const d = new Date(year, 8, 1);
  while (d.getDay() !== 0) d.setDate(d.getDate() + 1);
  return addDays(d, 4);
}

// Monday after third Sunday of September
function bettagsMontag(year) {
  const d = new Date(year, 8, 1);
  let sundays = 0;
  while (sundays < 3) {
    if (d.getDay() === 0) sundays++;
    if (sundays < 3) d.setDate(d.getDate() + 1);
  }
  return addDays(d, 1);
}

const H = {
  neujahr:     { de: 'Neujahrstag', fr: 'Nouvel An', it: 'Capodanno', en: "New Year's Day", fixed: [1, 1] },
  berchtold:   { de: 'Berchtoldstag', fr: '2 janvier', it: '2 gennaio', en: "Berchtold's Day", fixed: [1, 2] },
  dreikoenig:  { de: 'Dreikönigstag', fr: 'Épiphanie', it: 'Epifania', en: 'Epiphany', fixed: [1, 6] },
  joseph:      { de: 'Josephstag', fr: 'Saint-Joseph', it: 'San Giuseppe', en: "St. Joseph's Day", fixed: [3, 19] },
  karfreitag:  { de: 'Karfreitag', fr: 'Vendredi saint', it: 'Venerdì santo', en: 'Good Friday', mov: 'karfreitag' },
  ostermontag: { de: 'Ostermontag', fr: 'Lundi de Pâques', it: 'Lunedì di Pasqua', en: 'Easter Monday', mov: 'ostermontag' },
  arbeit:      { de: 'Tag der Arbeit', fr: 'Fête du travail', it: 'Festa del lavoro', en: 'Labour Day', fixed: [5, 1] },
  auffahrt:    { de: 'Auffahrt', fr: 'Ascension', it: 'Ascensione', en: 'Ascension Day', mov: 'auffahrt' },
  pfingst:     { de: 'Pfingstmontag', fr: 'Lundi de Pentecôte', it: 'Lunedì di Pentecoste', en: 'Whit Monday', mov: 'pfingstmontag' },
  fronleich:   { de: 'Fronleichnam', fr: 'Fête-Dieu', it: 'Corpus Domini', en: 'Corpus Christi', mov: 'fronleichnam' },
  peter_paul:  { de: 'Peter und Paul', fr: 'Saints Pierre et Paul', it: 'San Pietro e Paolo', en: 'Saints Peter and Paul', fixed: [6, 29] },
  bundes:      { de: 'Bundesfeiertag', fr: 'Fête nationale', it: 'Festa nazionale', en: 'Swiss National Day', fixed: [8, 1] },
  himmelfahrt: { de: 'Mariä Himmelfahrt', fr: 'Assomption', it: 'Assunzione', en: 'Assumption of Mary', fixed: [8, 15] },
  bruderklaus: { de: 'Bruder Klaus', fr: 'Saint Nicolas de Flüe', it: 'San Nicola della Flüe', en: 'Brother Klaus', fixed: [9, 25] },
  allerheilig: { de: 'Allerheiligen', fr: 'Toussaint', it: 'Ognissanti', en: "All Saints' Day", fixed: [11, 1] },
  empfaengnis: { de: 'Mariä Empfängnis', fr: 'Immaculée Conception', it: 'Immacolata', en: 'Immaculate Conception', fixed: [12, 8] },
  weihnacht:   { de: 'Weihnachtstag', fr: 'Noël', it: 'Natale', en: 'Christmas Day', fixed: [12, 25] },
  stephan:     { de: 'Stephanstag', fr: 'Saint-Étienne', it: 'Santo Stefano', en: "St. Stephen's Day", fixed: [12, 26] },
  restauration:{ de: 'Restauration der Republik', fr: 'Restauration de la République', it: 'Restaurazione', en: 'Restoration of the Republic', fixed: [12, 31] },
};

// Canton -> holiday keys
const CANTON = {
  ZH: ['neujahr','berchtold','karfreitag','ostermontag','arbeit','auffahrt','pfingst','weihnacht','stephan'],
  BE: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','weihnacht','stephan'],
  LU: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  UR: ['neujahr','dreikoenig','joseph','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  SZ: ['neujahr','dreikoenig','joseph','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  OW: ['neujahr','berchtold','joseph','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','bruderklaus','allerheilig','empfaengnis','weihnacht','stephan'],
  NW: ['neujahr','joseph','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  GL: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','allerheilig','weihnacht','stephan'],
  ZG: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  FR: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  SO: ['neujahr','karfreitag','arbeit','auffahrt','fronleich','himmelfahrt','allerheilig','weihnacht'],
  BS: ['neujahr','karfreitag','ostermontag','arbeit','auffahrt','pfingst','weihnacht','stephan'],
  BL: ['neujahr','karfreitag','ostermontag','arbeit','auffahrt','pfingst','weihnacht','stephan'],
  SH: ['neujahr','berchtold','karfreitag','ostermontag','arbeit','auffahrt','pfingst','weihnacht','stephan'],
  AR: ['neujahr','karfreitag','ostermontag','auffahrt','pfingst','weihnacht','stephan'],
  AI: ['neujahr','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  SG: ['neujahr','karfreitag','ostermontag','auffahrt','pfingst','allerheilig','weihnacht','stephan'],
  GR: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','weihnacht','stephan'],
  AG: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  TG: ['neujahr','berchtold','karfreitag','ostermontag','arbeit','auffahrt','pfingst','weihnacht','stephan'],
  TI: ['neujahr','dreikoenig','joseph','ostermontag','arbeit','auffahrt','pfingst','fronleich','peter_paul','himmelfahrt','allerheilig','empfaengnis','weihnacht','stephan'],
  VD: ['neujahr','berchtold','karfreitag','ostermontag','auffahrt','pfingst','weihnacht'],
  VS: ['neujahr','joseph','ostermontag','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','empfaengnis','weihnacht'],
  NE: ['neujahr','berchtold','karfreitag','arbeit','auffahrt','fronleich','weihnacht'],
  GE: ['neujahr','karfreitag','ostermontag','auffahrt','pfingst','weihnacht','restauration'],
  JU: ['neujahr','berchtold','karfreitag','ostermontag','arbeit','auffahrt','pfingst','fronleich','himmelfahrt','allerheilig','weihnacht'],
};

function resolveDate(key, info, year, mov) {
  if (info.fixed) return new Date(year, info.fixed[0] - 1, info.fixed[1]);
  if (info.mov) return mov[info.mov];
  return null;
}

/**
 * Get public holidays for a canton and year.
 * Returns array of { name: {de,fr,it,en}, start, end, type }
 */
export function getPublicHolidays(canton, year) {
  const mov = moveable(year);
  const keys = CANTON[canton];
  if (!keys) return [];

  // Always include Bundesfeiertag
  const allKeys = keys.includes('bundes') ? keys : [...keys, 'bundes'];

  const holidays = [];
  for (const key of allKeys) {
    const info = H[key];
    if (!info) continue;
    const d = resolveDate(key, info, year, mov);
    if (!d) continue;
    const dateStr = formatDate(d);
    holidays.push({
      name: { de: info.de, fr: info.fr, it: info.it, en: info.en },
      start: dateStr,
      end: dateStr,
      type: 'public_holiday',
    });
  }

  holidays.sort((a, b) => a.start.localeCompare(b.start));
  return holidays;
}
