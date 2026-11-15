import { Link } from 'react-router';
import { useFeedCounters } from '@/features/notifications/queries';
import { useProfile } from '@/features/profile/queries';
import { statusLabel, statusTones } from '@/features/requests/labels';
import { addDays, monday, weekdayLabel } from '@/features/schedule/calendar';
import { LessonChangeLabel } from '@/features/schedule/components/LessonRow';
import { parityLabels } from '@/features/schedule/labels';
import { useSchedule } from '@/features/schedule/queries';
import { formatDate, formatDateTime, plural, toApiDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { StatusBadge } from '@/shared/ui/status-badge';
import { greeting, useClock } from './clock';
import { NextLesson } from './NextLesson';
import { useRecentApplications, useUpcomingDeadlines } from './queries';

export function TodayPage()
{
    const now = useClock();
    const today = toApiDate(new Date(now));
    const schedule = useSchedule(today, addDays(today, 13));
    const profile = useProfile();
    const applications = useRecentApplications();
    const deadlines = useUpcomingDeadlines();
    const counters = useFeedCounters();
    const week = schedule.data?.weeks.find((item) => item.start_date === monday(today));
    const queries = [schedule, profile, applications, deadlines, counters];
    const initial = queries.every((query) => query.data === undefined);
    const initialQuery = {
        ...schedule,
        refetch: async () =>
        {
            const [result] = await Promise.all([
                schedule.refetch(), profile.refetch(), applications.refetch(), deadlines.refetch(), counters.refetch(),
            ]);

            return result;
        },
    };
    const upcoming = deadlines.data?.filter((item) => Date.parse(item.due_at) >= now && toApiDate(item.due_at) <= addDays(today, 7)).slice(0, 3) ?? [];

    return (
        <>
            <PageHeader title="Сегодня" subtitle={`${weekdayLabel(today)}, ${formatDate(today)}${week ? ` · ${week.number}-я неделя, ${parityLabels[week.parity]}` : ''}`} />
            {initial ? <QueryView query={initialQuery}>{() => null}</QueryView> : <div className="flex min-w-0 flex-col gap-6">
                    <QueryView query={profile} isEmpty={(data) => !data.full_name} empty={<p className="text-lg">{greeting(now)}</p>}>
                        {(data) => <p className="text-xl font-semibold">{greeting(now)}, {data.full_name.trim().split(/\s+/)[1] ?? data.full_name}</p>}
                    </QueryView>
                    <QueryView query={counters}>
                        {(data) => data.important_unacked > 0 ? (
                            <Link to="/notifications"
                                className="flex min-h-11 items-center rounded-xl border bg-warning-soft p-4 font-medium text-warning-strong underline underline-offset-4">
                                {data.important_unacked} {plural(data.important_unacked,
                                    ['важное объявление ждёт', 'важных объявления ждут', 'важных объявлений ждут'])} ознакомления
                            </Link>
                        ) : null}
                    </QueryView>
                    <Section title="Сейчас / Далее">
                        <QueryView query={schedule}>
                            {(data) => <NextLesson schedule={data} now={now} languageGroups={profile.data?.language_groups} />}
                        </QueryView>
                    </Section>
                    <div className="grid min-w-0 gap-6 lg:grid-cols-2">
                        <Section title="Изменения">
                            <QueryView query={schedule} isEmpty={(data) => !data.lessons.some((lesson) => lesson.date <= addDays(today, 1) && lesson.status !== 'scheduled')}
                                empty={<p className="text-sm text-muted-foreground">На сегодня и завтра изменений нет</p>}>
                                {(data) => <ul className="divide-y">{data.lessons
                                    .filter((lesson) => lesson.date <= addDays(today, 1) && lesson.status !== 'scheduled')
                                    .map((lesson) => (
                                    <li key={`${lesson.id}-${lesson.status}`} className="flex min-w-0 flex-col items-start gap-2 py-3">
                                        <Link className="flex min-h-11 flex-col items-start justify-center gap-1 font-medium text-primary"
                                            to={`/schedule?date=${lesson.date}`}>
                                            <span>{lesson.discipline.name}</span>
                                            <span className="text-sm">{formatDate(lesson.date)}, {lesson.start_time}</span>
                                        </Link>
                                        <LessonChangeLabel lesson={lesson} />
                                        {lesson.change?.reason && <p className="text-sm text-muted-foreground">{lesson.change.reason}</p>}
                                    </li>
                                ))}</ul>}
                            </QueryView>
                        </Section>
                        <Section title="Дедлайны">
                            <QueryView query={deadlines} isEmpty={() => upcoming.length === 0}
                                empty={<p className="text-sm text-muted-foreground">На ближайшие 7 дней дедлайнов нет</p>}>
                                {() => (
                                    <ul className="divide-y">
                                        {upcoming.map((item) => (
                                            <li key={item.id} className="py-3">
                                                <p className="font-medium">{item.title}</p>
                                                <p className="mt-1 text-sm text-muted-foreground">До {formatDateTime(item.due_at)}</p>
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </QueryView>
                            <Button asChild variant="link" className="self-start px-0"><Link to="/notifications" aria-label="Все дедлайны">Все</Link></Button>
                        </Section>
                    </div>
                    <Section title="Мои заявки">
                        <QueryView query={applications} isEmpty={(data) => data.items.length === 0}
                            empty={(
                                <div className="flex flex-col items-start gap-3">
                                    <p className="text-muted-foreground">Заявок пока нет</p>
                                    <Button asChild><Link to="/requests/new/study-certificate">Заказать справку</Link></Button>
                                </div>
                            )}>
                            {(data) => <ul className="divide-y">{data.items.slice(0, 3).map((item) => (
                                <li key={item.id}><Link className="flex min-h-11 flex-wrap items-center justify-between gap-3 py-4" to={`/requests/${item.id}`}>
                                    <div className="min-w-0">
                                        <p className="font-medium break-words">{item.service_type.title}</p>
                                        <p className="mt-1 text-sm text-muted-foreground">№ {item.number}, {formatDate(item.created_at)}</p>
                                    </div>
                                    <StatusBadge tone={statusTones[item.status]}>{statusLabel(item.status, item.service_type.kind)}</StatusBadge>
                                </Link></li>
                            ))}</ul>}
                        </QueryView>
                    </Section>
                    <nav aria-label="Быстрые действия" className="flex flex-wrap gap-3">
                        <Button asChild><Link to="/requests/new/study-certificate">Справка с места учёбы</Link></Button>
                        <Button asChild variant="outline"><Link to="/schedule">Расписание</Link></Button>
                        <Button asChild variant="outline"><Link to="/grades">Успеваемость</Link></Button>
                        <Button asChild variant="outline"><Link to="/assistant">Спросить помощника</Link></Button>
                    </nav>
            </div>}
        </>
    );
}
