// Переводит схемы figures/*.svg в векторные PDF для description.tex: figures/arch.svg → figures/arch.pdf.
// Шрифт схем — Golos Text из ../fonts, как в тексте документа.
// Playwright — из e2e/node_modules (cd e2e && npm ci). Браузер — путь в E2E_CHROMIUM_PATH,
// без него — Chromium, установленный Playwright.
// Запуск: node docs/process/figures/make-figures.cjs
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../e2e/node_modules/playwright'));

const fontFace = Object.entries({ 400: 'Regular', 600: 'SemiBold', 700: 'Bold' })
  .map(([w, name]) => {
    const b64 = fs.readFileSync(path.join(__dirname, `../fonts/GolosText-${name}.ttf`)).toString('base64');
    return `@font-face{font-family:"Golos Text";font-weight:${w};src:url(data:font/ttf;base64,${b64})}`;
  })
  .join('');

const diagrams = fs.readdirSync(__dirname).filter((f) => f.endsWith('.svg'))
  .map((f) => ({ name: f.slice(0, -4), svg: fs.readFileSync(path.join(__dirname, f), 'utf8') }));
if (diagrams.length === 0) throw new Error('В figures/ нет ни одной схемы .svg');

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH || undefined });
  try {
    const page = await browser.newPage();
    for (const { name, svg } of diagrams) {
      const [, , , w, h] = svg.match(/viewBox="([\d.]+) ([\d.]+) ([\d.]+) ([\d.]+)"/).map(Number);
      await page.setContent(
        `<!doctype html><meta charset="utf-8"><style>${fontFace}` +
          `html,body{margin:0}svg{display:block;width:${w}px;height:${h}px}` +
          `svg,svg *{font-family:"Golos Text",sans-serif}</style>${svg}`,
        { waitUntil: 'load' },
      );
      // Golos Text шире Segoe UI, под который рисовались схемы: уменьшаем кегль, чтобы текст влез в блоки.
      await page.evaluate(() => {
        document.querySelectorAll('svg [font-size]').forEach((el) => {
          el.setAttribute('font-size', String(Number(el.getAttribute('font-size')) * 0.9));
        });
        return document.fonts.ready;
      });
      const out = path.join(__dirname, `${name}.pdf`);
      await page.pdf({ path: out, width: `${w}px`, height: `${h}px`, printBackground: true, pageRanges: '1' });
      console.log('PDF:', out);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
