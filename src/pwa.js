import { t } from './i18n/i18n.js';

/** Register SW & show update / install banners */
export function initPWA() {
  if (!('serviceWorker' in navigator)) return;

  navigator.serviceWorker.register('/sw.js').then((reg) => {
    // Check for updates periodically (every 60 min)
    setInterval(() => reg.update(), 60 * 60 * 1000);

    reg.addEventListener('updatefound', () => {
      const newWorker = reg.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        // New SW installed & old one still active → show update banner
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          showUpdateBanner(newWorker);
        }
      });
    });
  });

  // Reload page when the new SW takes over
  let refreshing = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!refreshing) {
      refreshing = true;
      window.location.reload();
    }
  });

  // A2HS (Add to Home Screen) install prompt
  setupInstallPrompt();
}

function showUpdateBanner(worker) {
  const existing = document.getElementById('pwa-update-banner');
  if (existing) existing.remove();

  const banner = document.createElement('div');
  banner.id = 'pwa-update-banner';
  banner.className = 'pwa-banner';
  banner.innerHTML = `
    <span>${t('pwa.update')}</span>
    <button id="pwa-refresh-btn" class="pwa-btn pwa-btn-primary">${t('pwa.refresh')}</button>
    <button id="pwa-dismiss-btn" class="pwa-btn">${t('pwa.dismiss')}</button>
  `;
  document.body.appendChild(banner);

  document.getElementById('pwa-refresh-btn').addEventListener('click', () => {
    worker.postMessage({ type: 'SKIP_WAITING' });
    banner.remove();
  });

  document.getElementById('pwa-dismiss-btn').addEventListener('click', () => {
    banner.remove();
  });
}

let deferredInstallPrompt = null;

function setupInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstallPrompt = e;
    showInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    const btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
  });
}

function showInstallButton() {
  // Add install button to header controls
  const controls = document.querySelector('.header-controls');
  if (!controls || document.getElementById('pwa-install-btn')) return;

  const btn = document.createElement('button');
  btn.id = 'pwa-install-btn';
  btn.className = 'btn-header btn-install';
  btn.title = t('pwa.install');
  btn.textContent = '\u{1F4F2} ' + t('pwa.install');
  btn.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const result = await deferredInstallPrompt.userChoice;
    if (result.outcome === 'accepted') {
      deferredInstallPrompt = null;
      btn.remove();
    }
  });

  controls.appendChild(btn);
}
