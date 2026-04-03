import { getYear } from '../calendar/renderer.js';
import { generateShareURL } from './share.js';
import { t } from '../i18n/i18n.js';
import { getAllPersons, getHolidaysForPerson } from '../db/store.js';
import { countTotalDaysOff } from '../holidays/workday-counter.js';
import { sanitizeColor } from '../utils.js';

/**
 * Export the calendar view as a landscape PDF:
 * - Page 1: legend (persons) on the left + calendar 4x3 on the right
 * - Page 2: QR code with share link
 */
export async function exportPDF() {
  const [{ jsPDF }, { default: html2canvas }, { default: qrcode }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
    import('qrcode-generator'),
  ]);

  const year = getYear();

  // Build offscreen print layout
  const printDiv = await buildPrintLayout(year);
  document.body.appendChild(printDiv);

  try {
    // Wait for layout to render
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

    const canvas = await html2canvas(printDiv, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#ffffff',
      windowWidth: printDiv.offsetWidth,
    });

    // A4 landscape
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 4;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2;

    // Calendar image — fill the page
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const imgRatio = canvas.width / canvas.height;
    let imgW = contentW;
    let imgH = imgW / imgRatio;

    if (imgH > contentH) {
      imgH = contentH;
      imgW = imgH * imgRatio;
    }

    const imgX = margin + (contentW - imgW) / 2;
    const imgY = margin + (contentH - imgH) / 2;
    pdf.addImage(imgData, 'JPEG', imgX, imgY, imgW, imgH);

    // QR code page
    await addQRPage(pdf, year, qrcode);

    pdf.save(`hcp-calendar-${year}.pdf`);
  } finally {
    document.body.removeChild(printDiv);
  }
}

/**
 * Build an offscreen div with legend + calendar in 4x3 grid,
 * styled for A4 landscape proportions.
 */
async function buildPrintLayout(year) {
  const persons = await getAllPersons(year);

  // Build legend HTML
  const legendItems = [];
  for (const p of persons) {
    const { total } = await countTotalDaysOff(p, year);
    legendItems.push(`
      <div style="display:flex;align-items:center;gap:6px;margin-bottom:4px;">
        <div style="width:12px;height:12px;border-radius:50%;background:${sanitizeColor(p.color)};flex-shrink:0;border:1px solid rgba(0,0,0,0.15);"></div>
        <div style="min-width:0;">
          <div style="font-size:9px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHTML(p.name)}</div>
          <div style="font-size:7px;color:#666;">${t(`category.${p.category}`)} · ${escapeHTML(p.gemeindeName || p.gemeinde || '')}</div>
          <div style="font-size:7px;color:#2563eb;font-weight:500;">${t('persons.daysOff')}: ${total}</div>
        </div>
      </div>
    `);
  }

  // Clone the calendar container content
  const calContainer = document.getElementById('calendar-container');

  // Create offscreen wrapper
  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-print-wrapper';
  wrapper.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 1400px;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    padding: 12px;
  `;

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText = 'text-align:center;margin-bottom:8px;';
  titleBar.innerHTML = `<div style="font-size:16px;font-weight:700;">${escapeHTML(t('app.title'))} — ${year}</div>
    <div style="font-size:9px;color:#666;font-style:italic;">${escapeHTML(t('about.motto'))}</div>`;
  wrapper.appendChild(titleBar);

  // Main content row: legend + calendar
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:12px;flex:1;';

  // Legend panel
  const legend = document.createElement('div');
  legend.style.cssText = `
    width: 160px;
    flex-shrink: 0;
    padding: 8px;
    background: #f8fafc;
    border-radius: 6px;
    border: 1px solid #e2e8f0;
  `;
  legend.innerHTML = `
    <div style="font-size:11px;font-weight:700;margin-bottom:8px;border-bottom:1px solid #e2e8f0;padding-bottom:4px;">${escapeHTML(t('persons.title'))}</div>
    ${legendItems.join('')}
  `;
  row.appendChild(legend);

  // Calendar clone — force 4x3 layout
  const calClone = calContainer.cloneNode(true);
  calClone.style.cssText = 'flex:1;min-width:0;';

  // Remove loading bar if present
  const lb = calClone.querySelector('#loading-bar');
  if (lb) lb.remove();

  // Force 4x3 layout class
  const grid = calClone.querySelector('.calendar-grid');
  if (grid) {
    grid.className = 'calendar-grid layout-4x3';
  }

  row.appendChild(calClone);
  wrapper.appendChild(row);

  return wrapper;
}

function escapeHTML(str) {
  const d = document.createElement('div');
  d.textContent = str || '';
  return d.innerHTML;
}

async function addQRPage(pdf, year, qrcode) {
  let shareURL;
  try {
    shareURL = await generateShareURL();
  } catch {
    return;
  }

  if (shareURL.length > 2950) {
    return;
  }

  try {
    const qr = qrcode(0, 'L');
    qr.addData(shareURL);
    qr.make();

    const moduleCount = qr.getModuleCount();
    const cellSize = 8;
    const qrSize = moduleCount * cellSize;
    const cvs = document.createElement('canvas');
    cvs.width = qrSize;
    cvs.height = qrSize;
    const ctx = cvs.getContext('2d');

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, qrSize, qrSize);
    ctx.fillStyle = '#000000';
    for (let r = 0; r < moduleCount; r++) {
      for (let c = 0; c < moduleCount; c++) {
        if (qr.isDark(r, c)) {
          ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
        }
      }
    }

    const qrDataURL = cvs.toDataURL('image/png');

    pdf.addPage();
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    pdf.setFontSize(18);
    pdf.setFont(undefined, 'bold');
    pdf.text(t('pdf.qr.title'), pageW / 2, 30, { align: 'center' });

    const qrMM = 80;
    const qrX = (pageW - qrMM) / 2;
    const qrY = (pageH - qrMM) / 2 - 10;
    pdf.addImage(qrDataURL, 'PNG', qrX, qrY, qrMM, qrMM);

    pdf.setFontSize(11);
    pdf.setFont(undefined, 'normal');
    pdf.text(t('pdf.qr.desc'), pageW / 2, qrY + qrMM + 12, { align: 'center' });

    pdf.setFontSize(9);
    pdf.setTextColor(128);
    pdf.text(`${t('app.title')} — ${year}`, pageW / 2, pageH - 10, { align: 'center' });
    pdf.setTextColor(0);
  } catch {
    // skip silently
  }
}
