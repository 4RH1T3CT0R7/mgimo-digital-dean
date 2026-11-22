// Склеивает видео-демонстрацию из сцен record.cjs: заставки, подписи, рамка телефона, переходы.
// Картинки заставок и подписей рисует Chrome (шрифт Golos Text из docs/process/fonts), видео собирает ffmpeg.
// Запуск: OUT=<папка с записями> E2E_CHROMIUM_PATH=<chrome> node docs/process/video/make.cjs
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(path.resolve(__dirname, '../../../e2e/node_modules/playwright'));

const OUT = process.env.OUT;
if (!OUT) throw new Error('Укажите OUT');
const A = path.join(OUT, 'assets');
const SEG = path.join(OUT, 'seg');
for (const d of [A, SEG]) fs.mkdirSync(d, { recursive: true });

const W = 1280, H = 720, FPS = 25;
const PHONE_H = 660; // телефон 390×844 → 305×660
const PHONE_W = Math.round((390 * PHONE_H) / 844 / 2) * 2;
const PHONE_X = 190, PHONE_Y = (H - PHONE_H) / 2;
const ORDER = ['login', 'grades', 'certificate', 'assistant', 'question', 'dean', 'answer', 'publish', 'ack', 'report', 'security'];
const ROLE = {
  login: 'Студентка, телефон', grades: 'Студентка, телефон', certificate: 'Студентка, телефон', assistant: 'Студентка, телефон',
  question: 'Студентка, телефон', dean: 'Деканат, компьютер', answer: 'Студентка, телефон', publish: 'Деканат, компьютер',
  ack: 'Студентка, телефон', report: 'Деканат, компьютер', security: 'Другой студент, компьютер',
};

const font = (w, name) => `@font-face{font-family:G;font-weight:${w};src:url(data:font/ttf;base64,${fs
  .readFileSync(path.join(__dirname, `../fonts/GolosText-${name}.ttf`)).toString('base64')})}`;
const FONTS = font(400, 'Regular') + font(600, 'SemiBold') + font(700, 'Bold');
const logo = 'data:image/png;base64,' + fs.readFileSync(path.join(__dirname, '../../../frontend/public/brand/logo-320.png')).toString('base64');
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const css = `${FONTS}*{margin:0;box-sizing:border-box}body{font-family:G,sans-serif;width:${W}px;height:${H}px;overflow:hidden}`;

function ff(args) { execFileSync('ffmpeg', ['-v', 'error', '-y', ...args], { stdio: 'inherit' }); }
const probe = (f) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

