// Видео-демонстрация (T22): Playwright проходит сценарий на проде и пишет экран по сценам.
// Каждая сцена — отдельный файл .webm и подписи с временем в cues.json; склеивает make.cjs.
// Пароли тестовых аккаунтов — только из переменных окружения VIDEO_PW_STUDENT_MO, VIDEO_PW_STUDENT_MEO,
// VIDEO_PW_DEKANAT_MO; в файлы и вывод не попадают. Сессии входа хранятся в OUT и удаляются в конце.
// Запуск: OUT=<папка> E2E_CHROMIUM_PATH=<chrome> node docs/process/video/record.cjs [сцена ...]
const fs = require('fs');
const path = require('path');
const { chromium } = require(path.resolve(__dirname, '../../../e2e/node_modules/playwright'));

const BASE = process.env.BASE_URL || 'https://24aboba.ru';
const OUT = process.env.OUT;
if (!OUT) throw new Error('Укажите OUT — папку для записей');
fs.mkdirSync(OUT, { recursive: true });

const PW = {
  'student.mo': process.env.VIDEO_PW_STUDENT_MO,
  'student.meo': process.env.VIDEO_PW_STUDENT_MEO,
  'dekanat.mo': process.env.VIDEO_PW_DEKANAT_MO,
};

// Телефон — тёмная тема, ПК — светлая: видно, что работают обе.
const DEVICES = {
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, colorScheme: 'dark', video: { width: 390, height: 844 } },
  pc: { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1.5, colorScheme: 'light', video: { width: 1280, height: 720 } },
};

// Точка касания: без неё в записи не видно, куда нажимают.
const CURSOR = `(() => {
  const mk = () => {
    if (document.getElementById('__tap')) return;
    const c = document.createElement('div'); c.id = '__tap';
    Object.assign(c.style, { position: 'fixed', left: '-11px', top: '-11px', width: '22px', height: '22px', borderRadius: '50%',
      background: 'rgba(255,255,255,.45)', border: '2px solid rgba(240,160,40,.95)', boxShadow: '0 1px 6px rgba(0,0,0,.45)',
      zIndex: '2147483647', pointerEvents: 'none', opacity: '0', transition: 'transform 80ms linear' });
    document.documentElement.appendChild(c);
    let x = 0, y = 0, s = 1;
    const put = () => { c.style.transform = 'translate(' + x + 'px,' + y + 'px) scale(' + s + ')'; };
    addEventListener('mousemove', (e) => { x = e.clientX; y = e.clientY; c.style.opacity = '1'; put(); }, true);
    addEventListener('mousedown', () => { s = 0.65; put(); }, true);
    addEventListener('mouseup', () => { s = 1; put(); }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mk); else mk();
})();`;

const wait = (page, ms) => page.waitForTimeout(ms);
async function point(page, loc) {
  // В центр экрана: у края элемент может оказаться под нижней панелью вкладок
  await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }));
  await wait(page, 600);
  const b = await loc.boundingBox();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2, { steps: 16 });
  await wait(page, 250);
}
async function tap(page, loc) {
  await point(page, loc);
  await page.mouse.down(); await wait(page, 90); await page.mouse.up();
  await wait(page, 700);
}
async function type(page, loc, text) {
  await tap(page, loc);
  await loc.pressSequentially(text, { delay: 40 });
  await wait(page, 400);
}
async function scroll(page, dy, ms = 1100) {
  await page.evaluate((d) => window.scrollBy({ top: d, behavior: 'smooth' }), dy);
  await wait(page, ms);
}
async function show(page, loc, ms = 1200) {
  await loc.evaluate((el) => el.scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await wait(page, ms);
}
const nav = (page, name) => page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name, exact: true });

async function login(browser, account, device) {
  const file = path.join(OUT, `state-${account}-${device}.json`);
  if (fs.existsSync(file)) return file;
  if (!PW[account]) throw new Error(`Нет пароля для ${account}`);
  const ctx = await browser.newContext({ ...DEVICES[device], video: undefined, serviceWorkers: 'block' });
  const page = await ctx.newPage();
  await page.goto(BASE + '/login');
  await page.getByLabel('Логин', { exact: true }).fill(account);
  await page.getByLabel('Пароль', { exact: true }).fill(PW[account]);
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await page.waitForURL((u) => !u.pathname.startsWith('/login'));
  await ctx.storageState({ path: file });
  await ctx.close();
  return file;
}

