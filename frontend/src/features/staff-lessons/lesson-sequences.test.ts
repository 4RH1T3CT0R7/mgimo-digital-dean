import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { academicApi, unwrap } from '@/api/clients';
import { resetAcademicState, weekSchedule } from '@/mocks/fixtures/academic';
import { setMockUser } from '@/mocks/handlers/auth';

const lesson = weekSchedule.lessons.find((item) => item.date === '2026-11-18' && item.start_time === '10:30')!;
const path = { lesson_id: lesson.id };
const query = { from: '2026-11-16', to: '2026-11-22', group_id: lesson.groups[0].id };

beforeEach(() =>
{
    resetAcademicState();
    setMockUser('dekanat.mo');
});

afterEach(resetAcademicState);

async function move()
{
    return unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', {
        params: { path },
        body: { type: 'moved', new_date: '2026-11-19', new_start_time: '12:00', new_end_time: '13:20' },
    }));
}

async function readBothSchedules()
{
    const staff = await unwrap(academicApi.GET('/staff/lessons', { params: { query } }));
    setMockUser('student.mo');
    const student = await unwrap(academicApi.GET('/me/schedule', { params: { query } }));

    return [staff, student.lessons].map((items) => items.filter((item) => item.id === lesson.id));
}

describe('T14: последовательные изменения в dev:mock', () =>
{
    it.each([['12:15', '13:35'], ['12:00', '13:35']])('своя сетка %s–%s не наследует номер исходной пары', async (start, end) =>
    {
        const moved = await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', {
            params: { path },
            body: { type: 'moved', new_date: '2026-11-19', new_start_time: start, new_end_time: end },
        }));

        expect(moved.pair_number).toBe(8);
        for (const items of await readBothSchedules())
        {
            expect(items).toEqual(expect.arrayContaining([
                expect.objectContaining({ status: 'moved_away', pair_number: lesson.pair_number }),
                expect.objectContaining({ status: 'moved', start_time: start, end_time: end, pair_number: 8 }),
            ]));
        }
    });

    it('повторный перенос сохраняет первый слот в обоих расписаниях', async () =>
    {
        await move();
        const second = await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', {
            params: { path },
            body: { type: 'moved', new_date: '2026-11-20', new_start_time: '14:20', new_end_time: '15:40' },
        }));

        expect(second.change?.previous).toMatchObject({ date: lesson.date, start_time: lesson.start_time, room: lesson.room });
        for (const items of await readBothSchedules())
        {
            expect(items).toHaveLength(2);
            expect(items).toEqual(expect.arrayContaining([
                expect.objectContaining({ status: 'moved_away', date: lesson.date, start_time: lesson.start_time, pair_number: 2,
                    moved_to: { date: '2026-11-20', start_time: '14:20' } }),
                expect.objectContaining({ status: 'moved', date: '2026-11-20', start_time: '14:20' }),
            ]));
        }
    });

    it('смена аудитории после переноса сохраняет статус и исходную строку', async () =>
    {
        await move();
        const room = { building: 'Главный корпус', number: '3047' };
        const changed = await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', {
            params: { path }, body: { type: 'room_changed', new_room: room },
        }));

        expect(changed).toMatchObject({ status: 'moved', change: { type: 'room_changed', previous: { date: lesson.date, room: lesson.room } } });
        for (const items of await readBothSchedules())
        {
            expect(items).toHaveLength(2);
            expect(items).toEqual(expect.arrayContaining([
                expect.objectContaining({ status: 'moved_away', date: lesson.date, room: lesson.room, moved_to: { date: '2026-11-19', start_time: '12:00' } }),
                expect.objectContaining({ status: 'moved', date: '2026-11-19', room }),
            ]));
        }
    });

    it('отмена после переноса оставляет одну отменённую строку в фактическом слоте', async () =>
    {
        await move();
        await unwrap(academicApi.POST('/staff/lessons/{lesson_id}/change', { params: { path }, body: { type: 'cancelled' } }));

        for (const items of await readBothSchedules())
        {
            expect(items).toHaveLength(1);
            expect(items[0]).toMatchObject({ status: 'cancelled', date: '2026-11-19', start_time: '12:00', change: { previous: { date: lesson.date } } });
        }
    });
});
