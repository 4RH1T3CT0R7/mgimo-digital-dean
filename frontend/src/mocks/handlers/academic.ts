import { http, HttpResponse } from 'msw';
import { addDays, monday, validDate } from '@/features/schedule/calendar';
import { toApiDate } from '@/shared/lib/format';
import { currentGrades, faculties, gradesSummary, profile, sessionResults, weekSchedule } from '../fixtures/academic';
import { list, scenario } from '../scenario';

// Владелец — T09/T14: дописывайте обработчики здесь (параметры from/to, /staff/*)
export const academicHandlers = [
  http.get('/api/academic/faculties', () => HttpResponse.json(list(faculties))),
  http.get('/api/academic/me/profile', () => HttpResponse.json(scenario() === 'empty' ? { ...profile, full_name: '' } : profile)),
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

    return HttpResponse.json({ ...weekSchedule, from, to, weeks,
      lessons: list(weekSchedule.lessons.filter((lesson) => lesson.date >= from && lesson.date <= to)) });
  }),
  http.get('/api/academic/me/grades/summary', () => HttpResponse.json(scenario() === 'empty'
    ? { ...gradesSummary, average_grade5: null, average_percent: null, rating: null, traffic: { green: 0, yellow: 0, red: 0 } }
    : gradesSummary)),
  http.get('/api/academic/me/grades/current', () => HttpResponse.json({ ...currentGrades, disciplines: list(currentGrades.disciplines) })),
  http.get('/api/academic/me/grades/sessions', () => HttpResponse.json({ ...sessionResults, semesters: list(sessionResults.semesters) })),
];
