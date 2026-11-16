import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders } from '@/test/render';

const params = (link: HTMLElement) => Object.fromEntries(new URL(link.getAttribute('href')!, location.origin).searchParams);

describe('W1: «Полезное»', () => {
  it('карточка деканата своего факультета и официальные ссылки в новой вкладке', async () => {
    renderWithProviders(<AppRoutes />, { route: '/useful#dean', login: 'student.mo' });
    const dean = await screen.findByRole('region', { name: 'Деканат ФМО' });
    expect(dean).toHaveAttribute('id', 'dean');
    expect(within(dean).getByRole('link', { name: /Корпус Б, 1051.*где это/ })).toHaveAttribute('href', expect.stringContaining('room=1051'));
    expect(within(dean).getByText('dekanat.fmo@moy-vuz.example')).toBeInTheDocument();
    expect(within(dean).getByText(/часы приёма и почта вымышлены/)).toBeInTheDocument();

    const external = screen.getAllByRole('link', { name: /\(в новой вкладке\)$/ }).filter((l) => !dean.contains(l));
    expect(external).toHaveLength(15);
    for (const link of external) {
      expect(link).toHaveAttribute('target', '_blank');
      expect(link.getAttribute('href')).toMatch(/^https:\/\/(mgimo\.ru|lks\.mgimo\.ru|t\.me)\//);
    }
  });

  it('на входе — где найти деканат: часы и карта кампуса', async () => {
    renderWithProviders(<AppRoutes />, { route: '/login' });
    const where = await screen.findByRole('region', { name: 'Где найти деканат' });
    expect(where).toHaveTextContent('с понедельника по четверг с 10:00 до 17:00');
    expect(within(where).getByRole('link', { name: /Карта кампуса на mgimo\.ru/ })).toHaveAttribute('href', 'https://mgimo.ru/territory/');
  });
});

describe('W1: вопрос в деканат без тупиков', () => {
  it('«Учёба»: у дисциплины «Нужно внимание» — «Спросить о пересдаче» с темой и вопросом', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/grades', login: 'student.mo' });
    const first = within(await screen.findByRole('list', { name: 'Дисциплины текущего семестра' })).getAllByRole('article')[0];
    const link = within(first).getByRole('link', { name: 'Спросить о пересдаче' });
    expect(params(link)).toEqual({ topic: 'Учебный процесс', question: 'Как пересдать дисциплину «Французский язык»? Подскажите сроки и порядок.' });

    await user.click(link);
    expect(await screen.findByRole('combobox', { name: /Тема/ })).toHaveTextContent('Учебный процесс');
    expect(screen.getByLabelText('Ваш вопрос')).toHaveValue('Как пересдать дисциплину «Французский язык»? Подскажите сроки и порядок.');
  });

  it('профиль: «сообщите в деканат» — ссылка на вопрос', async () => {
    renderWithProviders(<AppRoutes />, { route: '/profile', login: 'student.mo' });
    expect(params(await screen.findByRole('link', { name: 'сообщите в деканат' }))).toMatchObject({ topic: 'Другое' });
  });

  it('помощник: «Не помогло — спросить деканат» с текстом вопроса', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/assistant', login: 'student.mo' });
    await user.type(await screen.findByLabelText('Ваш вопрос'), 'Как оформить академический отпуск?{Enter}');
    const link = await screen.findByRole('link', { name: 'Не помогло — спросить деканат' });
    expect(params(link)).toEqual({ topic: 'Другое', question: 'Как оформить академический отпуск?' });
  });
});
