import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GradesPage } from '@/features/grades/GradesPage';
import { LessonRow } from '@/features/schedule/components/LessonRow';
import { SchedulePage } from '@/features/schedule/SchedulePage';
import { currentGrades, gradesSummary, weekSchedule } from '@/mocks/fixtures/academic';
import { setMockUser } from '@/mocks/handlers/auth';
import { renderWithProviders, server } from '@/test/render';
import { durationLabel } from './clock';
import { TodayPage } from './TodayPage';

beforeEach(() =>
{
    setMockUser('student.mo');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
});

afterEach(() => vi.useRealTimers());

describe('T09: замечания ревью', () =>
{
    it.each([[30, '30 мин'], [60, '1 ч'], [140, '2 ч 20 мин'], [380, '6 ч 20 мин']])('длительность %i минут → %s', (minutes, label) =>
    {
        expect(durationLabel(Number(minutes))).toBe(label);
    });

    it('заголовок дня имеет заглавную только в начале', async () =>
    {
        renderWithProviders(<SchedulePage />, { route: '/schedule?date=2026-11-18' });

        const heading = await screen.findByRole('heading', { name: /^Среда, 18 ноября/ });
        expect(heading.querySelector('.capitalize')).toBeNull();
        expect(screen.queryByText('Среда, 18 Ноября')).not.toBeInTheDocument();
    });

    it('при общей ошибке «Повторить» перезапрашивает все блоки', async () =>
    {
        let failed = true;
        const count = { schedule: 0, profile: 0, counters: 0, applications: 0, deadlines: 0 };
        const failOrPass = (key: 'schedule' | 'profile' | 'counters') =>
        {
            count[key] += 1;

            return failed ? HttpResponse.json({ code: 'internal' }, { status: 500 }) : undefined;
        };
        server.use(
            http.get('/api/academic/me/schedule', () => failOrPass('schedule')),
            http.get('/api/academic/me/profile', () => failOrPass('profile')),
            http.get('/api/notifications/me/feed/counters', () => failOrPass('counters')),
            http.get('/api/requests/me/applications', () =>
            {
                count.applications += 1;

                return failed ? HttpResponse.json({ code: 'internal' }, { status: 500 }) : HttpResponse.json({ items: [], total: 0 });
            }),
            http.get('/api/notifications/me/deadlines', () =>
            {
                count.deadlines += 1;

                return failed ? HttpResponse.json({ code: 'internal' }, { status: 500 }) : HttpResponse.json([]);
            }),
        );
        const { user } = renderWithProviders(<TodayPage />);
        const alert = await screen.findByRole('alert');
        failed = false;
        await user.click(within(alert).getByRole('button', { name: 'Повторить' }));

        expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
        expect(await screen.findByText('На ближайшие 7 дней дедлайнов нет')).toBeInTheDocument();
        expect(count).toEqual({ schedule: 2, profile: 2, counters: 2, applications: 2, deadlines: 2 });
    });

    it('пустая главная не содержит вложенных карточек и повторных сообщений о занятиях', async () =>
    {
        renderWithProviders(<TodayPage />, { route: '/?scenario=empty' });
        const next = within((await screen.findByRole('heading', { name: 'Сейчас / Далее' })).closest('section')!);

        expect(await next.findByText('В ближайшие 14 дней занятий нет')).toBeInTheDocument();
        expect(next.queryByText('Сегодня занятий нет')).not.toBeInTheDocument();
        const applications = screen.getByRole('heading', { name: 'Мои заявки' }).closest('section')!;
        expect(await within(applications).findByText('Заявок пока нет')).toBeInTheDocument();
        expect(applications.querySelector('.border.bg-card')).toBeNull();
    });

    it('занятие вне стандартной сетки показывает время, а не восьмую пару', () =>
    {
        renderWithProviders(<LessonRow lesson={{ ...weekSchedule.lessons[0],
            pair_number: 8, start_time: '12:15', end_time: '13:35',
        }} />);

        const row = within(screen.getByRole('article'));
        expect(row.getByText('12:15')).toBeInTheDocument();
        expect(row.getByText('13:35')).toBeInTheDocument();
        expect(row.getByText('Другое время')).toBeInTheDocument();
        expect(row.queryByText(/8(?:-я)? пара/)).not.toBeInTheDocument();
    });

    it.each([[2, 'баллов'], [5, 'баллов'], [21, 'балла'], [22, 'баллов']])('склоняет недостающие %i балла', async (needed, word) =>
    {
        const exam = currentGrades.disciplines.find((item) => item.control_form === 'exam')!;
        server.use(http.get('/api/academic/me/grades/current', () => HttpResponse.json({ ...currentGrades,
            disciplines: [{ ...exam, to_excellent: { needed, achievable: true } }],
        })));
        renderWithProviders(<GradesPage />);

        expect(await screen.findByText(`До «отлично» не хватает ${needed} ${word}`)).toBeInTheDocument();
    });

    it('для зачёта не предлагает оценку «отлично», в сводке единая формулировка отсутствия данных', async () =>
    {
        const credit = currentGrades.disciplines.find((item) => item.control_form === 'credit')!;
        server.use(
            http.get('/api/academic/me/grades/current', () => HttpResponse.json({ ...currentGrades, disciplines: [credit] })),
            http.get('/api/academic/me/grades/summary', () => HttpResponse.json({ ...gradesSummary, average_grade5: null, average_percent: null })),
        );
        renderWithProviders(<GradesPage />);
        await screen.findByRole('article');

        expect(screen.queryByText(/«отлично»/)).not.toBeInTheDocument();
        expect(await screen.findAllByText('Пока нет данных')).toHaveLength(2);
        expect(screen.queryByText('Нет данных')).not.toBeInTheDocument();
    });
});
