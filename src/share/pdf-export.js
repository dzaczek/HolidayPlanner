import { getYear } from '../calendar/renderer.js';
import { generateShareURL } from './share.js';
import { t } from '../i18n/i18n.js';
import { getAllPersons, getAllLeaves } from '../db/store.js';
import { countTotalDaysOff } from '../holidays/workday-counter.js';
import { sanitizeColor } from '../utils.js';

/**
 * Export the calendar view as a landscape PDF:
 * - Page 1: title + legend bar + calendar 3x4 (4 cols, 3 rows)
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
    const margin = 2;
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
 * Build an offscreen div with horizontal legend bar + calendar in 3x4 grid (4 cols, 3 rows),
 * optimized for A4 landscape.
 */
async function buildPrintLayout(year) {
  const persons = await getAllPersons(year);
  const leaves = await getAllLeaves(year);

  // Build person legend items (horizontal)
  const personItems = [];
  for (const p of persons) {
    const { total } = await countTotalDaysOff(p, year);
    personItems.push(`
      <div style="display:flex;align-items:center;gap:4px;">
        <div style="width:10px;height:10px;border-radius:50%;background:${sanitizeColor(p.color)};flex-shrink:0;border:1px solid rgba(0,0,0,0.15);"></div>
        <span style="font-size:8px;font-weight:600;">${escapeHTML(p.name)}</span>
        <span style="font-size:7px;color:#666;">${t(`category.${p.category}`)}</span>
        <span style="font-size:7px;color:#2563eb;font-weight:500;">${total}d</span>
      </div>
    `);
  }

  // Build leave legend items (horizontal)
  const personMap = {};
  for (const p of persons) personMap[p.id] = p;

  const leaveItems = [];
  for (const leave of leaves) {
    const colors = (leave.personIds || [])
      .map(pid => personMap[pid])
      .filter(Boolean)
      .map(p => sanitizeColor(p.color));

    const colorDots = colors.map(c =>
      `<div style="width:8px;height:8px;border-radius:50%;background:${c};border:1px solid rgba(0,0,0,0.15);"></div>`
    ).join('');

    const from = formatDateShort(leave.startDate);
    const to = formatDateShort(leave.endDate);

    leaveItems.push(`
      <div style="display:flex;align-items:center;gap:3px;">
        ${colorDots}
        <span style="font-size:8px;font-weight:600;">${escapeHTML(leave.label || t('leaves.title'))}</span>
        <span style="font-size:7px;color:#666;">${from}–${to}</span>
      </div>
    `);
  }

  // Clone the calendar container content
  const calContainer = document.getElementById('calendar-container');

  // Create offscreen wrapper — wide to fill A4 landscape
  const wrapper = document.createElement('div');
  wrapper.className = 'pdf-print-wrapper';
  wrapper.style.cssText = `
    position: fixed;
    left: -9999px;
    top: 0;
    width: 2000px;
    background: #fff;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    display: flex;
    flex-direction: column;
    padding: 6px 8px;
  `;

  // Title bar
  const titleBar = document.createElement('div');
  titleBar.style.cssText = 'text-align:center;margin-bottom:4px;';
  titleBar.innerHTML = `<div style="font-size:14px;font-weight:700;">${escapeHTML(t('app.title'))} — ${year}</div>`;
  wrapper.appendChild(titleBar);

  // Legend bar — persons and leaves in a horizontal row
  const legendBar = document.createElement('div');
  legendBar.style.cssText = `
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
    align-items: center;
    padding: 4px 8px;
    margin-bottom: 4px;
    background: #f8fafc;
    border-radius: 4px;
    border: 1px solid #e2e8f0;
  `;

  // Persons section
  if (personItems.length > 0) {
    legendBar.innerHTML = `
      <div style="font-size:8px;font-weight:700;color:#333;">${escapeHTML(t('persons.title'))}:</div>
      ${personItems.join('')}
    `;
  }

  // Leaves section
  if (leaveItems.length > 0) {
    legendBar.innerHTML += `
      <div style="font-size:8px;font-weight:700;color:#333;margin-left:8px;">${escapeHTML(t('leaves.title'))}:</div>
      ${leaveItems.join('')}
    `;
  }

  wrapper.appendChild(legendBar);

  // Calendar clone — force 3x4 layout (4 columns, 3 rows — landscape-friendly)
  const calClone = calContainer.cloneNode(true);
  calClone.style.cssText = 'flex:1;min-width:0;';

  // Remove loading bar if present
  const lb = calClone.querySelector('#loading-bar');
  if (lb) lb.remove();

  // Force 3x4 layout class (4 columns = landscape)
  const grid = calClone.querySelector('.calendar-grid');
  if (grid) {
    grid.className = 'calendar-grid layout-3x4';
  }

  // Fix leave bars for html2canvas: it struggles with overflow:visible + absolute children.
  for (const cell of calClone.querySelectorAll('.day-cell')) {
    cell.style.overflow = 'hidden';
  }
  for (const bar of calClone.querySelectorAll('.leave-bar')) {
    bar.style.position = 'absolute';
    bar.style.left = bar.classList.contains('leave-fuse-left') ? '0px' : bar.style.left || '0';
    bar.style.right = bar.classList.contains('leave-fuse-right') ? '0px' : bar.style.right || '0';
    bar.style.bottom = '0';
    bar.style.height = '30%';
    bar.style.zIndex = '4';
    bar.style.opacity = '0.8';
    bar.style.borderTop = '1px solid #000';
    bar.style.borderBottom = '1px solid #000';
  }

  wrapper.appendChild(calClone);

  return wrapper;
}

function formatDateShort(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${d}.${m}`;
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
