import { useEffect, useState } from 'react';
import type { Lesson } from '@/features/schedule/queries';

export function useClock()
{
    const [now, setNow] = useState(() => Date.now());

    useEffect(() =>
    {
        const timer = window.setInterval(() => setNow(Date.now()), 30_000);

        return () => window.clearInterval(timer);
    }, []);

    return now;
}

export function lessonTime(lesson: Lesson, end = false)
{
    return Date.parse(`${lesson.date}T${end ? lesson.end_time : lesson.start_time}:00+03:00`);
}

export function greeting(now: number)
{
    const hour = Number(new Intl.DateTimeFormat('ru-RU', { timeZone: 'Europe/Moscow', hour: 'numeric', hourCycle: 'h23' }).format(now));

    return hour < 6 ? 'Доброй ночи' : hour < 12 ? 'Доброе утро' : hour < 18 ? 'Добрый день' : 'Добрый вечер';
}

export function durationLabel(minutes: number): string
{
    if (minutes < 60)
    {
        return `${minutes} мин`;
    }
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;

    return `${hours} ч${remainder ? ` ${remainder} мин` : ''}`;
}

export function lessonTiming(lesson: Lesson, now: number, today: string): string
{
    if (lesson.date !== today)
    {
        return '';
    }
    const startsIn = Math.ceil((lessonTime(lesson) - now) / 60_000);

    if (startsIn > 0)
    {
        return `через ${durationLabel(startsIn)}`;
    }

    return `идёт, до конца ${durationLabel(Math.ceil((lessonTime(lesson, true) - now) / 60_000))}`;
}