const shared = path.join(OUT, 'shared.json'); // номер и адрес заявки между сценами
const getShared = () => (fs.existsSync(shared) ? JSON.parse(fs.readFileSync(shared, 'utf8')) : {});
const setShared = (v) => fs.writeFileSync(shared, JSON.stringify({ ...getShared(), ...v }));

// Сцены: устройство, аккаунт (null — без входа), подписи по ходу записи.
const SCENES = {
  async login(page, cue) {
    await page.goto(BASE + '/login'); await wait(page, 600);
    cue('Вход по логину и паролю. Аккаунты тестовые, все данные вымышлены');
    await wait(page, 1200);
    await type(page, page.getByLabel('Логин', { exact: true }), 'student.mo');
    await type(page, page.getByLabel('Пароль', { exact: true }), PW['student.mo']);
    await tap(page, page.getByRole('button', { name: 'Войти', exact: true }));
    await page.getByRole('heading', { name: 'Сегодня', exact: true }).waitFor();
    cue('«Сегодня»: что ждёт ответа, ближайшие пары и изменения в расписании');
    await wait(page, 3000); await scroll(page, 420, 2200); await scroll(page, 420, 2200);
    await tap(page, nav(page, 'Расписание'));
    await page.getByRole('heading', { name: 'Расписание', exact: true }).waitFor();
    let moved = page.getByText(/^Перенесено (на|с) /).first();
    if (!(await moved.isVisible().catch(() => false))) {
      await page.goto(BASE + '/schedule?date=2026-11-19');
      moved = page.getByText(/^Перенесено (на|с) /).first();
      await moved.waitFor();
    }
    cue('Перенос, отмена и смена аудитории видны прямо в расписании');
    await wait(page, 1200); await show(page, moved, 3500);
    const room = page.locator('main a[href*="mgimo.ru/territory"]').first();
    if (await room.count()) {
      cue('Аудитория открывает план этажа с карты МГИМО');
      await tap(page, room); await wait(page, 3500);
      await page.keyboard.press('Escape'); await wait(page, 600);
    }
  },
  async grades(page, cue) {
    await page.goto(BASE + '/'); await wait(page, 800);
    await tap(page, nav(page, 'Учёба'));
    const summary = page.getByRole('region', { name: 'Сводка успеваемости' });
    await summary.waitFor();
    cue('«Учёба»: средний балл, рейтинг и светофор по каждому предмету');
    await show(page, summary, 3500);
    cue('Видно, где нужно подтянуться, ещё до сессии');
    await scroll(page, 500, 2200); await scroll(page, 500, 2600);
  },
  async certificate(page, cue) {
    await page.goto(BASE + '/'); await wait(page, 800);
    await tap(page, nav(page, 'Заявки'));
    cue('Справка с места учёбы: выбрать, для чего нужна, и подать');
    await tap(page, page.getByRole('region', { name: 'Подать заявку' }).getByRole('link', { name: /Справка с места учёбы/ }));
    await tap(page, page.getByRole('combobox', { name: 'Для чего нужна справка' }));
    await tap(page, page.getByRole('option', { name: 'По месту требования', exact: true }));
    await tap(page, page.getByRole('button', { name: 'Подать заявку', exact: true }));
    await page.getByRole('heading', { name: 'Справка готова' }).waitFor();
    cue('Справка готова сразу, ждать деканат не нужно');
    await wait(page, 2500);
    const verify = page.getByRole('link', { name: /Страница проверки/ });
    await show(page, verify, 2000);
    cue('По QR-коду на справке любой проверит её подлинность');
    const href = await verify.getAttribute('href');
    await point(page, verify); await page.mouse.down(); await wait(page, 90); await page.mouse.up();
    // Ссылка открывается в новой вкладке; в записи показываем ту же страницу в этом окне
    for (const p of page.context().pages()) if (p !== page) await p.close();
    await page.goto(new URL(href, BASE).href); await wait(page, 3500);
  },
  async assistant(page, cue) {
    await page.goto(BASE + '/'); await wait(page, 800);
    await tap(page, nav(page, 'Ещё'));
    cue('В «Ещё» — новости, электронный студенческий, полезные ссылки и помощник');
    await wait(page, 2200);
    await tap(page, page.getByRole('main').getByRole('link', { name: /Студенческий/ }));
    cue('Электронный студенческий с QR-кодом — учебный прототип, не документ');
    await wait(page, 3200);
    await page.goBack(); await wait(page, 900);
    await tap(page, page.getByRole('main').getByRole('link', { name: /Помощник/ }));
    cue('Помощник отвечает по справочнику деканата и документам, которые загружают сотрудники');
    await type(page, page.getByLabel('Ваш вопрос'), 'Как получить справку для военкомата?');
    await tap(page, page.getByRole('button', { name: 'Спросить', exact: true }));
    await wait(page, 3500);
    await scroll(page, 400, 3000);
  },
  async question(page, cue) {
    await page.goto(BASE + '/'); await wait(page, 800);
    await tap(page, nav(page, 'Заявки'));
    await tap(page, page.getByRole('region', { name: 'Подать заявку' }).getByRole('link', { name: /Вопрос в деканат/ }));
    cue('Вопрос в деканат — тоже заявка: со статусом и ответом в одном месте');
    await type(page, page.getByLabel('Ваш вопрос'), 'Можно ли перенести экзамен, если он совпадает с олимпиадой?');
    await tap(page, page.getByRole('button', { name: 'Подать заявку', exact: true }));
    const heading = page.getByRole('heading', { name: /^Заявка №\s*\d+$/ });
    await heading.waitFor();
    setShared({ number: (await heading.innerText()).match(/\d+$/)[0], url: page.url() });
    await wait(page, 3000);
  },
  async dean(page, cue) {
    const { number } = getShared();
    await page.goto(BASE + '/staff'); await page.getByRole('heading', { name: 'Заявки', exact: true }).waitFor();
    cue('Сотрудник деканата видит заявки своего факультета, просроченные — сверху');
    await wait(page, 3500);
    const filters = page.getByRole('button', { name: 'Фильтры и поиск', exact: true });
    if (await filters.isVisible()) await tap(page, filters);
    await type(page, page.getByRole('searchbox', { name: 'Поиск' }), number);
    await tap(page, page.getByRole('button', { name: 'Найти' }));
    await tap(page, page.getByRole('link', { name: new RegExp(`^№\\s*${number}\\b`) }));
    cue('Берёт заявку в работу, отвечает студенту и закрывает её');
    await wait(page, 1500);
    await tap(page, page.getByRole('button', { name: 'Взять в работу', exact: true }));
    await type(page, page.getByLabel('Ответ студенту'), 'Да, если олимпиада входит в официальный перечень. Принесите подтверждение участия, и мы назначим другую дату.');
    await tap(page, page.getByRole('button', { name: 'Отправить', exact: true }));
    await wait(page, 1200);
    await tap(page, page.getByRole('button', { name: 'Завершить заявку', exact: true }));
    await tap(page, page.getByRole('dialog').getByRole('button', { name: 'Завершить', exact: true }));
    await wait(page, 2500);
  },
  async answer(page, cue) {
    const { number, url } = getShared();
    await page.goto(BASE + '/'); await wait(page, 1200);
    cue('Студенту сразу приходит уведомление об ответе');
    await tap(page, page.getByRole('link', { name: /^Уведомления/ }));
    await tap(page, page.getByRole('group', { name: 'Тип уведомлений' }).getByRole('button', { name: 'Заявки', exact: true }));
    const notice = page.getByText(`Ответ по заявке №${number}`, { exact: true });
    await show(page, notice, 2000);
    await tap(page, notice);
    if (!page.url().startsWith(url)) await page.goto(url);
    await wait(page, 1200);
    cue('Ответ деканата — прямо в заявке');
    await show(page, page.getByText(/^Да, если олимпиада/).first(), 3500);
    const ask = page.getByText(/^(Ответ помог\?|Заявку выполнили так, как вам было нужно\?)$/).first();
    await show(page, ask, 1500);
    cue('Ответ можно оценить, и деканат видит, помогают ли его ответы');
    const box = ask.locator('xpath=ancestor::*[.//button][1]');
    await tap(page, box.getByRole('button').first());
    await wait(page, 2500);
  },
  async publish(page, cue) {
    await page.goto(BASE + '/staff/announcements'); await wait(page, 1500);
    cue('Деканат публикует объявление и просит подтвердить, что его прочитали');
    await tap(page, page.getByRole('button', { name: 'Новое объявление', exact: true }));
    const form = page.getByRole('dialog');
    await type(page, form.getByLabel('Заголовок'), 'Консультация перед экзаменом переносится');
    await type(page, form.getByLabel('Текст'), 'Консультация по мировой экономике пройдёт 26 ноября в 15:50, корпус Г, аудитория 2116.');
    await tap(page, form.getByRole('checkbox', { name: 'Попросить подтвердить ознакомление' }));
    await tap(page, form.getByRole('combobox', { name: 'Кому показать' }));
    await tap(page, page.getByRole('option', { name: 'Группа', exact: true }));
    await tap(page, form.getByRole('combobox', { name: 'Группа' }));
    await tap(page, page.getByRole('option', { name: 'МО-24-03', exact: true }));
    await tap(page, form.getByRole('button', { name: 'Опубликовать', exact: true }));
    await wait(page, 2500);
  },
  async ack(page, cue) {
    await page.goto(BASE + '/'); await wait(page, 1500);
    cue('Студент видит его в уведомлениях и нажимает «Ознакомлен(а)»');
    await tap(page, page.getByRole('link', { name: /^Уведомления/ }));
    const btn = page.getByRole('button', { name: 'Ознакомлен(а)', exact: true }).first();
    await show(page, btn, 1500);
    await tap(page, btn);
    await wait(page, 2500);
  },
  async report(page, cue) {
    await page.goto(BASE + '/staff/announcements'); await wait(page, 1500);
    cue('Деканат видит, кто прочитал объявление, а кто ещё нет');
    await tap(page, page.getByRole('link', { name: /^Отчёт: ознакомились/ }).first());
    await wait(page, 4000);
  },
  async security(page, cue) {
    const { url } = getShared();
    await page.goto(BASE + '/'); await wait(page, 1200);
    cue('Другой студент открывает чужую заявку по прямой ссылке');
    await wait(page, 1500);
    await page.goto(url); await wait(page, 3500);
    cue('Не выйдет: каждый видит только своё');
    await wait(page, 2500);
    await tap(page, nav(page, 'Безопасность'));
    cue('«Безопасность»: где выполнен вход и выход на всех других устройствах');
    await wait(page, 4000);
  },
};
const PLAN = [
  ['login', 'phone', null], ['grades', 'phone', 'student.mo'], ['certificate', 'phone', 'student.mo'],
  ['assistant', 'phone', 'student.mo'], ['question', 'phone', 'student.mo'], ['dean', 'pc', 'dekanat.mo'],
  ['answer', 'phone', 'student.mo'], ['publish', 'pc', 'dekanat.mo'], ['ack', 'phone', 'student.mo'], ['report', 'pc', 'dekanat.mo'],
  ['security', 'pc', 'student.meo'],
];

