import type { components } from '@/api/academic';
import { LessonRow } from '@/features/schedule/components/LessonRow';
import { formatDate, toApiDate } from '@/shared/lib/format';
import { AsOf } from '@/shared/ui/as-of';
import { lessonTime, lessonTiming } from './clock';

export function NextLesson({ schedule, now, languageGroups }: {
    schedule: components['schemas']['Schedule'];
    now: number;
    languageGroups?: components['schemas']['Profile']['language_groups'];
})
{
    const today = toApiDate(new Date(now));
    const active = schedule.lessons
        .filter((lesson) => lesson.status !== 'cancelled' && lesson.status !== 'moved_away')
        .sort((a, b) => lessonTime(a) - lessonTime(b));
    const next = active.find((lesson) => lessonTime(lesson, true) > now);
    const hadLessons = active.some((lesson) => lesson.date === today);
    const heading = hadLessons ? 'Пары на сегодня закончились' : 'Сегодня занятий нет';

    if (schedule.lessons.length === 0)
    {
        return (
            <>
                <p className="text-muted-foreground">В ближайшие 14 дней занятий нет</p>
                <AsOf date={schedule.as_of} />
            </>
        );
    }

    return (
        <>
            {next?.date !== today && <p className="font-medium">{heading}</p>}
            {next ? (
                <div>
                    <p className="text-sm font-medium">
                        {next.date === today ? lessonTiming(next, now, today) : `Следующий учебный день — ${formatDate(next.date)}`}
                    </p>
                    <LessonRow lesson={next} languageGroups={languageGroups} />
                </div>
            ) : <p className="text-sm text-muted-foreground">Проверьте расписание следующих недель.</p>}
            <AsOf date={schedule.as_of} />
        </>
    );
}
