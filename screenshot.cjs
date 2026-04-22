const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
  await page.goto('http://localhost:4173/');
  await page.waitForTimeout(2000); // wait for load
  await page.screenshot({ path: 'header.png', clip: { x: 0, y: 0, width: 1200, height: 150 } });
  await browser.close();
})();
