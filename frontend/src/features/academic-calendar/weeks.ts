import type { components } from '@/api/academic';
import { addDays, monday } from '@/features/schedule/calendar';

/** Недели от понедельника начала семестра до конца последнего периода (каникулы идут после сессии). */
export function semesterWeeks({ term, periods, events }: components['schemas']['AcademicCalendar'], today: string)
{
    const last = periods.reduce((end, period) => period.end_date > end ? period.end_date : end, term.end_date);
    const weeks = [];

    for (let start = monday(term.start_date); start <= last; start = addDays(start, 7))
    {
        const end = addDays(start, 6);
        const thursday = addDays(start, 3);

        weeks.push({
            start, end, number: weeks.length + 1,
            // Неделя на стыке периодов — по четвергу, как номер недели в ISO
            period: periods.find((period) => period.start_date <= thursday && thursday <= period.end_date),
            events: events.filter((event) => event.date >= start && event.date <= end).length,
            current: start <= today && today <= end,
        });
    }

    return weeks;
}
