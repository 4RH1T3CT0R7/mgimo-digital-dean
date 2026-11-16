import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { resetNotificationsState } from '@/mocks/handlers/notifications';
import { renderWithProviders, server } from '@/test/render';

const normal = 'Новости и мероприятия — в отдельном разделе';
const urgent = 'Плановые работы в ночь на 28 ноября';

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
  resetNotificationsState();
});
afterEach(() => vi.useRealTimers());

describe('Баннеры администратора у студента', () => {
  it('обычный — карточка на «Сегодня», её можно скрыть; срочный остаётся полосой', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    const card = within((await screen.findByRole('heading', { name: normal })).closest('section')!);
    expect(card.getByRole('link', { name: 'Открыть раздел' })).toHaveAttribute('href', '/news');
    const strip = (await screen.findByText(urgent)).closest<HTMLElement>('[role="status"]');
    expect(strip).not.toBeNull();
    expect(within(strip!).queryByRole('button')).not.toBeInTheDocument();

    await user.click(card.getByRole('button', { name: `Скрыть «${normal}»` }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: normal })).not.toBeInTheDocument());
    expect(screen.getByText(urgent)).toBeVisible();
  });

  it('срочная полоса — на всех страницах студента', async () => {
    renderWithProviders(<AppRoutes />, { route: '/notifications', login: 'student.mo' });
    expect(await screen.findByText(urgent)).toBeVisible();
    expect(screen.queryByRole('heading', { name: normal })).not.toBeInTheDocument();
  });

  it('ссылку не на https и не на раздел кабинета не показываем', async () => {
    server.use(http.get('/api/notifications/me/banners', () => HttpResponse.json([
      { id: 'b1', title: 'Проверка ссылки', body: null, priority: 'normal', link_url: 'javascript:alert(1)', link_label: 'Нажми',
        starts_at: '2026-11-14T09:00:00+03:00', ends_at: '2026-11-28T23:59:00+03:00' },
    ])));
    renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Проверка ссылки' })).toBeVisible();
    expect(screen.queryByText('Нажми')).not.toBeInTheDocument();
  });
});
