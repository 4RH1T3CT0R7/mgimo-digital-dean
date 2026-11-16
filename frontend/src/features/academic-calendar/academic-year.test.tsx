import { screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GradesPage } from '@/features/grades/GradesPage';
import { SchedulePage } from '@/features/schedule/SchedulePage';
import { academicCalendar } from '@/mocks/fixtures/academic';
import { setMockUser } from '@/mocks/handlers/auth';
import { renderWithProviders } from '@/test/render';
import { semesterWeeks } from './weeks';

beforeEach(() =>
{
    setMockUser('student.mo');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
});

afterEach(() => vi.useRealTimers());

async function openYearTab(route = '/grades')
{
    const { user } = renderWithProviders(<GradesPage />, { route });
    await user.click(await screen.findByRole('tab', { name: 'Учебный год' }));
}

describe('W2: вкладка «Учебный год»', () =>
{
    it('показывает полосу по неделям, легенду периодов, отметку «сейчас» и мероприятия', async () =>
    {
        await openYearTab();
        const strip = await screen.findByRole('list', { name: 'Недели семестра' });
        const weeks = within(strip).getAllByRole('listitem');
        const region = screen.getByRole('region', { name: 'Полоса недель' });

        expect(weeks).toHaveLength(23);
        expect(region).toHaveAttribute('tabindex', '0');
        expect(strip.querySelector('[aria-current="date"]')).toHaveTextContent('12-я неделя, 16–22 ноября: учёба, сейчас');
        expect(weeks[19]).toHaveTextContent('20-я неделя, 11–17 января: сессия, 4 контрольных мероприятия');
        expect(weeks[16]).toHaveTextContent('17-я неделя, 21–27 декабря: зачётная неделя, 2 контрольных мероприятия');

        const periods = within(screen.getByRole('list', { name: 'Периоды семестра' })).getAllByRole('listitem');
        expect(periods.map((item) => item.textContent)).toEqual([
            'Учёба1 сентября — 20 декабря', 'Зачётная неделя21–27 декабря', 'Праздники28 декабря — 10 января',
            'Сессия11–24 января', 'Каникулы25 января — 7 февраля',
        ]);
        expect(screen.getByRole('link', { name: /Официальные учебные планы и графики на mgimo.ru/ }))
            .toHaveAttribute('href', 'https://mgimo.ru/sveden/education/');
    });

    it('перечисляет мероприятия по датам, прошедшие свёрнуты и приглушены', async () =>
    {
        await openYearTab();
        const list = await screen.findByRole('list', { name: 'Ближайшие мероприятия' });
        const pastList = screen.getByRole('list', { name: 'Прошедшие мероприятия' });
        const daysOf = (ul: HTMLElement) => within(ul).getAllByRole('listitem').filter((item) => item.parentElement === ul);
        const days = daysOf(list);
        const exam = days.find((day) => day.textContent?.startsWith('Вторник, 12 января'))!;
        const past = daysOf(pastList).find((day) => day.textContent?.startsWith('Четверг, 1 октября'))!;

        expect(days).toHaveLength(9);
        expect(daysOf(pastList)).toHaveLength(3);
        expect(pastList.closest('details')).not.toHaveAttribute('open');
        expect(screen.getByText(/Прошедшие мероприятия: 18/)).toBeInTheDocument();
        expect(exam).toHaveTextContent('Экзамен09:00–13:20Теория международных отношений');
        expect(within(exam).getByRole('link', { name: /Корпус Б, 1047/ })).toBeInTheDocument();
        expect(exam).not.toHaveClass('text-muted-foreground');
        expect(past).toHaveClass('text-muted-foreground');
        expect(within(past).getAllByText('Контрольная работа 1')).toHaveLength(6);
        expect(days.find((day) => day.textContent?.startsWith('Пятница, 18 декабря'))).toHaveTextContent('Зачёт10:30–11:50Международное публичное право');
    });

    it('без данных подсказывает официальный график', async () =>
    {
        await openYearTab('/grades?scenario=empty');

        expect(await screen.findByText('Календарный план пока не опубликован')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: /mgimo.ru/ })).toHaveAttribute('target', '_blank');
    });

    it('неделя на стыке периодов относится к периоду своего четверга', () =>
    {
        const weeks = semesterWeeks({ ...academicCalendar, events: [], periods: [
            { kind: 'holidays', start_date: '2026-12-28', end_date: '2027-01-08' },
            { kind: 'session', start_date: '2027-01-09', end_date: '2027-01-25' },
        ] }, '2027-01-27');

        expect(weeks.find((week) => week.start === '2027-01-04')?.period?.kind).toBe('holidays');
        expect(weeks.find((week) => week.start === '2027-01-25')?.period).toBeUndefined();
        expect(weeks.find((week) => week.start === '2027-01-25')?.current).toBe(true);
    });
});

describe('W2: сессия в расписании', () =>
{
    it('в январе показывает консультации и экзамены с подписями', async () =>
    {
        renderWithProviders(<SchedulePage />, { route: '/schedule?date=2027-01-12' });
        const day = (await screen.findByRole('heading', { name: 'Вторник, 12 января' })).closest('section')!;
        const consultation = screen.getByRole('heading', { name: 'Понедельник, 11 января' }).closest('section')!;

        expect(within(day).getByText('Экзамен')).toBeInTheDocument();
        expect(within(day).getByText('Теория международных отношений')).toBeInTheDocument();
        expect(within(day).getByText('13:20')).toBeInTheDocument();
        expect(within(day).queryByText(/пара/)).not.toBeInTheDocument();
        expect(within(consultation).getByText('Консультация')).toBeInTheDocument();
        expect(within(consultation).getByText('3-я пара')).toBeInTheDocument();
    });
});
