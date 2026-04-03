import { getLang } from '../i18n/i18n.js';

/**
 * Render holiday strips inside a day cell.
 * Each person with a holiday on this date gets a proportional strip.
 * style: 'solid' = flat color, 'striped' = diagonal stripe pattern.
 * portion: 100 = full strip, 50 = half-height strip.
 */
export function renderDayHolidays(dayCell, holidaysOnDate) {
  if (!holidaysOnDate || holidaysOnDate.length === 0) return;

  dayCell.classList.add('has-dayoff');

  const container = document.createElement('div');
  container.className = 'holiday-strips';

  for (const h of holidaysOnDate) {
    const strip = document.createElement('div');
    strip.className = 'holiday-strip';

    // Portion: 50% = half height
    if (h.portion === 50) {
      strip.classList.add('strip-half');
    }

    // Style
    strip.style.backgroundColor = h.color;
    if (h.style === 'striped') {
      strip.style.backgroundImage = `repeating-linear-gradient(45deg, transparent, transparent 3px, rgba(255,255,255,0.5) 3px, rgba(255,255,255,0.5) 6px)`;
    }

    // Tooltip
    const lang = getLang();
    const label = typeof h.label === 'object' ? (h.label[lang] || h.label.de || '') : (h.label || '');
    if (label) {
      strip.title = `${h.personName}: ${label}`;
    } else {
      strip.title = h.personName;
    }

    container.appendChild(strip);
  }

  dayCell.appendChild(container);
}
