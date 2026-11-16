import { ChevronDownIcon, ExternalLinkIcon } from 'lucide-react';
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
import { eventLabels, eventTones, periodLabels, periodText, periodTiles } from './labels';
import { useAcademicCalendar } from './queries';
import { semesterWeeks } from './weeks';

type S = components['schemas'];
type Week = ReturnType<typeof semesterWeeks>[number];

function WeekStrip({ weeks }: { weeks: Week[] })
{
    const scroller = useRef<HTMLDivElement>(null);
    // Ширина сетки — не уже недель по 2.25rem: иначе колонки вылезают за сетку и подписи не прилипают к краю
    const columns = { gridTemplateColumns: `repeat(${weeks.length}, minmax(0, 1fr))`, width: `max(100%, ${weeks.length * 2.375 - 0.125}rem)` };
    const runs: { period?: S['TermPeriod']; column: number; span: number }[] = [];

    weeks.forEach((week, index) =>
    {
        const last = runs.at(-1);

        if (last && last.period === week.period) last.span += 1;
        else runs.push({ period: week.period, column: index + 1, span: 1 });
    });

    // На телефоне полоса прокручивается внутри себя: сразу, без анимации, показываем текущую неделю
    useEffect(() =>
    {
        const box = scroller.current;
        const now = box?.querySelector<HTMLElement>('[aria-current="date"]');

        if (box && now) box.scrollLeft = now.offsetLeft - (box.clientWidth - now.offsetWidth) / 2;
    }, []);

    return (
        <div ref={scroller} role="region" aria-label="Полоса недель" tabIndex={0}
            className="relative -mx-5 overflow-x-auto px-5 pt-0.5 pb-1 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:-mx-6 md:px-6">
            {/* Подписи периодов в две строки по очереди: подпись короткого периода может зайти на соседний, но не на чужую подпись.
                При прокрутке подпись длинного периода остаётся у левого края, пока его недели на экране */}
            <div aria-hidden className="mb-1.5 grid gap-x-0.5 gap-y-1" style={columns}>
                {runs.filter((run) => run.period).map((run, index) => (
                    <span key={run.column} style={{ gridColumn: `${run.column} / span ${run.span}`, gridRow: index % 2 + 1 }}
                        className={cn('sticky left-0 min-w-0 justify-self-start pl-0.5 text-[0.8125rem] font-medium whitespace-nowrap', periodText[run.period!.kind])}>
                        {periodLabels[run.period!.kind]}
                    </span>
                ))}
            </div>
            <ol aria-label="Недели семестра" className="grid gap-x-0.5" style={columns}>
                {weeks.map((week) => (
                    <li key={week.start} aria-current={week.current ? 'date' : undefined} className="flex min-w-0 flex-col gap-1.5">
                        <span aria-hidden title={rangeLabel(week.start, week.end)} className={cn(
                            'flex h-11 flex-col items-center justify-center gap-1 rounded-md border text-[0.8125rem] font-medium tabular-nums',
                            week.period ? periodTiles[week.period.kind] : 'border-dashed border-border text-muted-foreground',
                            week.current && 'ring-2 ring-foreground',
                        )}>
                            {week.number}
                            <span className={cn('size-1.5 rounded-full', week.events > 0 && 'bg-current')} />
                        </span>
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
            className="-my-2.5 w-fit py-2.5 text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none">
            Официальные учебные планы и графики на mgimo.ru
            <ExternalLinkIcon className="ml-1.5 inline size-4 align-[-0.125em]" aria-hidden />
            <span className="sr-only"> (откроется в новой вкладке)</span>
        </a>
    );
}

function Day({ date, items, past }: { date: string; items: S['AcademicEvent'][]; past: boolean })
{
    return (
        <li className={cn('grid min-w-0 gap-3 px-4 py-4 sm:grid-cols-[12.5rem_minmax(0,1fr)] md:px-5', past && 'text-muted-foreground')}>
            <p className="font-semibold">{dayHeading(date)}</p>
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
    const past = days.filter(([date]) => date < today);
    const upcoming = days.filter(([date]) => date >= today);

    return (
        <div className="flex flex-col gap-3">
            {/* Прошедшие нужны редко — свёрнуты и приглушены, ближайшие сразу на экране */}
            {past.length > 0 && (
                <details className="group rounded-xl border bg-card">
                    <summary className="flex min-h-11 cursor-pointer items-center gap-2 px-4 text-sm font-medium text-primary md:px-5">
                        Прошедшие мероприятия: {past.reduce((sum, [, items]) => sum + items.length, 0)}
                        <ChevronDownIcon className="size-4 transition-transform group-open:rotate-180" aria-hidden />
                    </summary>
                    <ul aria-label="Прошедшие мероприятия" className="divide-y border-t">
                        {past.map(([date, items]) => <Day key={date} date={date} items={items} past />)}
                    </ul>
                </details>
            )}
            {upcoming.length > 0
                ? (
                    <ul aria-label="Ближайшие мероприятия" className="divide-y overflow-hidden rounded-xl border bg-card">
                        {upcoming.map(([date, items]) => <Day key={date} date={date} items={items} past={false} />)}
                    </ul>
                )
                : <p className="text-muted-foreground">Больше контрольных мероприятий в этом семестре нет.</p>}
        </div>
    );
}

/** Вкладка «Учебный год» в «Учёбе» (D62): полоса по неделям семестра и контрольные мероприятия. */
export function AcademicYearTab()
{
    const calendar = useAcademicCalendar();
    const today = toApiDate();

    return (
        <QueryView query={calendar} isEmpty={(data) => data.periods.length === 0 && data.events.length === 0}
            empty={<EmptyState title="Календарный план пока не опубликован" description="Когда график опубликуют, здесь появятся недели семестра и даты сессии." action={<OfficialLink />} />}>
            {(data) => (
                <div className="flex flex-col gap-6">
                    <Section title={`${termLabels[data.term.term]} ${data.term.academic_year}`}>
                        {data.periods.length > 0 && (
                            <>
                                <WeekStrip weeks={semesterWeeks(data, today)} />
                                <ul aria-label="Периоды семестра" className="flex flex-col gap-2 text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
                                    {data.periods.map((period) => (
                                        <li key={period.start_date} className="flex items-center gap-2">
                                            <span aria-hidden className={cn('size-3.5 shrink-0 rounded-xs border', periodTiles[period.kind])} />
                                            <span className="font-medium">{periodLabels[period.kind]}</span>
                                            <span className="text-muted-foreground">{rangeLabel(period.start_date, period.end_date)}</span>
                                        </li>
                                    ))}
                                </ul>
                                <p className="flex items-center gap-2 text-sm text-muted-foreground">
                                    <span aria-hidden className="flex size-3.5 shrink-0 items-center justify-center"><span className="size-1.5 rounded-full bg-foreground" /></span>
                                    Точка под номером — на неделе есть контрольные мероприятия
                                </p>
                            </>
                        )}
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
