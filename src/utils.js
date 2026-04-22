export const logger = {
  get isDebug() {
    try {
      return localStorage.getItem('HCP_DEBUG') === 'true';
    } catch (e) {
      return false; // Handle environments without localStorage (like testing or node)
    }
  },
  debug: (...args) => {
    if (logger.isDebug) {
      console.log(...args);
    }
  },
  log: (...args) => console.log(...args),
  warn: (...args) => console.warn(...args),
  error: (...args) => console.error(...args),
};

export function sanitizeColor(color) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return '#9E9E9E'; // fallback grey
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
