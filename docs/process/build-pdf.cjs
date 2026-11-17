// Собирает docs/process/description.pdf из description.html.
// Playwright берётся из e2e/node_modules (cd e2e && npm ci). Браузер — системный Chrome
// или Chromium: путь в E2E_CHROMIUM_PATH, без него — Chromium, установленный Playwright.
// Запуск: node docs/process/build-pdf.cjs
const path = require('path');
const { pathToFileURL } = require('url');
const { chromium } = require(path.resolve(__dirname, '../../e2e/node_modules/playwright'));

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    await page.goto(pathToFileURL(path.join(__dirname, 'description.html')).href, { waitUntil: 'load' });
    const out = path.join(__dirname, 'description.pdf');
    await page.pdf({
      path: out,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate:
        '<div style="width:100%;font-size:8px;color:#566174;text-align:center;font-family:Segoe UI,Arial,sans-serif">' +
        'Мой вуз — описание процесса. <span class="pageNumber"></span> из <span class="totalPages"></span></div>',
      margin: { top: '16mm', right: '16mm', bottom: '18mm', left: '16mm' },
    });
    console.log('PDF:', out);
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
