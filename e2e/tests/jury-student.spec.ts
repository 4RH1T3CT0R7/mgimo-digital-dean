import { open, stat } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { login, logout, nav, openService, scheduleDate } from './helpers.js';

test('жюри: студент смотрит расписание, оценки и скачивает справку', async ({ page }, testInfo) => {
  await login(page, 'student.mo');

  await page.goto(`/schedule?date=${encodeURIComponent(scheduleDate)}`);
  await expect(page.getByRole('heading', { name: 'Расписание', exact: true })).toBeVisible();
  await expect(page.getByText(/^Перенесено (на|с) /).first()).toBeVisible();

  await nav(page, 'Учёба').click();
  const summary = page.getByRole('region', { name: 'Сводка успеваемости' });
  await expect(summary.getByText('Средний балл')).toBeVisible();
  await expect(summary.getByRole('list', { name: 'Дисциплины по степени риска' }).getByRole('listitem')).toHaveCount(3);

  await openService(page, 'Справка с места учёбы');
  await page.getByRole('combobox', { name: 'Для чего нужна справка' }).click();
  await page.getByRole('option', { name: 'По месту требования', exact: true }).click();
  await page.getByRole('button', { name: 'Подать заявку', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Справка готова' })).toBeVisible();
  const downloading = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать PDF', exact: true }).click();
  const download = await downloading;
  expect(download.suggestedFilename()).toMatch(/\.pdf$/i);
  const filePath = testInfo.outputPath('certificate.pdf');
  await download.saveAs(filePath);
  expect((await stat(filePath)).size).toBeGreaterThan(0);
  const file = await open(filePath);
  try {
    const signature = Buffer.alloc(5);
    await file.read(signature, 0, signature.length, 0);
    expect(signature.toString('ascii')).toBe('%PDF-');
  } finally {
    await file.close();
  }
  await logout(page, true);
});