(async () => {
  const only = process.argv.slice(2);
  const browser = await chromium.launch({ executablePath: process.env.E2E_CHROMIUM_PATH });
  const cuesFile = path.join(OUT, 'cues.json');
  const cues = fs.existsSync(cuesFile) ? JSON.parse(fs.readFileSync(cuesFile, 'utf8')) : {};
  try {
    for (const [name, device, account] of PLAN) {
      if (only.length && !only.includes(name)) continue;
      const d = DEVICES[name === 'login' ? 'phone' : device];
      const storageState = account ? await login(browser, account, device) : undefined;
      const dir = path.join(OUT, 'raw', name);
      fs.rmSync(dir, { recursive: true, force: true });
      const ctx = await browser.newContext({ ...d, video: undefined, storageState, serviceWorkers: 'block', recordVideo: { dir, size: d.video } });
      await ctx.addInitScript(CURSOR);
      const page = await ctx.newPage();
      const t0 = Date.now();
      const list = [];
      try {
        await SCENES[name](page, (text) => list.push({ t: (Date.now() - t0) / 1000, text }));
        await wait(page, 600);
      } catch (e) {
        await page.screenshot({ path: path.join(OUT, `fail-${name}.png`) }).catch(() => {});
        throw new Error(`${name}: ${String(e.message).split('\n')[0]}`);
      } finally {
        const duration = (Date.now() - t0) / 1000;
        const video = page.video();
        await ctx.close();
        fs.renameSync(await video.path(), path.join(OUT, `${name}.webm`));
        cues[name] = { device, duration, cues: list };
        fs.writeFileSync(cuesFile, JSON.stringify(cues, null, 1));
      }
      console.log(`${name}: ${cues[name].duration.toFixed(1)} с, подписей ${list.length}`);
    }
  } finally {
    await browser.close();
  }
})().catch((e) => { console.error(String(e).slice(0, 400)); process.exit(1); });
