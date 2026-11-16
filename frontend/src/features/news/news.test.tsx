import { screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { resetNotificationsState } from '@/mocks/handlers/notifications';
import { renderWithProviders, server } from '@/test/render';
import { eventIcs } from './ics';

const renderPage = (route = '/news') => renderWithProviders(<AppRoutes />, { route, login: 'student.mo' });
const card = (title: string) => within(screen.getByRole('heading', { name: title }).closest('li')!);
const lecture = 'Открытая лекция «Как читать международный договор»';
const debates = 'Клуб дебатов: открытая тренировка';

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
  resetNotificationsState();
});
afterEach(() => vi.useRealTimers());

describe('Новости и мероприятия', () => {
  it('у мероприятия дата, место и «Пойду»; прошедшее — с пометкой и без «Пойду»', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: lecture })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Справку с места учёбы можно скачать сразу' })).toBeVisible();
    const upcoming = card(lecture);
    expect(upcoming.getByText('26 ноября в 16:00')).toBeVisible();
    expect(upcoming.getByText('Корпус Г, аудитория 2115')).toBeVisible();
    expect(upcoming.getByRole('button', { name: 'Пойду' })).toBeEnabled();
    expect(upcoming.getByRole('button', { name: 'В календарь' })).toBeEnabled();
    expect(upcoming.getByText('Пойдут 2 человека')).toBeVisible();
    const past = card(debates);
    expect(past.getByText('Прошло')).toBeVisible();
    expect(past.queryByRole('button', { name: 'Пойду' })).not.toBeInTheDocument();
    expect(past.queryByRole('button', { name: 'В календарь' })).not.toBeInTheDocument();
  });

  it('«Пойду» и отмена меняют кнопку и число идущих', async () => {
    const calls: string[] = [];
    const listener = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname.endsWith('/going')) calls.push(request.method);
    };
    server.events.on('request:start', listener);
    try {
      const { user } = renderPage();
      await screen.findByRole('heading', { name: lecture });
      await user.click(card(lecture).getByRole('button', { name: 'Пойду' }));
      expect(await card(lecture).findByRole('button', { name: 'Вы идёте', pressed: true })).toBeEnabled();
      expect(card(lecture).getByText('Пойдут 3 человека')).toBeVisible();
      await user.click(card(lecture).getByRole('button', { name: 'Вы идёте' }));
      expect(await card(lecture).findByRole('button', { name: 'Пойду', pressed: false })).toBeEnabled();
      expect(card(lecture).getByText('Пойдут 2 человека')).toBeVisible();
      expect(calls).toEqual(['POST', 'DELETE']);
    } finally {
      server.events.removeListener('request:start', listener);
    }
  });

  it('переключатель: мероприятия по дате (прошедшие в конце), новости без мероприятий', async () => {
    const { user } = renderPage();
    await screen.findByRole('heading', { name: lecture });
    await user.click(screen.getByRole('button', { name: 'Мероприятия' }));
    expect(screen.getByRole('button', { name: 'Мероприятия' })).toHaveAttribute('aria-pressed', 'true');
    const titles = () => within(screen.getByRole('main')).getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(titles()).toEqual([
      'ФМО: встреча с выпускниками о стажировках', lecture, 'Мастер-класс: резюме для стажировки', debates,
    ]);
    await user.click(screen.getByRole('button', { name: 'Новости' }));
    await waitFor(() => expect(titles()).not.toContain(lecture));
    expect(titles()).toContain('Справку с места учёбы можно скачать сразу');
  });

  it('пустой раздел', async () => {
    renderPage('/news?scenario=empty');
    expect(await screen.findByText('Новостей и мероприятий пока нет')).toBeVisible();
  });
});

describe('.ics мероприятия', () => {
  const ics = eventIcs({
    id: 'e1', title: 'Лекция; часть 1, вводная', body: 'Строка 1\nПуть C:\\docs', place: 'Корпус Г, 2115',
    starts_at: '2026-11-26T13:00:00Z',
  }, new Date('2026-11-18T07:00:00Z'));

  it('экранирует текст и ставит начало по Москве', () => {
    expect(ics).toContain('SUMMARY:Лекция\\; часть 1\\, вводная\r\n');
    expect(ics).toContain('LOCATION:Корпус Г\\, 2115\r\n');
    expect(ics).toContain('DESCRIPTION:Строка 1\\nПуть C:\\\\docs\r\n');
    expect(ics).toContain('DTSTART;TZID=Europe/Moscow:20261126T160000\r\n');
    expect(ics).toContain('DTSTAMP:20261118T070000Z\r\n');
    expect(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('длинные строки переносит, не разрезая кириллицу', () => {
    const long = eventIcs({ id: 'e2', title: 'Мероприятие '.repeat(12), body: '', place: 'Зал', starts_at: '2026-11-26T13:00:00Z' });
    const encoder = new TextEncoder();
    for (const line of long.split('\r\n')) expect(encoder.encode(line).length).toBeLessThanOrEqual(75);
    expect(long).toContain('\r\n ');
    expect(long.replace(/\r\n /g, '')).toContain(`SUMMARY:${'Мероприятие '.repeat(12)}`);
  });
});