(async () => {
  const cues = JSON.parse(fs.readFileSync(path.join(OUT, 'cues.json'), 'utf8'));
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH || undefined });
  const page = await browser.newPage({ viewport: { width: W, height: H } });
  const shot = async (html, file, transparent = false) => {
    await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`);
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: file, omitBackground: transparent });
  };

  // Заставки
  const card = (body) => `<div style="height:100%;background:#0f1d40;color:#fff;display:flex;flex-direction:column;justify-content:center;padding:0 110px">${body}</div>`;
  await shot(card(`<img src="${logo}" style="width:120px;height:120px;border-radius:26px;margin-bottom:34px">
    <div style="font-weight:700;font-size:64px">Мой вуз</div>
    <div style="font-size:30px;margin-top:14px;max-width:900px;line-height:1.3">Личный кабинет студента МГИМО — концепт для конкурса «Цифровой деканат будущего»</div>
    <div style="font-size:22px;margin-top:34px;color:#b9c4dd">Все данные вымышлены · 24aboba.ru</div>`), path.join(A, 'title.png'));
  await shot(card(`<div style="font-weight:700;font-size:52px">Мой вуз · 24aboba.ru</div>
    <div style="font-size:26px;margin-top:22px;max-width:980px;line-height:1.4">Концепт для конкурса «Цифровой деканат будущего». Не официальный сервис МГИМО, все данные вымышлены.</div>
    <div style="font-size:24px;margin-top:30px;color:#dfe5f2">Команда: Артём Лыткин, Всеволод Омельченко, Владислав Пилипенко</div>
    <div style="font-size:20px;margin-top:30px;color:#b9c4dd">Видео записано автоматически: Claude Code проходит сценарий на сайте через Playwright</div>`), path.join(A, 'end.png'));

  // Фон для сцен с телефоном: рамка телефона слева, место для подписи справа
  await shot(`<div style="height:100%;background:#e9edf4;position:relative">
    <div style="position:absolute;left:${PHONE_X - 12}px;top:${PHONE_Y - 12}px;width:${PHONE_W + 24}px;height:${PHONE_H + 24}px;border-radius:34px;background:#14171d;box-shadow:0 18px 50px rgba(15,29,64,.28)"></div>
    <div style="position:absolute;right:56px;bottom:34px;font-size:18px;color:#6b7487">Мой вуз · концепт для конкурса · данные вымышлены</div></div>`,
  path.join(A, 'phone-bg.png'));

  const segs = [];
  const addCard = (name, secs) => {
    const out = path.join(SEG, `${name}.mp4`);
    ff(['-loop', '1', '-t', String(secs), '-i', path.join(A, `${name}.png`), '-vf', `fade=in:st=0:d=0.5,fade=out:st=${secs - 0.5}:d=0.5,format=yuv420p`,
      '-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out]);
    segs.push(out);
  };
  addCard('title', 5);

  for (const name of ORDER) {
    const c = cues[name];
    const src = path.join(OUT, `${name}.webm`);
    const dur = probe(src);
    const phone = c.device === 'phone';
    const caps = [];
    for (const [i, q] of c.cues.entries()) {
      const file = path.join(A, `${name}-${i}.png`);
      if (phone) {
        await shot(`<div style="position:absolute;left:${PHONE_X + PHONE_W + 90}px;top:0;bottom:0;right:80px;display:flex;flex-direction:column;justify-content:center">
          <div style="font-size:20px;font-weight:600;color:#1e3f8c;margin-bottom:16px">${esc(ROLE[name])}</div>
          <div style="font-size:38px;font-weight:600;line-height:1.28;color:#1a1d24">${esc(q.text)}</div></div>`, file, true);
      } else {
        await shot(`<div style="position:absolute;left:0;right:0;bottom:28px;display:flex;justify-content:center">
          <div style="max-width:1040px;background:rgba(15,29,64,.92);color:#fff;border-radius:16px;padding:16px 28px;box-shadow:0 8px 30px rgba(0,0,0,.25)">
          <div style="font-size:16px;font-weight:600;color:#b9c4dd;margin-bottom:6px">${esc(ROLE[name])}</div>
          <div style="font-size:28px;font-weight:600;line-height:1.3">${esc(q.text)}</div></div></div>`, file, true);
      }
      const from = i === 0 ? 0 : q.t;
      const to = i + 1 < c.cues.length ? c.cues[i + 1].t : dur + 1;
      caps.push({ file, from, to });
    }
    const out = path.join(SEG, `${name}.mp4`);
    const inputs = [];
    let filter;
    if (phone) {
      inputs.push('-loop', '1', '-t', String(dur), '-i', path.join(A, 'phone-bg.png'), '-i', src);
      filter = `[1:v]scale=${PHONE_W}:${PHONE_H},setsar=1[ph];[0:v][ph]overlay=${PHONE_X}:${PHONE_Y}[v0]`;
    } else {
      inputs.push('-i', src);
      filter = `[0:v]scale=${W}:${H},setsar=1[v0]`;
    }
    const base = phone ? 2 : 1;
    caps.forEach((cp, i) => {
      inputs.push('-loop', '1', '-t', String(dur), '-i', cp.file);
      filter += `;[v${i}][${base + i}:v]overlay=0:0:enable='between(t,${cp.from.toFixed(2)},${cp.to.toFixed(2)})'[v${i + 1}]`;
    });
    filter += `;[v${caps.length}]fade=in:st=0:d=0.35,fade=out:st=${(dur - 0.35).toFixed(2)}:d=0.35,format=yuv420p[out]`;
    ff([...inputs, '-filter_complex', filter, '-map', '[out]', '-t', dur.toFixed(2), '-r', String(FPS), '-c:v', 'libx264', '-crf', '18', '-preset', 'medium', out]);
    segs.push(out);
    console.log(`${name}: ${dur.toFixed(1)} с`);
  }
  addCard('end', 7);
  await browser.close();

  // Склейка и тихая дорожка звука: некоторые площадки не принимают видео без звука
  const list = path.join(SEG, 'list.txt');
  fs.writeFileSync(list, segs.map((s) => `file '${s.replace(/\\/g, '/')}'`).join('\n'));
  const joined = path.join(SEG, 'joined.mp4');
  ff(['-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', joined]);
  const final = path.join(OUT, 'moy-vuz-demo.mp4');
  ff(['-i', joined, '-f', 'lavfi', '-i', 'anullsrc=r=44100:cl=stereo', '-shortest', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '64k', '-movflags', '+faststart', final]);
  console.log(`Готово: ${final}, ${probe(final).toFixed(1)} с`);
})().catch((e) => { console.error(String(e).slice(0, 500)); process.exit(1); });
