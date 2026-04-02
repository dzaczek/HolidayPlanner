import de from './de.json';
import en from './en.json';
import fr from './fr.json';
import it from './it.json';

const locales = { de, en, fr, it };
let currentLang = localStorage.getItem('hcp-lang') || 'de';

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
