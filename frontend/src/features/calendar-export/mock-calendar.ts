import type { components } from '@/api/academic';

function escapeText(value: string)
{
    return value.replace(/\r\n|\r/g, '\n').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}

function foldLine(value: string)
{
    const encoder = new TextEncoder();
    let result = '';
    let bytes = 0;

    for (const character of value)
    {
        const length = encoder.encode(character).length;

        if (bytes + length > 75)
        {
            result += '\r\n ';
            bytes = 1;
        }
        result += character;
        bytes += length;
    }

    return result;
}

const sessionTitles: Partial<Record<components['schemas']['LessonKind'], string>> = {
    consultation: 'Консультация: ', credit: 'Зачёт: ', exam: 'Экзамен: ',
};

// Только вымышленные данные MSW; production получает готовый файл от academic (ics.go — тот же формат).
export function mockCalendar(lessons: components['schemas']['Lesson'][], now: Date, points: components['schemas']['AcademicEvent'][] = [])
{
    const lines = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Digital Dean Concept//Schedule//RU', 'CALSCALE:GREGORIAN',
        'BEGIN:VTIMEZONE', 'TZID:Europe/Moscow', 'BEGIN:STANDARD', 'DTSTART:19700101T000000',
        'TZOFFSETFROM:+0300', 'TZOFFSETTO:+0300', 'TZNAME:MSK', 'END:STANDARD', 'END:VTIMEZONE',
    ];
    const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

    for (const lesson of lessons)
    {
        if (lesson.status === 'cancelled' || lesson.status === 'moved_away')
        {
            continue;
        }
        const date = lesson.date.replace(/-/g, '');
        lines.push('BEGIN:VEVENT', `UID:${lesson.id}`, `DTSTAMP:${stamp}`,
            `DTSTART;TZID=Europe/Moscow:${date}T${lesson.start_time.replace(':', '')}00`,
            `DTEND;TZID=Europe/Moscow:${date}T${lesson.end_time.replace(':', '')}00`,
            `SUMMARY:${escapeText((sessionTitles[lesson.kind] ?? '') + lesson.discipline.name)}`);

        if (lesson.room)
        {
            lines.push(`LOCATION:${escapeText(`${lesson.room.building}, ${lesson.room.number}`)}`);
        }
        if (lesson.teacher)
        {
            lines.push(`DESCRIPTION:${escapeText(lesson.teacher.short_name)}`);
        }
        lines.push('END:VEVENT');
    }
    // Контрольные точки — на весь день
    for (const point of points)
    {
        const next = new Date(`${point.date}T12:00:00Z`);
        next.setUTCDate(next.getUTCDate() + 1);
        lines.push('BEGIN:VEVENT', `UID:${point.id}`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${point.date.replace(/-/g, '')}`,
            `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`,
            `SUMMARY:${escapeText(`${point.title ?? ''}: ${point.discipline.name}`)}`, 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');

    return `${lines.map(foldLine).join('\r\n')}\r\n`;
}
