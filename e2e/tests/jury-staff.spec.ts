import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { login, logout, mockMode, nav, openService } from './helpers.js';

test('жюри: деканат отвечает, студент видит ответ и уведомление', async ({ page }) => {
  const marker = randomUUID();
  const question = `Где посмотреть график консультаций? T20 ${marker}`;
  const answer = `График уточните у преподавателя. T20 ${marker}`;

  await login(page, 'student.mo');
  await openService(page, 'Вопрос в деканат');
  await page.getByLabel('Ваш вопрос').fill(question);
  await page.getByRole('button', { name: 'Подать заявку', exact: true }).click();
  const heading = page.getByRole('heading', { name: /^Заявка №\s*\d+$/ });
  await expect(heading).toBeVisible();
  const number = (await heading.innerText()).match(/\d+$/)?.[0];
  expect(number, 'номер заявки после подачи').toBeTruthy();
  const applicationURL = page.url();
  await logout(page);

  await login(page, 'dekanat.mo');
  // Публичный API ищет по номеру или ФИО. Текст сверяется внутри карточки.
  const filters = page.getByRole('button', { name: 'Фильтры и поиск', exact: true });
  if (await filters.isVisible()) await filters.click();
  await page.getByRole('searchbox', { name: 'Поиск' }).fill(number!);
  await page.getByRole('button', { name: 'Найти' }).click();
  await page.getByRole('link', { name: new RegExp(`^№\\s*${number}\\b`) }).click();
  await expect(page.getByText(question, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Взять в работу', exact: true }).click();
  await page.getByLabel('Ответ студенту').fill(answer);
  await page.getByRole('button', { name: 'Отправить', exact: true }).click();
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Завершить заявку', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Завершить', exact: true }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByText(/^Статус:\s*Ответ дан$/)).toBeVisible();
  await logout(page);

  await login(page, 'student.mo');
  await nav(page, 'Заявки').click();
  await page.getByRole('link', { name: new RegExp(`Вопрос в деканат.*Ответ дан.*${number}`) }).click();
  await expect(page).toHaveURL(applicationURL);
  await expect(page.getByText(answer, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Статус:\s*Ответ дан$/)).toBeVisible();

  if (mockMode) {
    test.info().annotations.push({ type: 'mock', description: 'Доставка нового уведомления проверяется на настоящем API.' });
    return;
  }
  await test.step('новое уведомление о сообщении деканата', async () => {
    await nav(page, /^Уведомления/).click();
    // Важные непрочитанные из прошлых прогонов стоят выше: фильтр «Заявки» и листание до нужной строки.
    await page.getByRole('group', { name: 'Тип уведомлений' }).getByRole('button', { name: 'Заявки', exact: true }).click();
    const notice = page.getByText(`Ответ по заявке №${number}`, { exact: true });
    const more = page.getByRole('button', { name: 'Показать ещё', exact: true });
    await expect(notice.or(more).first()).toBeVisible();
    while (!(await notice.isVisible())) {
      await expect(more, 'уведомление не найдено ни на одной странице ленты').toBeVisible();
      await more.click();
      await expect(notice.or(more).first()).toBeVisible();
    }
  });
});
