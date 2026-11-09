import { http, HttpResponse } from 'msw';
import type { components } from '@/api/academic';
import { mockCalendar } from '@/features/calendar-export/mock-calendar';
import { addDays, monday, validDate } from '@/features/schedule/calendar';
import { pairs } from '@/features/staff-lessons/pairs';
import { toApiDate } from '@/shared/lib/format';
import { academicState, currentGrades, faculties, gradesSummary, mockTermEnd, profile, sessionResults, staffGroups, weekSchedule } from '../fixtures/academic';
import { list, scenario } from '../scenario';
import { mockUser } from './auth';

function accessibleGroups(facultyId?: string | null)
{
    const user = mockUser();
    const selected = user?.role === 'admin' ? facultyId : user?.faculty_id;
    const faculty = faculties.find((item) => item.id === selected);

    return staffGroups.filter((group) => user?.role === 'admin' && !selected || group.faculty_short === faculty?.short_name);
}

function staffError()
{
    const user = mockUser();

    if (!user)
    {
        return HttpResponse.json({ code: 'unauthenticated', message: 'Войдите в систему' }, { status: 401 });
    }
    if (user.role === 'student')
    {
        return HttpResponse.json({ code: 'forbidden', message: 'Этот раздел вам недоступен' }, { status: 403 });
    }

    return null;
}

