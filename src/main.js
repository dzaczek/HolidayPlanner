import { initApp } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('app-version').textContent = __APP_VERSION__;
  initApp().catch(err => {
    console.error('Failed to initialize HCP:', err);
  });
});
