import de from './de.json';
import en from './en.json';
import fr from './fr.json';
import it from './it.json';

const locales = { de, en, fr, it };

function detectLang() {
  const langs = [...(navigator.languages || []), navigator.language || ''];
  for (const tag of langs) {
    const code = tag.toLowerCase().split('-')[0];
    if (locales[code]) return code;
  }
  return 'en';
}

let currentLang = localStorage.getItem('hcp-lang') || detectLang();

export function t(key) {
  return locales[currentLang]?.[key] || locales['en']?.[key] || key;
}

export function setLang(lang) {
  if (!locales[lang]) return;
  currentLang = lang;
  localStorage.setItem('hcp-lang', lang);
  applyTranslations();
}

export function getLang() {
  return currentLang;
}

export function getMonthName(index) {
  return t(`months.${index}`);
}

export function getWeekdayName(index) {
  return t(`weekdays.${index}`);
}

export function applyTranslations() {
  document.querySelectorAll('[data-i18n]').forEach(el => {
    el.textContent = t(el.dataset.i18n);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
}
