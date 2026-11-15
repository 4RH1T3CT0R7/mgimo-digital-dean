import { Link } from 'react-router';
import type { components } from '@/api/academic';
import { StatusBadge } from '@/shared/ui/status-badge';
import { cn } from '@/shared/lib/utils';
import { shortDate } from '../calendar';
import { lessonKindLabels } from '../labels';
import type { Lesson } from '../queries';
import { RoomLink } from './RoomLink';

export function LessonChangeLabel({ lesson, schedulePath = '/schedule' }: { lesson: Lesson; schedulePath?: string })
{
    const previous = lesson.change?.previous;

    if (lesson.status === 'moved' && previous)
    {
        return <StatusBadge tone="info" className="max-w-full whitespace-normal leading-snug">Перенесено с {shortDate(previous.date)}, {previous.start_time}</StatusBadge>;
    }
    if (lesson.status === 'moved_away' && lesson.moved_to)
    {
        return (
            <Link className="flex min-h-11 items-center text-sm text-primary underline underline-offset-4" to={`${schedulePath}?date=${lesson.moved_to.date}`}>
                Перенесено на {shortDate(lesson.moved_to.date)}, {lesson.moved_to.start_time}
            </Link>
        );
    }
    if (lesson.status === 'cancelled')
    {
        return <StatusBadge tone="neutral">Отменено</StatusBadge>;
    }
    if (lesson.status === 'changed')
    {
        return <StatusBadge tone="warning" className="max-w-full whitespace-normal leading-snug">Другая аудитория: {lesson.room?.number ?? 'не указана'} (было {previous?.room?.number ?? 'не указано'})</StatusBadge>;
    }

    return null;
}

export function LessonRow({ lesson, languageGroups = [], schedulePath }: {
    lesson: Lesson;
    languageGroups?: components['schemas']['LanguageGroupRef'][];
    schedulePath?: string;
})
{
    const inactive = lesson.status === 'cancelled' || lesson.status === 'moved_away';

    return (
        <article className={cn('grid min-w-0 gap-3 px-4 py-5 sm:grid-cols-[7.5rem_minmax(0,1fr)] sm:px-5', inactive && 'bg-muted/40')}>
            <div className="flex items-baseline gap-3 sm:flex-col sm:gap-1">
                <p className="font-semibold whitespace-nowrap tabular-nums"><time>{lesson.start_time}</time>–<time>{lesson.end_time}</time></p>
                <p className="text-sm text-muted-foreground">{lesson.pair_number === 8 ? 'Другое время' : `${lesson.pair_number}-я пара`}</p>
            </div>
            <div className="flex min-w-0 flex-col items-start gap-2">
                <p className={cn('font-semibold break-words', inactive && 'text-muted-foreground', lesson.status === 'cancelled' && 'line-through')}>{lesson.discipline.name}</p>
                <p className="text-sm text-muted-foreground">{lessonKindLabels[lesson.kind]}{lesson.format === 'online' ? ', онлайн' : ''}</p>
                <LessonChangeLabel lesson={lesson} schedulePath={schedulePath} />
                {lesson.change?.reason && <p className="text-sm break-words text-muted-foreground">{lesson.change.reason}</p>}
                {lesson.room && (inactive
                    ? <p className="text-sm">{lesson.room.building}, {lesson.room.number}</p>
                    : <RoomLink room={lesson.room} />)}
                {lesson.teacher && <p className="text-sm text-muted-foreground">{lesson.teacher.short_name}</p>}
                <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[0.8125rem] text-muted-foreground" aria-label="Группы занятия">
                    {lesson.groups.map((group) => (
                        <li key={group.id}>{group.name}{languageGroups.find((language) => language.id === group.id)?.language ? ` — ${languageGroups.find((language) => language.id === group.id)!.language}` : ''}</li>
                    ))}
                </ul>
            </div>
        </article>
    );
}
