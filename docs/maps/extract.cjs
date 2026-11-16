// Извлекает планы этажей и схему кампуса с открытой карты mgimo.ru/territory в компактный JSON (D64).
// Берём только геометрию и цвета; чужие скрипты, стили и разметку не сохраняем.
// Запуск из корня репозитория (нужны зависимости e2e: cd e2e && npm ci): node docs/maps/extract.cjs frontend/public/maps
const path = require('path');
const fs = require('fs');
const { chromium } = require(path.resolve(__dirname, '../../e2e/node_modules/playwright'));

const FLOORS = [
  { file: 'b-1', room: '1047' },
  { file: 'b-2', room: '2009' },
  { file: 'g-2', room: '2115' },
  { file: 'g-3', room: '3122' },
  { file: 'n-2', room: 'n202' },
  { file: 'n-4', room: 'n404' },
];

// Выполняется в браузере: дерево SVG → [tag, attrs, children]
function serialize(rootSel) {
  const svg = document.querySelector(rootSel);
  if (!svg) return null;
  const SHAPES = new Set(['g', 'rect', 'path', 'polygon', 'polyline', 'circle', 'ellipse', 'line', 'text']);
  const GEO = ['x', 'y', 'width', 'height', 'rx', 'ry', 'd', 'points', 'cx', 'cy', 'r', 'x1', 'y1', 'x2', 'y2', 'transform'];
  const round = (v) => v.replace(/-?\d+\.\d+/g, (n) => String(Math.round(parseFloat(n) * 10) / 10));
  const color = (c) => {
    if (!c || c === 'none') return 'none';
    if (c.startsWith('url(')) return '#d9dde3';
    const m = c.match(/rgba?\(([^)]+)\)/);
    if (!m) return c;
    const [r, g, b, a] = m[1].split(',').map((s) => parseFloat(s));
    if (a === 0) return 'none';
    return '#' + [r, g, b].map((n) => Math.round(n).toString(16).padStart(2, '0')).join('');
  };
  const inv = svg.getScreenCTM().inverse();
  // Границы элемента в координатах всего плана (с учётом transform у групп)
  const bbox = (el) => {
    const b = el.getBBox();
    const m = inv.multiply(el.getScreenCTM());
    const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]]
      .map(([x, y]) => new DOMPoint(x, y).matrixTransform(m));
    const xs = pts.map((q) => q.x), ys = pts.map((q) => q.y);
    const x = Math.min(...xs), y = Math.min(...ys);
    return [x, y, Math.max(...xs) - x, Math.max(...ys) - y].map((n) => Math.round(n * 10) / 10);
  };
  const walk = (el) => {
    const tag = el.tagName.toLowerCase();
    if (!SHAPES.has(tag)) return null;
    const cs = getComputedStyle(el);
    if (cs.display === 'none' || cs.visibility === 'hidden') return null;
    const a = {};
    for (const k of GEO) { const v = el.getAttribute(k); if (v != null) a[k] = round(v); }
    if (tag !== 'g') {
      a.fill = color(cs.fill);
      const stroke = color(cs.stroke);
      if (stroke !== 'none') { a.stroke = stroke; a.sw = round(cs.strokeWidth.replace('px', '')); }
      const op = parseFloat(cs.opacity) * parseFloat(cs.fillOpacity);
      if (op < 1) a.op = Math.round(op * 100) / 100;
    }
    const id = el.getAttribute('id') || '';
    if (/^n?\d{3,4}[a-zа-я]?$/i.test(id)) { a.room = id; a.bb = bbox(el); }
    if (/^legend_[a-z]$/.test(id)) { a.building = id.slice(-1); a.bb = bbox(el); }
    if (tag === 'text') {
      const t = el.textContent.replace(/\s+/g, ' ').trim();
      if (!t || /^\d{3,4}[a-zа-я]?$/i.test(t)) return null; // номера аудиторий рисуем сами
      a.text = t;
      a.fs = round(cs.fontSize.replace('px', ''));
      a.anchor = cs.textAnchor;
      const first = el.querySelector('tspan[x]');
      if (a.x == null && first) { a.x = round(first.getAttribute('x')); a.y = round(first.getAttribute('y') || '0'); }
      return [tag, a];
    }
    const kids = tag === 'g' ? [...el.children].map(walk).filter(Boolean) : [];
    if (tag === 'g' && kids.length === 0) return null;
    return kids.length ? [tag, a, kids] : [tag, a];
  };
  return { viewBox: svg.getAttribute('viewBox'), nodes: [...svg.children].map(walk).filter(Boolean) };
}

(async () => {
  const out = process.argv[2];
  fs.mkdirSync(out, { recursive: true });
  // Свой Chrome — через E2E_CHROMIUM_PATH, иначе браузер Playwright (npx playwright install chromium)
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  let overview = null;
  for (const f of FLOORS) {
    await page.goto(`https://mgimo.ru/territory/map/?room=${f.room}`, { waitUntil: 'load', timeout: 60000 });
    await page.waitForSelector('#svgcontainer svg', { timeout: 30000 });
    await page.waitForTimeout(2500);
    const data = await page.evaluate(serialize, '#svgcontainer svg');
    const json = JSON.stringify(data);
    fs.writeFileSync(path.join(out, `${f.file}.json`), json);
    console.log(f.file, json.length, 'байт');
    if (!overview) {
      overview = await page.evaluate(serialize, '.scheme-container svg');
      const o = JSON.stringify(overview);
      fs.writeFileSync(path.join(out, 'campus.json'), o);
      console.log('campus', o.length, 'байт');
    }
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
