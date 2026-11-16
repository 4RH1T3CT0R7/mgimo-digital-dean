import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetApplications } from '@/mocks/fixtures/requests';
import { setMockUser } from '@/mocks/handlers/auth';
import { renderWithProviders, server } from '@/test/render';
import { TodayPage } from './TodayPage';

beforeEach(() => {
  resetApplications();
  setMockUser('student.mo');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
});
afterEach(() => vi.useRealTimers());

const deadline = (id: string, title: string, due_at: string, service_type_id: string | null = null) => ({
  id, title, kind: service_type_id ? 'application' : 'other', due_at, days_left: 0, service_type_id,
});

describe('W1: «Ждёт вашего действия» на главной', () => {
  it('заявки needs_info и сроки на сегодня и завтра; срок с услугой ведёт на форму', async () => {
    const statuses: (string | null)[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/me/applications')) statuses.push(url.searchParams.get('status'));
    });
    server.use(
      http.get('/api/notifications/me/deadlines', () =>
        HttpResponse.json([
          deadline('d1', 'Заявление на материальную помощь', '2026-11-18T23:59:00+03:00', 'financial-aid'),
          deadline('d2', 'Эссе по теории', '2026-11-19T18:00:00+03:00'),
          deadline('d3', 'Реферат', '2026-11-20T18:00:00+03:00'),
        ]),
      ),
    );
    renderWithProviders(<TodayPage />);

    const block = within((await screen.findByRole('heading', { name: 'Ждёт вашего действия' })).closest('section')!);
    expect(await block.findByRole('link', { name: /Ответьте деканату: Выписка оценок \/ транскрипт/ })).toHaveAttribute(
      'href',
      '/requests/50000000-0000-4000-8000-000000000013',
    );
    expect(block.getByRole('link', { name: /Заявление на материальную помощь\s*Сегодня до 23:59/ })).toHaveAttribute('href', '/requests/new/financial-aid');
    expect(block.getByText('Эссе по теории')).toBeInTheDocument();
    expect(block.getByText('Завтра до 18:00')).toBeInTheDocument();
    expect(block.queryByText('Реферат')).not.toBeInTheDocument();
    expect(statuses).toContain('needs_info');
    server.events.removeAllListeners('request:start');
  });

  it('нечего делать — блока нет', async () => {
    server.use(
      http.get('/api/notifications/me/deadlines', () => HttpResponse.json([deadline('d3', 'Реферат', '2026-11-20T18:00:00+03:00')])),
      http.get('/api/requests/me/applications', () => HttpResponse.json({ items: [], total: 0 })),
    );
    renderWithProviders(<TodayPage />);

    expect(await screen.findByText('Реферат')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Ждёт вашего действия' })).not.toBeInTheDocument();
  });
});
