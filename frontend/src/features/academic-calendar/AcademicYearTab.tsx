import { ExternalLinkIcon } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { components } from '@/api/academic';
import { termLabels } from '@/features/grades/labels';
import { RoomLink } from '@/features/schedule/components/RoomLink';
import { dayHeading, rangeLabel } from '@/features/schedule/calendar';
import { plural, toApiDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { EmptyState } from '@/shared/ui/empty-state';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { StatusBadge } from '@/shared/ui/status-badge';
import { eventLabels, eventTones, periodColors, periodLabels } from './labels';
import { useAcademicCalendar } from './queries';
import { semesterWeeks } from './weeks';

type S = components['schemas'];

function WeekStrip({ weeks }: { weeks: ReturnType<typeof semesterWeeks> })
{
    const scroller = useRef<HTMLDivElement>(null);

    // На телефоне полоса прокручивается внутри себя: сразу, без анимации, показываем текущую неделю
    useEffect(() =>
    {
        const box = scroller.current;
        const now = box?.querySelector<HTMLElement>('[aria-current="date"]');

        if (box && now) box.scrollLeft = now.offsetLeft - (box.clientWidth - now.offsetWidth) / 2;
    }, []);

    return (
        <div ref={scroller} className="relative -mx-5 overflow-x-auto px-5 pb-1 md:-mx-6 md:px-6">
            <ol aria-label="Недели семестра" className="grid gap-0.5" style={{ gridTemplateColumns: `repeat(${weeks.length}, minmax(1.75rem, 1fr))` }}>
                {weeks.map((week) => (
                    <li key={week.start} aria-current={week.current ? 'date' : undefined} className="flex min-w-0 flex-col gap-1.5">
                        <span aria-hidden className="h-5 text-[0.8125rem] whitespace-nowrap text-muted-foreground">{week.month}</span>
                        <span aria-hidden className={cn('flex h-10 items-center justify-center rounded-md text-[0.8125rem] font-medium tabular-nums',
                            week.period ? periodColors[week.period.kind] : 'bg-muted text-muted-foreground', week.current && 'ring-2 ring-foreground')}>
                            {week.number}
                        </span>
                        <span aria-hidden className="h-5 text-center text-[0.8125rem] font-semibold tabular-nums">{week.events || ''}</span>
                        <span aria-hidden className="h-5 self-center text-[0.8125rem] font-medium whitespace-nowrap">{week.current ? 'Сейчас' : ''}</span>
                        <span className="sr-only">
                            {week.number}-я неделя, {rangeLabel(week.start, week.end)}: {week.period ? periodLabels[week.period.kind].toLowerCase() : 'вне учебного графика'}
                            {week.events > 0 && `, ${week.events} ${plural(week.events, ['контрольное мероприятие', 'контрольных мероприятия', 'контрольных мероприятий'])}`}
                            {week.current && ', сейчас'}
                        </span>
                    </li>
                ))}
            </ol>
        </div>
    );
}

function OfficialLink()
{
    return (
        <a href="https://mgimo.ru/sveden/education/" target="_blank" rel="noopener noreferrer"
            className="-my-2 inline-flex min-h-11 w-fit items-center gap-1.5 text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            Официальные учебные планы и графики на mgimo.ru
            <ExternalLinkIcon className="size-4 shrink-0" aria-hidden />
            <span className="sr-only"> (откроется в новой вкладке)</span>
        </a>
    );
}

function EventList({ events, today }: { events: S['AcademicEvent'][]; today: string })
{
    const days: [string, S['AcademicEvent'][]][] = [];

    for (const event of events)
    {
        const last = days.at(-1);

        if (last?.[0] === event.date) last[1].push(event);
        else days.push([event.date, [event]]);
    }
    if (days.length === 0)
    {
        return <p className="text-muted-foreground">Контрольных мероприятий в этом семестре пока нет.</p>;
    }

    return (
        <ul aria-label="Контрольные мероприятия по датам" className="divide-y overflow-hidden rounded-xl border bg-card">
            {days.map(([date, items]) =>
            {
                const past = date < today;

                return (
                    <li key={date} className={cn('grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[11rem_minmax(0,1fr)] md:px-5', past && 'text-muted-foreground')}>
                        <p className="font-semibold">{dayHeading(date)}{past && <span className="sr-only">, прошло</span>}</p>
                        {/* Контрольных точек в день бывает несколько — у них без метки вида, название точки говорит само */}
                        <ul className="grid min-w-0 gap-4 lg:grid-cols-2">
                            {items.map((event) => (
                                <li key={event.id} className="flex min-w-0 flex-col items-start gap-1">
                                    {event.kind !== 'control_point' && (
                                        <div className="mb-0.5 flex flex-wrap items-center gap-x-3 gap-y-1">
                                            <StatusBadge tone={past ? 'neutral' : eventTones[event.kind]}>{eventLabels[event.kind]}</StatusBadge>
                                            <span className="text-sm tabular-nums">{event.start_time}–{event.end_time}</span>
                                        </div>
                                    )}
                                    <p className={cn('break-words', !past && 'font-medium')}>{event.discipline.name}</p>
                                    {event.title && <p className="text-sm break-words">{event.title}</p>}
                                    {event.room && (past
                                        ? <p className="text-sm">{event.room.building}, {event.room.number}</p>
                                        : <RoomLink room={event.room} />)}
                                </li>
                            ))}
                        </ul>
                    </li>
                );
            })}
        </ul>
    );
}

/** Вкладка «Учебный год» в «Учёбе» (D62): полоса по неделям семестра и контрольные мероприятия. */
export function AcademicYearTab()
{
    const calendar = useAcademicCalendar();
    const today = toApiDate();

    return (
        <QueryView query={calendar} isEmpty={(data) => data.periods.length === 0 && data.events.length === 0}
            empty={<EmptyState title="Календарный план пока не опубликован" description="Сроки сессии есть в учебных графиках на сайте МГИМО." action={<OfficialLink />} />}>
            {(data) => (
                <div className="flex flex-col gap-6">
                    <Section title={`${termLabels[data.term.term]} ${data.term.academic_year}`}>
                        <WeekStrip weeks={semesterWeeks(data, today)} />
                        <ul aria-label="Периоды семестра" className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
                            {data.periods.map((period) => (
                                <li key={period.start_date} className="flex items-center gap-2">
                                    <span aria-hidden className={cn('size-3.5 shrink-0 rounded-xs border border-current', periodColors[period.kind])} />
                                    <span className="font-medium">{periodLabels[period.kind]}</span>
                                    <span className="text-muted-foreground">{rangeLabel(period.start_date, period.end_date)}</span>
                                </li>
                            ))}
                        </ul>
                        <p className="text-sm text-muted-foreground">Цифра под неделей — сколько в ней контрольных мероприятий.</p>
                        <OfficialLink />
                    </Section>
                    <section aria-labelledby="academic-events" className="min-w-0">
                        <h2 id="academic-events" className="mb-3 text-lg font-semibold">Контрольные мероприятия</h2>
                        <EventList events={data.events} today={today} />
                    </section>
                </div>
            )}
        </QueryView>
    );
}
