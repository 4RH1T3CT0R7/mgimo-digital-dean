import { expect, type Page } from '@playwright/test';

export const mockMode = process.env.E2E_MOCK === '1';
export const studentId = '30000000-0000-4000-8000-000000000001';
export const scheduleDate = process.env.E2E_SCHEDULE_DATE || '2026-11-19';

const accounts = {
  'student.mo': 'E2E_PASSWORD_STUDENT_MO',
  'student.meo': 'E2E_PASSWORD_STUDENT_MEO',
  'dekanat.mo': 'E2E_PASSWORD_DEKANAT_MO',
  'dekanat.meo': 'E2E_PASSWORD_DEKANAT_MEO',
  admin: 'E2E_PASSWORD_ADMIN',
} as const;
export type Account = keyof typeof accounts;

export function password(account: Account) {
  const key = accounts[account];
  const value = process.env[key];
  if (!value) throw new Error(`Укажите ${key}.`);
  return value;
}

export async function login(page: Page, account: Account) {
  const heading = page.getByRole('heading', { name: 'Вход в личный кабинет' });
  if (!new URL(page.url()).pathname.startsWith('/login')) await page.goto('/login');
  await expect(heading).toBeVisible();
  await page.getByLabel('Логин', { exact: true }).fill(account);
  await page.getByLabel('Пароль', { exact: true }).fill(password(account));
  await page.getByRole('button', { name: 'Войти', exact: true }).click();
  await expect(page.getByRole('heading', { name: account.startsWith('student.') ? 'Сегодня' : 'Заявки', exact: true })).toBeVisible();
}

export async function logout(page: Page, fromProfile = false) {
  if (fromProfile) {
    await page.getByRole('button', { name: /^Меню пользователя/ }).click();
    await page.getByRole('menuitem', { name: 'Профиль', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Профиль' })).toBeVisible();
    await page.getByRole('button', { name: 'Выйти', exact: true }).click();
  } else {
    await page.getByRole('button', { name: /^Меню пользователя/ }).click();
    await page.getByRole('menuitem', { name: 'Выйти', exact: true }).click();
  }
  await expect(page.getByRole('heading', { name: 'Вход в личный кабинет' })).toBeVisible();
}

export function nav(page: Page, name: string | RegExp) {
  return page.getByRole('navigation', { name: 'Разделы' }).getByRole('link', { name, exact: typeof name === 'string' });
}

export async function openService(page: Page, title: string) {
  await nav(page, 'Заявки').click();
  await page.getByRole('region', { name: 'Подать заявку' }).getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
}