// Владелец — T09/T14: дописывайте обработчики здесь (параметры from/to, /staff/*)
export const academicHandlers = [
  http.get('/api/academic/faculties', () => HttpResponse.json(list(faculties))),
  http.get('/api/academic/me/profile', () => HttpResponse.json(scenario() === 'empty' ? { ...profile, full_name: '' } : profile)),
  http.get('/api/academic/me/schedule.ics', ({ request }) =>
  {
    const user = mockUser();

    if (!user || user.role !== 'student')
    {
      return HttpResponse.json({ code: user ? 'forbidden' : 'unauthenticated', message: 'Выгрузка доступна студенту после входа' }, { status: user ? 403 : 401 });
    }
    const params = new URL(request.url).searchParams;
    const from = params.get('from') ?? toApiDate();
    const to = params.get('to') ?? mockTermEnd;

    if (!validDate(from) || !validDate(to))
    {
      return HttpResponse.json({ code: 'validation_failed', message: 'Укажите корректный период' }, { status: 400 });
    }
    const lessons = list(academicState.lessons.filter((lesson) => lesson.date >= from && lesson.date <= to))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time));

    return new HttpResponse(mockCalendar(lessons, new Date()), { headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="mgimo-schedule.ics"',
      'Cache-Control': 'no-store',
    } });
  }),
  http.get('/api/academic/me/schedule', ({ request }) => {
    const params = new URL(request.url).searchParams;
    const rawFrom = params.get('from');
    const rawTo = params.get('to');
    const from = validDate(rawFrom) ? rawFrom : monday(toApiDate());
    const to = validDate(rawTo) ? rawTo : addDays(from, 6);
    const weeks = [];

    if (from > to || (Date.parse(to) - Date.parse(from)) / 86_400_000 >= 31)
    {
      return HttpResponse.json({ code: 'validation_failed', message: 'Период должен быть от 1 до 31 дня' }, { status: 400 });
    }
    for (let date = monday(from); date <= to; date = addDays(date, 7))
    {
      const number = Math.max(1, Math.round((Date.parse(date) - Date.parse('2026-08-31')) / 604_800_000) + 1);
      weeks.push({ start_date: date, number, parity: number % 2 ? 'odd' as const : 'even' as const });
    }

    return HttpResponse.json({ ...weekSchedule, as_of: academicState.asOf, from, to, weeks,
      lessons: list(academicState.lessons.filter((lesson) => lesson.date >= from && lesson.date <= to)) });
  }),
  http.get('/api/academic/me/grades/summary', () => HttpResponse.json(scenario() === 'empty'
    ? { ...gradesSummary, average_grade5: null, average_percent: null, rating: null, traffic: { green: 0, yellow: 0, red: 0 } }
    : gradesSummary)),
  http.get('/api/academic/me/grades/current', () => HttpResponse.json({ ...currentGrades, disciplines: list(currentGrades.disciplines) })),
  http.get('/api/academic/me/grades/sessions', () => HttpResponse.json({ ...sessionResults, semesters: list(sessionResults.semesters) })),
  http.get('/api/academic/staff/groups', ({ request }) => {
    const error = staffError();

    return error ?? HttpResponse.json(list(accessibleGroups(new URL(request.url).searchParams.get('faculty_id'))));
  }),
  http.get('/api/academic/staff/lessons', ({ request }) => {
    const error = staffError();

    if (error)
    {
      return error;
    }
    const query = new URL(request.url).searchParams;
    const groupId = query.get('group_id');
    const currentMonday = monday(toApiDate());
    const from = query.get('from') ?? currentMonday;
    const to = query.get('to') ?? addDays(currentMonday, 6);

    if (!accessibleGroups().some((group) => group.id === groupId))
    {
      return HttpResponse.json({ code: 'not_found', message: 'Группа не найдена' }, { status: 404 });
    }
    if (!validDate(from) || !validDate(to) || from > to || Date.parse(to) - Date.parse(from) >= 31 * 86_400_000)
    {
      return HttpResponse.json({ code: 'validation_failed', message: 'Укажите период от 1 до 31 дня' }, { status: 400 });
    }

    return HttpResponse.json(list(academicState.lessons.filter((lesson) => lesson.date >= from && lesson.date <= to && lesson.groups.some((group) => group.id === groupId)))
      .sort((a, b) => a.date.localeCompare(b.date) || a.start_time.localeCompare(b.start_time)));
  }),
  http.post('/api/academic/staff/lessons/:lessonId/change', async ({ request, params }) => {
    const error = staffError();

    if (error)
    {
      return error;
    }
    const lesson = academicState.lessons.find((item) => item.id === params.lessonId && item.status !== 'moved_away');

    if (!lesson || !lesson.groups.some((group) => accessibleGroups().some((accessible) => accessible.id === group.id)))
    {
      return HttpResponse.json({ code: 'not_found', message: 'Занятие не найдено' }, { status: 404 });
    }
    if (lesson.status === 'cancelled')
    {
      return HttpResponse.json({ code: 'conflict', message: 'Занятие уже отменено, изменить его нельзя' }, { status: 409 });
    }
    const body = await request.json() as components['schemas']['LessonChangeRequest'];
    const fields: Record<string, string> = {};
    const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

    if (!['moved', 'cancelled', 'room_changed'].includes(body.type))
    {
      fields.type = 'Выберите вид изменения';
    }
    if (body.type === 'moved')
    {
      if (!validDate(body.new_date ?? null))
      {
        fields.new_date = 'Укажите новую дату';
      }
      if (!timePattern.test(body.new_start_time ?? ''))
      {
        fields.new_start_time = 'Укажите время начала';
      }
      if (!timePattern.test(body.new_end_time ?? '') || body.new_end_time! <= body.new_start_time!)
      {
        fields.new_end_time = 'Время окончания должно быть позже начала';
      }
    }
    if ((body.type === 'room_changed' || body.new_room) && (!body.new_room?.building.trim() || !body.new_room.number.trim()))
    {
      fields.new_room = 'Укажите корпус и номер аудитории';
    }
    if ((body.reason?.length ?? 0) > 300)
    {
      fields.reason = 'Причина — не более 300 символов';
    }
    if (Object.keys(fields).length)
    {
      return HttpResponse.json({ code: 'validation_failed', message: 'Проверьте поля', details: { fields } }, { status: 400 });
    }
    const previous = lesson.change?.previous ?? { date: lesson.date, start_time: lesson.start_time, end_time: lesson.end_time, room: lesson.room };
    const updated: components['schemas']['Lesson'] = { ...lesson,
      date: body.type === 'moved' ? body.new_date! : lesson.date,
      start_time: body.type === 'moved' ? body.new_start_time! : lesson.start_time,
      end_time: body.type === 'moved' ? body.new_end_time! : lesson.end_time,
      room: body.new_room ?? lesson.room,
      status: body.type === 'room_changed' ? (lesson.status === 'moved' ? 'moved' : 'changed') : body.type,
      change: { type: body.type, previous, reason: body.reason ?? null, changed_at: new Date().toISOString() },
      moved_to: null,
    };
    updated.pair_number = pairs.find((pair) => pair.start === updated.start_time && pair.end === updated.end_time)?.number ?? lesson.pair_number;
    academicState.lessons = academicState.lessons.filter((item) => item.id !== lesson.id);

    if (updated.status === 'moved')
    {
      academicState.lessons.push({ ...updated, ...previous,
        pair_number: pairs.find((pair) => pair.start === previous.start_time)?.number ?? 8,
        status: 'moved_away', moved_to: { date: updated.date, start_time: updated.start_time } });
    }
    academicState.lessons.push(updated);
    academicState.asOf = updated.change!.changed_at;

    return HttpResponse.json(updated);
  }),
];
