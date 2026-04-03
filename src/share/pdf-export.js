import { getYear } from '../calendar/renderer.js';
import { generateShareURL } from './share.js';
import { t } from '../i18n/i18n.js';

/**
 * Export the calendar view as a PDF with optional QR code page.
 */
export async function exportPDF() {
  const [{ jsPDF }, { default: html2canvas }, { default: qrcode }] = await Promise.all([
    import('jspdf'),
    import('html2canvas'),
    import('qrcode-generator'),
  ]);

  const container = document.getElementById('calendar-container');
  const year = getYear();

  // Save original styles
  const origWidth = container.style.width;
  const origMaxWidth = container.style.maxWidth;
  const origOverflow = container.style.overflow;

  // Force a fixed width for consistent rendering
  container.style.width = '1200px';
  container.style.maxWidth = '1200px';
  container.style.overflow = 'visible';

  // Hide UI elements that shouldn't be in PDF
  const loadingBar = document.getElementById('loading-bar');
  const loadingDisplay = loadingBar ? loadingBar.style.display : '';
  if (loadingBar) loadingBar.style.display = 'none';

  try {
    const canvas = await html2canvas(container, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: '#f5f5f5',
      windowWidth: 1200,
    });

    // A4 landscape
    const pdf = new jsPDF({
      orientation: 'landscape',
      unit: 'mm',
      format: 'a4',
    });

    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();
    const margin = 5;
    const contentW = pageW - margin * 2;
    const contentH = pageH - margin * 2 - 10; // reserve space for title

    // Title
    pdf.setFontSize(14);
    pdf.setFont(undefined, 'bold');
    pdf.text(`${t('app.title')} — ${year}`, pageW / 2, margin + 5, { align: 'center' });

    // Calendar image
    const imgData = canvas.toDataURL('image/jpeg', 0.92);
    const imgRatio = canvas.width / canvas.height;
    let imgW = contentW;
    let imgH = imgW / imgRatio;

    if (imgH > contentH) {
      imgH = contentH;
      imgW = imgH * imgRatio;
    }

    const imgX = margin + (contentW - imgW) / 2;
    const imgY = margin + 10;
    pdf.addImage(imgData, 'JPEG', imgX, imgY, imgW, imgH);

    // QR code page
    await addQRPage(pdf, year, qrcode);

    pdf.save(`hcp-calendar-${year}.pdf`);
  } finally {
    // Restore styles
    container.style.width = origWidth;
    container.style.maxWidth = origMaxWidth;
    container.style.overflow = origOverflow;
    if (loadingBar) loadingBar.style.display = loadingDisplay;
  }
}

async function addQRPage(pdf, year, qrcode) {
  let shareURL;
  try {
    shareURL = await generateShareURL();
  } catch {
    return; // skip QR page if share URL fails
  }

  if (shareURL.length > 2950) {
    return; // QR code too large
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
    for (let row = 0; row < moduleCount; row++) {
      for (let col = 0; col < moduleCount; col++) {
        if (qr.isDark(row, col)) {
          ctx.fillRect(col * cellSize, row * cellSize, cellSize, cellSize);
        }
      }
    }

    const qrDataURL = cvs.toDataURL('image/png');

    pdf.addPage();
    const pageW = pdf.internal.pageSize.getWidth();
    const pageH = pdf.internal.pageSize.getHeight();

    // Title
    pdf.setFontSize(18);
    pdf.setFont(undefined, 'bold');
    pdf.text(t('pdf.qr.title'), pageW / 2, 30, { align: 'center' });

    // QR code centered
    const qrMM = 80;
    const qrX = (pageW - qrMM) / 2;
    const qrY = (pageH - qrMM) / 2 - 10;
    pdf.addImage(qrDataURL, 'PNG', qrX, qrY, qrMM, qrMM);

    // Description below
    pdf.setFontSize(11);
    pdf.setFont(undefined, 'normal');
    pdf.text(t('pdf.qr.desc'), pageW / 2, qrY + qrMM + 12, { align: 'center' });

    // Year info
    pdf.setFontSize(9);
    pdf.setTextColor(128);
    pdf.text(`${t('app.title')} — ${year}`, pageW / 2, pageH - 10, { align: 'center' });
    pdf.setTextColor(0);
  } catch {
    // QR generation failed, skip silently
  }
}
