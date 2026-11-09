import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { academicApi, unwrap } from '@/api/clients';
import { academicState, resetAcademicState, weekSchedule } from '@/mocks/fixtures/academic';
import { setMockUser } from '@/mocks/handlers/auth';
import { mockCalendar } from './mock-calendar';

const lesson = weekSchedule.lessons.find((item) => item.date === '2026-11-18' && item.start_time === '10:30')!;
const path = { lesson_id: lesson.id };

function download(query = '')
{
    return fetch(`${location.origin}/api/academic/me/schedule.ics${query}`);
}

beforeEach(() =>
{
    resetAcademicState();
    setMockUser('student.mo');
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
});

afterEach(() =>
{
    resetAcademicState();
    vi.useRealTimers();
});

describe('T16: файл календаря в MSW', () =>
{
    it('без параметров включает только активные занятия с сегодня до конца семестра', async () =>
    {
        academicState.lessons.push({ ...lesson, id: '90000000-0000-4000-8000-000000000001', date: '2026-12-28' });
        const response = await download();
        const text = await response.text();
        const expected = academicState.lessons.filter((item) => item.date >= '2026-11-18' && item.date <= '2026-12-27'
            && item.status !== 'cancelled' && item.status !== 'moved_away').map((item) => `UID:${item.id}`).sort();

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/calendar');
        expect(response.headers.get('Content-Disposition')).toContain('mgimo-schedule.ics');
        expect(response.headers.get('Cache-Control')).toBe('no-store');
        expect(text.match(/^UID:.*$/gm)?.map((line) => line.trim()).sort()).toEqual(expected);
        expect(text).toContain('TZID:Europe/Moscow\r\n');
        expect(text).toContain('TZOFFSETTO:+0300\r\n');
        expect(text).toContain('DTSTAMP:20261118T070000Z\r\n');
        expect(text.endsWith('END:VCALENDAR\r\n')).toBe(true);
        expect(text.replaceAll('\r\n', '')).not.toMatch(/[\r\n]/);
        expect(new Set(expected).size).toBe(expected.length);
    });

    it('границы периода включительны, экспорт допускает период больше 31 дня', async () =>
    {
        const single = await download('?from=2026-11-18&to=2026-11-18');
        const text = await single.text();

        expect(single.status).toBe(200);
        expect(text).toContain('DTSTART;TZID=Europe/Moscow:20261118T');
        expect(text).not.toContain('DTSTART;TZID=Europe/Moscow:20261119T');
        expect((await download('?from=2026-09-01&to=2026-12-27')).status).toBe(200);
    });

    it.each(['?from=2026-02-30', '?to=invalid'])('не выгружает неверный период %s', async (query) =>
    {
        expect((await download(query)).status).toBe(400);
    });

    it('обратный период возвращает пустой календарь, как Academic после ревью', async () =>
    {
        const response = await download('?from=2026-11-19&to=2026-11-18');
        const text = await response.text();

        expect(response.status).toBe(200);
        expect(text).toContain('BEGIN:VCALENDAR\r\n');
        expect(text).not.toContain('BEGIN:VEVENT');
    });

    it.each([[null, 401], ['dekanat.mo', 403]] as const)('проверяет роль: %s → %s', async (login, status) =>
    {
        setMockUser(login);

        expect((await download()).status).toBe(status);
    });

    it('читает актуальный перенос и аудиторию; после отмены UID исчезает', async () =>
    {
        setMockUser('dekanat.mo');
        await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', { params: { path },
            body: { type: 'moved', new_date: '2026-11-19', new_start_time: '12:00', new_end_time: '13:20' } }));
        await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', { params: { path },
            body: { type: 'room_changed', new_room: { building: 'Главный корпус', number: '3047' } } }));
        setMockUser('student.mo');
        const text = (await (await download()).text()).replaceAll('\r\n ', '');
        const event = text.split('BEGIN:VEVENT').find((item) => item.includes(`UID:${lesson.id}\r\n`));

        expect(event).toContain('DTSTART;TZID=Europe/Moscow:20261119T120000\r\n');
        expect(event).toContain('DTEND;TZID=Europe/Moscow:20261119T132000\r\n');
        expect(event).toContain('LOCATION:Главный корпус\\, 3047\r\n');
        expect(text.split(`UID:${lesson.id}\r\n`)).toHaveLength(2);

        setMockUser('dekanat.mo');
        await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', { params: { path }, body: { type: 'cancelled' } }));
        setMockUser('student.mo');

        expect(await (await download()).text()).not.toContain(`UID:${lesson.id}\r\n`);
    });

    it('экранирует текст и переносит строки по 75 октетов без разрыва Unicode', () =>
    {
        const name = `Тест; запятая, слеш\\\r\n${'Длинный текст 🗓 '.repeat(10)}`;
        const text = mockCalendar([{ ...lesson, discipline: { ...lesson.discipline, name } }], new Date());

        expect(text.replaceAll('\r\n ', '')).toContain(`SUMMARY:Тест\\; запятая\\, слеш\\\\\\n${'Длинный текст 🗓 '.repeat(10)}\r\n`);
        for (const line of text.split('\r\n'))
        {
            expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
        }
        expect(text).not.toContain('\uFFFD');
    });
});
