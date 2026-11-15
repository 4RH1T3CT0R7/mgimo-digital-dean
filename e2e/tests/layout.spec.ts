import { expect, test, type Page } from '@playwright/test';
import { login, scheduleDate, type Account } from './helpers.js';

async function checkWidth(page: Page, width: number) {
  const result = await page.evaluate((expectedWidth) => {
    const root = document.documentElement;
    const offenders = Array.from(document.body.getElementsByTagName('*')).flatMap((element) => {
      const box = element.getBoundingClientRect();
      const style = getComputedStyle(element);
      if (box.width <= 1 || box.height <= 1 || style.visibility !== 'visible' ||
          style.clip !== 'auto' || style.clipPath !== 'none') return [];

      // Внутренние списки могут прокручиваться внутри собственной рамки.
      let left = box.left;
      let right = box.right;
      for (let parent = element.parentElement; parent && parent !== root; parent = parent.parentElement) {
        if (getComputedStyle(parent).overflowX !== 'visible') {
          const clip = parent.getBoundingClientRect();
          left = Math.max(left, clip.left);
          right = Math.min(right, clip.right);
        }
      }
      if (right <= left || (left >= -1 && right <= expectedWidth + 1)) return [];
      return [`${element.tagName.toLowerCase()} [${Math.round(left)}, ${Math.round(right)}]`];
    });
    return { scrollWidth: root.scrollWidth, offenders: offenders.slice(0, 12) };
  }, width);
  expect(result.scrollWidth, 'ширина документа').toBeLessThanOrEqual(width);
  expect(result.offenders, 'видимые элементы за краем экрана').toEqual([]);
}

const screens: { account: Account; route: string; heading: string; content: (page: Page) => ReturnType<Page['getByRole']> }[] = [
  { account: 'student.mo', route: '/', heading: 'Сегодня', content: (page) => page.getByRole('heading', { name: 'Сейчас / Далее' }) },
  { account: 'student.mo', route: `/schedule?date=${encodeURIComponent(scheduleDate)}`, heading: 'Расписание', content: (page) => page.getByText(/^Перенесено (на|с) /).first() },
  { account: 'student.mo', route: '/grades', heading: 'Успеваемость', content: (page) => page.getByRole('region', { name: 'Сводка успеваемости' }) },
  { account: 'student.mo', route: '/requests', heading: 'Заявки', content: (page) => page.getByRole('region', { name: 'Подать заявку' }) },
  // Не кнопка «Ознакомлен(а)»: подтверждение необратимо, после него кнопки нет. Ждём загруженную ленту.
  { account: 'student.mo', route: '/notifications', heading: 'Уведомления и дедлайны', content: (page) => page.getByRole('region', { name: 'Лента' }).getByRole('listitem').first() },
  { account: 'student.mo', route: '/profile', heading: 'Профиль', content: (page) => page.getByRole('button', { name: 'Выйти' }) },
  { account: 'dekanat.mo', route: '/staff', heading: 'Заявки', content: (page) => page.getByRole('region', { name: 'Счётчики' }).getByRole('button', { name: /^Новые:/ }) },
  { account: 'dekanat.mo', route: '/staff/announcements', heading: 'Объявления', content: (page) => page.getByRole('button', { name: 'Новое объявление' }) },
  { account: 'dekanat.mo', route: '/staff/deadlines', heading: 'Дедлайны', content: (page) => page.getByRole('button', { name: 'Новый дедлайн' }) },
  { account: 'dekanat.mo', route: '/staff/lessons', heading: 'Занятия', content: (page) => page.getByRole('combobox', { name: 'Группа', exact: true }) },
];

for (const screen of screens) {
  test(`360 px: ${screen.route}`, async ({ page, viewport }) => {
    expect(viewport?.width).toBe(360);
    await login(page, screen.account);
    if (new URL(page.url()).pathname !== screen.route) await page.goto(screen.route);
    await expect(page.getByRole('heading', { name: screen.heading, exact: true })).toBeVisible();
    await expect(screen.content(page)).toBeVisible();
    await expect(page.getByText('Не удалось загрузить данные', { exact: true })).toHaveCount(0);
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    await checkWidth(page, 360);
  });
}
