import { initApp } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
  initApp().catch(err => {
    console.error('Failed to initialize HCP:', err);
  });
});
