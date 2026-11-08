import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { GradesPage } from '@/features/grades/GradesPage';
import { ProfilePage } from '@/features/profile/ProfilePage';
import { SchedulePage } from '@/features/schedule/SchedulePage';
import { currentGrades, sessionResults, weekSchedule } from '@/mocks/fixtures/academic';
import { renderWithProviders, server } from '@/test/render';
import { TodayPage } from './TodayPage';

beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
});

afterEach(() => vi.useRealTimers());

async function nextLessonBlock()
{
    await screen.findByText('через 30 мин');

    return within(screen.getByRole('heading', { name: 'Сейчас / Далее' }).closest('section')!);
}

describe('T09: обязательные сценарии V1–V8', () => {
    it('V1: показывает исходную и новую даты переноса', async () => {
        renderWithProviders(<SchedulePage />, { route: '/schedule?date=2026-11-18' });

        expect(await screen.findByText('Перенесено с 17.11, 10:30')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Перенесено на 19.11, 12:00' })).toHaveAttribute('href', '/schedule?date=2026-11-19');
        expect(screen.getByText('Другая аудитория: 3047 (было 2105)')).toBeInTheDocument();
    });

    it('V2: объясняет отмену занятия', async () => {
        renderWithProviders(<SchedulePage />, { route: '/schedule?date=2026-11-18' });

        expect(await screen.findByText('Отменено')).toBeInTheDocument();
        expect(screen.getByText('Болезнь преподавателя')).toBeInTheDocument();
    });

    it('V3: следующая неделя меняет параметры запроса и URL', async () => {
        const ranges: string[] = [];

        server.use(http.get('/api/academic/me/schedule', ({ request }) => {
            ranges.push(new URL(request.url).search);

            return HttpResponse.json(weekSchedule);
        }));
        const { user } = renderWithProviders(<SchedulePage />, { route: '/schedule?date=2026-11-18' });
        await screen.findByText('Перенесено с 17.11, 10:30');
        await user.click(screen.getByRole('button', { name: 'Следующая неделя' }));

        await waitFor(() => expect(ranges).toContain('?from=2026-11-23&to=2026-11-29'));
        expect(window.location.search).toBe('?date=2026-11-23');
    });

    it('V4: ошибка заявок не мешает ближайшей паре; повтор восстанавливает блок', async () => {
        let failed = true;

        server.use(http.get('/api/requests/me/applications', () => failed
            ? HttpResponse.json({ code: 'internal', message: 'Ошибка заявок' }, { status: 500 })
            : HttpResponse.json({ items: [], total: 0 })));
        const { user } = renderWithProviders(<TodayPage />);
        const next = await nextLessonBlock();
        const applications = within(screen.getByRole('heading', { name: 'Мои заявки' }).closest('section')!);

        expect(next.getByText('Теория международных отношений')).toBeInTheDocument();
        expect(await applications.findByRole('alert')).toHaveTextContent('Не удалось загрузить данные');
        failed = false;
        await user.click(applications.getByRole('button', { name: 'Повторить' }));
        expect(await applications.findByRole('link', { name: 'Заказать справку' })).toHaveAttribute('href', '/requests/new/study-certificate');
    });

    it('V5: в 10:00 выбирает 10:30, а не 12:00', async () => {
        const first = weekSchedule.lessons.find((lesson) => lesson.date === '2026-11-18' && lesson.start_time === '10:30')!;

        server.use(http.get('/api/academic/me/schedule', () => HttpResponse.json({ ...weekSchedule, lessons: [
            first, { ...first, id: 'second', start_time: '12:00', end_time: '13:20', pair_number: 3 },
        ] })));
        renderWithProviders(<TodayPage />);
        const next = await nextLessonBlock();

        expect(next.getByText('10:30')).toBeInTheDocument();
        expect(next.queryByText('12:00')).not.toBeInTheDocument();
    });

    it('V6: проблемная дисциплина идёт первой с причиной', async () => {
        renderWithProviders(<GradesPage />, { route: '/grades' });
        const disciplines = await screen.findByRole('list', { name: 'Дисциплины текущего семестра' });
        const first = within(disciplines).getAllByRole('article')[0];

        expect(first).toHaveTextContent('Французский язык');
        expect(first).toHaveTextContent('Нужно внимание');
        expect(first).toHaveTextContent('Набрано меньше 60% возможных баллов');
    });

    it('V7: пустая неделя имеет понятное состояние', async () => {
        renderWithProviders(<SchedulePage />, { route: '/schedule?date=2026-11-18&scenario=empty' });

        expect(await screen.findByText('На этой неделе занятий нет')).toBeInTheDocument();
        expect(screen.queryByText('Перенесено с 17.11, 10:30')).not.toBeInTheDocument();
    });

    it('V8: зачёт отображается без ECTS', async () => {
        const credit = { ...sessionResults.semesters[0].results.at(-1)!, ects: 'A' as const };

        server.use(http.get('/api/academic/me/grades/sessions', () => HttpResponse.json({ ...sessionResults,
            semesters: [{ ...sessionResults.semesters[0], results: [credit] }],
        })));
        const { user } = renderWithProviders(<GradesPage />, { route: '/grades' });
        await user.click(screen.getByRole('tab', { name: 'Сессии' }));

        expect(await screen.findByText('Зачтено')).toBeInTheDocument();
        expect(screen.queryByText(/ECTS/)).not.toBeInTheDocument();
    });
});

describe('T09: дополнительные пользовательские сценарии', () => {
    it('запрашивает 7 дней и 3 заявки; показывает только первые три ближайших дедлайна', async () => {
        let days: string | null = null;
        let limit: string | null = null;

        server.use(
            http.get('/api/notifications/me/deadlines', ({ request }) => {
                days = new URL(request.url).searchParams.get('days');

                return HttpResponse.json([19, 20, 21, 22, 30].map((day) => ({
                    id: `deadline-${day}`, title: `Срок ${day} ноября`, kind: 'other',
                    due_at: `2026-11-${day}T18:00:00+03:00`, days_left: day - 18,
                })));
            }),
            http.get('/api/requests/me/applications', ({ request }) => {
                limit = new URL(request.url).searchParams.get('limit');

                return HttpResponse.json({ items: [], total: 0 });
            }),
        );
        renderWithProviders(<TodayPage />);

        expect(await screen.findByText('Срок 19 ноября')).toBeInTheDocument();
        expect(screen.getByText('Срок 21 ноября')).toBeInTheDocument();
        expect(screen.queryByText('Срок 22 ноября')).not.toBeInTheDocument();
        expect(screen.queryByText('Срок 30 ноября')).not.toBeInTheDocument();
        expect(days).toBe('7');
        expect(limit).toBe('3');
    });

    it('показывает московское время, приветствие и важные объявления', async () => {
        renderWithProviders(<TodayPage />);

        expect(await screen.findByText('Доброе утро, Анна')).toBeInTheDocument();
        expect(await screen.findByText('среда, 18 ноября · 12-я неделя, чётная')).toBeInTheDocument();
        expect(await screen.findByRole('link', { name: /важн.*ознакомления/ })).toHaveAttribute('href', '/notifications');
    });

    it('во время пары показывает оставшееся время', async () => {
        vi.setSystemTime(new Date('2026-11-18T11:10:00+03:00'));
        renderWithProviders(<TodayPage />);

        expect(await screen.findByText('идёт, до конца 40 мин')).toBeInTheDocument();
    });

    it('после занятий выбирает следующий учебный день', async () => {
        vi.setSystemTime(new Date('2026-11-18T16:00:00+03:00'));
        renderWithProviders(<TodayPage />);

        expect(await screen.findByText('Пары на сегодня закончились')).toBeInTheDocument();
        expect(screen.getByText('Следующий учебный день — 19 ноября')).toBeInTheDocument();
    });

    it('восстанавливает неделю из ссылки и возвращается к сегодняшнему дню', async () => {
        const { user } = renderWithProviders(<SchedulePage />, { route: '/schedule?date=2026-11-25' });

        expect(await screen.findByText('На этой неделе занятий нет')).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Сегодня' }));
        expect(await screen.findByText('Перенесено с 17.11, 10:30')).toBeInTheDocument();
        expect(window.location.search).toBe('?date=2026-11-18');
    });

    it('раскрывает контрольные точки и различает недостижимую оценку', async () => {
        renderWithProviders(<GradesPage />, { route: '/grades' });
        const list = await screen.findByRole('list', { name: 'Дисциплины текущего семестра' });
        const first = within(list).getAllByRole('article')[0];

        expect(first).toHaveTextContent('В этом семестре «отлично» уже недостижимо');
        expect(within(first).getByText('Контрольные точки').closest('details')).not.toHaveAttribute('open');
        within(first).getByText('Контрольные точки').click();
        expect(within(first).getByText('Контрольные точки').closest('details')).toHaveAttribute('open');
        expect(within(first).getByText('Не оценено')).toBeInTheDocument();
        expect(within(list).getAllByRole('article')).toHaveLength(currentGrades.disciplines.length);
    });

    it('профиль показывает учебные данные и политику', async () => {
        renderWithProviders(<ProfilePage />, { route: '/profile' });

        expect(await screen.findByText('Лебедева Анна Викторовна')).toBeInTheDocument();
        expect(screen.getByText('2401317')).toBeInTheDocument();
        expect(screen.getByText('Очная')).toBeInTheDocument();
        expect(screen.getByText('Бюджет')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Как мы обрабатываем ваши данные' })).toHaveAttribute('href', '/privacy');
    });

    it('из профиля можно выйти в форму входа', async () => {
        const { user } = renderWithProviders(<AppRoutes />, { route: '/profile', login: 'student.mo' });

        await user.click(await screen.findByRole('button', { name: 'Выйти' }));
        expect(await screen.findByRole('heading', { name: 'Вход в личный кабинет' })).toBeInTheDocument();
    });
});
