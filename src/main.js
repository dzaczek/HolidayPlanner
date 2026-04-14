import { initApp } from './app.js';
import { initPWA } from './pwa.js';
import { renderCalendar } from './calendar/renderer.js';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('app-version').textContent = (__APP_VERSION__ || '1.1.0') + ' dev';

  // Render shell early
  const calendarContainer = document.getElementById('calendar-container');
  if (calendarContainer) {
    renderCalendar(calendarContainer);
    // Remove global spinner as soon as the shell is visible
    document.getElementById('app-loading')?.remove();
  }

  initApp().catch(err => {
    console.error('Failed to initialize HCP:', err);
  });
  initPWA();
});
