export function sanitizeColor(color) {
  if (/^#[0-9a-fA-F]{6}$/.test(color)) return color;
  return '#9E9E9E'; // fallback grey
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
