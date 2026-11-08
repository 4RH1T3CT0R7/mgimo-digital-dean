import { useSearchParams } from 'react-router';
import { useProfile } from '@/features/profile/queries';
import { formatDate, toApiDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { AsOf } from '@/shared/ui/as-of';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { addDays, monday, validDate, weekdayLabel } from './calendar';
import { LessonRow } from './components/LessonRow';
import { WeekSwitcher } from './components/WeekSwitcher';
import { useSchedule } from './queries';

export function SchedulePage()
{
    const [params, setParams] = useSearchParams();
    const selected = params.get('date');
    const today = toApiDate();
    const from = monday(validDate(selected) ? selected : today);
    const to = addDays(from, 6);
    const schedule = useSchedule(from, to);
    const profile = useProfile();
    const chooseDate = (date: string) => setParams((current) => {
        current.set('date', date);

        return current;
    });

    return (
        <>
            <PageHeader title="Расписание" />
            <WeekSwitcher from={from} to={to} week={schedule.data?.weeks.find((week) => week.start_date === from)}
                onPrevious={() => chooseDate(addDays(from, -7))} onNext={() => chooseDate(addDays(from, 7))} onToday={() => chooseDate(today)} />
            <QueryView query={schedule} isEmpty={(data) => data.lessons.length === 0}
                empty={<EmptyState title="На этой неделе занятий нет" description="Выберите другую неделю или вернитесь к сегодняшнему дню." />}>
                {(data) => (
                    <div className="flex flex-col gap-6">
                        {Array.from({ length: 7 }, (_, i) => addDays(from, i)).map((date) => (
                            <section key={date} aria-labelledby={`day-${date}`} className="min-w-0">
                                <h2 id={`day-${date}`} className={cn('sticky top-header z-10 mb-3 flex flex-wrap items-baseline justify-between gap-2 bg-background py-3 text-lg font-semibold', date === today && 'border-b-2 border-primary')}>
                                    <span className="capitalize">{weekdayLabel(date)}, {formatDate(date)}</span>
                                    {date === today && <span className="text-sm font-medium">Сегодня</span>}
                                </h2>
                                {data.lessons.some((lesson) => lesson.date === date) ? (
                                    <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                                        {data.lessons.filter((lesson) => lesson.date === date).map((lesson) => (
                                            <li key={`${lesson.id}-${lesson.status}-${lesson.date}`}><LessonRow lesson={lesson} languageGroups={profile.data?.language_groups} /></li>
                                        ))}
                                    </ul>
                                ) : <p className="py-2 text-muted-foreground">Нет занятий</p>}
                            </section>
                        ))}
                        <AsOf date={data.as_of} />
                    </div>
                )}
            </QueryView>
        </>
    );
}
