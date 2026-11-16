import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { academicYearEnd } from '@/mocks/fixtures/requests';
import { formatDate } from '@/shared/lib/format';
import { renderWithProviders } from '@/test/render';

describe('Студенческий /student-card (D60)', () => {
  it('карточка: пометка прототипа, силуэт вместо фото, данные, QR с сервера и код', async () => {
    renderWithProviders(<AppRoutes />, { route: '/student-card', login: 'student.mo' });
    const card = await screen.findByRole('article', { name: 'Студенческий билет' });

    expect(within(card).getByText('Учебный прототип')).toBeInTheDocument();
    expect(within(card).getByText('Не является документом, данные вымышлены')).toBeInTheDocument();
    expect(within(card).getByText('Лебедева Анна Викторовна')).toBeInTheDocument();
    expect(within(card).getByText('Факультет международных отношений')).toBeInTheDocument();
    expect(within(card).getByText('41.03.05 Международные отношения')).toBeInTheDocument();
    expect(within(card).getByText('Очная')).toBeInTheDocument();
    expect(within(card).getByText('2401317')).toBeInTheDocument();
    expect(within(card).getByText(formatDate(academicYearEnd(), { withYear: true }))).toBeInTheDocument();
    expect(within(card).getByText('S7TQ4C2DMA')).toBeInTheDocument();
    expect(within(card).getByText('Покажите QR — по нему откроется страница проверки')).toBeInTheDocument();
    expect(within(card).getByRole('img', { name: /QR-код страницы проверки/ })).toHaveAttribute('src', '/api/requests/me/student-card/qr.png');
    // Фото не храним; знак — только «Мой вуз»
    expect(within(card).getAllByRole('img')).toHaveLength(1);
    expect(screen.getByRole('link', { name: /Страница проверки/ })).toHaveAttribute('href', '/verify/S7TQ4C2DMA');
    expect(document.body).not.toHaveTextContent(/пропуск/i);
  });

  it('пункт «Студенческий» в меню студента', async () => {
    renderWithProviders(<AppRoutes />, { route: '/student-card', login: 'student.mo' });
    const nav = (await screen.findAllByRole('navigation', { name: 'Разделы' }))[0];
    expect(within(nav).getByRole('link', { name: 'Студенческий' })).toHaveAttribute('aria-current', 'page');
  });

  it('ошибка загрузки — «Повторить»', async () => {
    renderWithProviders(<AppRoutes />, { route: '/student-card?scenario=error', login: 'student.mo' });
    expect(await screen.findByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('сотруднику страница недоступна', async () => {
    renderWithProviders(<AppRoutes />, { route: '/student-card', login: 'dekanat.mo' });
    expect(await screen.findByRole('heading', { name: 'Заявки' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/staff');
  });
});
