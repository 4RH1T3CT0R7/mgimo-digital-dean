import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import type { components } from '@/api/notifications';
import { resetNotificationsState } from '@/mocks/handlers/notifications';
import { renderWithProviders, server } from '@/test/render';

const api = '/api/notifications';
const importantId = '71000000-0000-4000-8000-000000000005';
const applicationId = '50000000-0000-4000-8000-000000000004';
const renderPage = (scenario = '') => renderWithProviders(<AppRoutes />, { route: '/notifications' + scenario, login: 'student.mo' });

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
  resetNotificationsState();
});
afterEach(() => vi.useRealTimers());

describe('T11', () => {
  it('W1 — сегодня, завтра и через 5 дней', async () => {
    const items: components['schemas']['Deadline'][] = [0, 1, 5].map((days) => ({
      id: String(days), title: `Дедлайн ${days}`, kind: 'credit', due_at: `2026-11-${18 + days}T23:59:00+03:00`, days_left: days,
    }));
    const days: (string | null)[] = [];
    server.use(http.get(`${api}/me/deadlines`, ({ request }) => {
      days.push(new URL(request.url).searchParams.get('days'));
      return HttpResponse.json(items);
    }));
    renderPage();
    expect(await screen.findByText('сегодня', { exact: true })).toBeVisible();
    expect(screen.getByText('завтра', { exact: true })).toBeVisible();
    expect(screen.getByText('через 5 дней')).toBeVisible();
    expect(days).toEqual(['14']);
  });

  it('W2 — отправляет ack и показывает время подтверждения', async () => {
    const posted = vi.fn();
    const onRequest = ({ request }: { request: Request }) => {
      if (request.method === 'POST' && new URL(request.url).pathname === `${api}/me/feed/${importantId}/ack`) posted();
    };
    server.events.on('request:start', onRequest);
    try {
      const { user } = renderPage();
      const button = await screen.findByRole('button', { name: 'Ознакомлен(а)' });
      button.focus();
      await user.keyboard('{Enter}');
      expect(await screen.findByText('Вы ознакомились 18.11 в 10:00')).toBeVisible();
      expect(screen.queryByRole('button', { name: 'Ознакомлен(а)' })).not.toBeInTheDocument();
      expect(posted).toHaveBeenCalledOnce();
    } finally {
      server.events.removeListener('request:start', onRequest);
    }
  });

  it('W3 — отправляет unread_only=true', async () => {
    const unread = vi.fn();
    server.use(http.get(`${api}/me/feed`, ({ request }) => {
      unread(new URL(request.url).searchParams.get('unread_only'));
      return HttpResponse.json({ items: [], total: 0 });
    }));
    const { user } = renderPage();
    await user.click(await screen.findByRole('checkbox', { name: 'Только непрочитанные' }));
    await waitFor(() => expect(unread).toHaveBeenCalledWith('true'));
  });

  it('W4 — отправляет read и переходит к заявке', async () => {
    const posted = vi.fn();
    server.use(http.post(`${api}/me/feed/73000000-0000-4000-8000-000000000004/read`, () => {
      posted();
      return new HttpResponse(null, { status: 204 });
    }));
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: /Готово: заявка №000004/ }));
    await waitFor(() => expect(location.pathname).toBe(`/requests/${applicationId}`));
    expect(posted).toHaveBeenCalledOnce();
  });

  it('W5 — подача заявки ведёт к financial-aid', async () => {
    renderPage();
    expect(await screen.findByRole('link', { name: 'Подать заявку' })).toHaveAttribute('href', '/requests/new/financial-aid');
  });

  it('W6 — пустая лента', async () => {
    renderPage('?scenario=empty');
    expect(await screen.findByText('Новых уведомлений нет')).toBeVisible();
    expect(await screen.findByText('Предстоящих дедлайнов нет')).toBeVisible();
  });

  it('W7 — после 409 показывает ошибку и снова позволяет подтвердить', async () => {
    server.use(http.post(`${api}/me/feed/${importantId}/ack`, () =>
      HttpResponse.json({ code: 'conflict', message: 'Конфликт' }, { status: 409 })));
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Ознакомлен(а)' }));
    expect(await screen.findByText(/Не удалось подтвердить ознакомление/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Ознакомлен(а)' })).toBeEnabled();
  });

  it('запрашивает типы через запятую и следующую страницу с offset=20', async () => {
    const requested = vi.fn();
    const items = Array.from({ length: 21 }, (_, i): components['schemas']['FeedItem'] => ({
      id: String(i), type: 'news', title: `Новости ${i + 1}`, body: 'Текст', created_at: '2026-11-18T08:00:00+03:00',
      important: false, requires_ack: false, link: { kind: 'none' },
    }));
    server.use(http.get(`${api}/me/feed`, ({ request }) => {
      const params = new URL(request.url).searchParams;
      const offset = Number(params.get('offset'));
      requested(params.get('type'), params.get('limit'), offset);
      return HttpResponse.json({ items: items.slice(offset, offset + 20), total: items.length });
    }));
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Объявления' }));
    await user.click(await screen.findByRole('button', { name: 'Показать ещё' }));
    expect(await screen.findByText('Новости 21')).toBeVisible();
    expect(requested).toHaveBeenCalledWith('announcement,news', '20', 20);
  });

  it('после прочтения обновляет общий счётчик и сохраняет требование ознакомления', async () => {
    const { user, client } = renderPage();
    await user.click(await screen.findByRole('button', { name: /Проверьте время декабрьских зачётов/ }));
    await waitFor(() => expect(client.getQueryData(['notifications', 'feed', 'counters'])).toMatchObject({ unread: 2 }));
    await user.click(screen.getByRole('button', { name: 'Прочитать всё' }));
    await waitFor(() => expect(client.getQueryData(['notifications', 'feed', 'counters'])).toMatchObject({ unread: 0, important_unacked: 1 }));
    expect(screen.getByRole('button', { name: 'Ознакомлен(а)' })).toBeEnabled();
  });
});
