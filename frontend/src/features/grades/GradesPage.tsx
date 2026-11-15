import type { components } from '@/api/academic';
import { formatDate, plural } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { AsOf } from '@/shared/ui/as-of';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { controlFormLabels, decimal, gradeLabels, termLabels, trafficLabels, trafficTones } from './labels';
import { useCurrentGrades, useGradesSummary, useSessionResults } from './queries';

type S = components['schemas'];

function CurrentDiscipline({ discipline }: { discipline: S['CurrentDiscipline'] })
{
    const progressColor = discipline.traffic === 'red' ? 'bg-danger-strong'
        : discipline.traffic === 'yellow' ? 'bg-warning-strong' : 'bg-success-strong';

    return (
        <article className="flex min-w-0 flex-col gap-4 px-4 py-5 md:px-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h3 className="font-semibold break-words">{discipline.discipline.name}</h3>
                    <p className="mt-1 text-sm text-muted-foreground">{controlFormLabels[discipline.control_form]}</p>
                </div>
                <StatusBadge tone={trafficTones[discipline.traffic]}>
                    <span aria-hidden className="mr-1.5 size-1.5 rounded-full bg-current" />{trafficLabels[discipline.traffic]}
                </StatusBadge>
            </div>
            <div>
                <div className="mb-2 flex flex-wrap justify-between gap-2 text-sm">
                    <span>Набрано {discipline.score} из 100</span>
                    <span className="text-muted-foreground">Максимум на сегодня: {discipline.max_to_date}</span>
                </div>
                <div className="relative h-3 rounded-full bg-muted" role="progressbar"
                    aria-label={`Баллы: ${discipline.discipline.name}`} aria-valuenow={discipline.score} aria-valuemin={0} aria-valuemax={100}>
                    <div className={cn('h-full rounded-full', progressColor)} style={{ width: `${Math.max(0, Math.min(100, discipline.score))}%` }} />
                    <span className="absolute top-[-3px] h-[18px] w-0.5 bg-foreground" style={{ left: `${Math.max(0, Math.min(100, discipline.max_to_date))}%` }} aria-hidden />
                </div>
            </div>
            <p className="text-sm">Посещаемость: {discipline.attendance_percent}%</p>
            {discipline.traffic_reason && <p className="text-sm">{discipline.traffic_reason}</p>}
            {discipline.control_form !== 'credit' && (
                <p className="text-sm text-muted-foreground">
                    {discipline.to_excellent.needed === 0 ? 'Идёте на «отлично»' : discipline.to_excellent.achievable
                        ? `До «отлично» не хватает ${discipline.to_excellent.needed} ${plural(discipline.to_excellent.needed, ['балла', 'баллов', 'баллов'])}`
                        : 'В этом семестре «отлично» уже недостижимо'}
                </p>
            )}
            <details className="border-t pt-2">
                <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">Контрольные точки</summary>
                {discipline.teacher && <p className="mb-3 text-sm text-muted-foreground">{discipline.teacher.short_name}</p>}
                {discipline.control_points.length === 0 ? <p className="py-2 text-sm text-muted-foreground">Контрольные точки пока не назначены</p> : (
                    <ul className="divide-y">{discipline.control_points.map((point, index) => (
                        <li key={`${point.date}-${point.title}-${index}`} className="flex items-start justify-between gap-4 py-3 text-sm">
                            <div className="min-w-0"><p className="break-words">{point.title}</p><p className="mt-1 text-muted-foreground">{formatDate(point.date)}</p></div>
                            <p className="shrink-0 tabular-nums">{point.score == null ? 'Не оценено' : `${point.score} из ${point.max}`}</p>
                        </li>
                    ))}</ul>
                )}
            </details>
        </article>
    );
}

function SessionResult({ result }: { result: S['SessionResult'] })
{
    return (
        <li className="grid min-w-0 gap-3 px-4 py-5 sm:grid-cols-[minmax(0,1fr)_auto] md:px-6">
            <div className="min-w-0">
                <h3 className="font-semibold break-words">{result.discipline.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{controlFormLabels[result.control_form]}</p>
                <p className="mt-1 text-sm text-muted-foreground">
                    {result.hours} {plural(result.hours, ['час', 'часа', 'часов'])},
                    {' '}{result.credits} {plural(result.credits, ['зачётная единица', 'зачётные единицы', 'зачётных единиц'])}
                </p>
            </div>
            <div className="flex flex-col items-start gap-2 sm:items-end">
                <StatusBadge tone={result.status === 'failed' ? 'danger' : result.status === 'passed' ? 'success' : 'neutral'}>
                    {result.status === 'pending' ? 'Результата пока нет'
                        : result.control_form === 'credit' ? result.passed ? 'Зачтено' : 'Не зачтено'
                        : result.grade5 ? gradeLabels[result.grade5] : 'Результат не указан'}
                </StatusBadge>
                {result.control_form !== 'credit' && result.percent != null && (
                    <p className="text-sm tabular-nums">{result.percent}%{result.ects ? `, ECTS ${result.ects}` : ''}</p>
                )}
                {result.date && <p className="text-sm text-muted-foreground">{formatDate(result.date)}</p>}
            </div>
        </li>
    );
}

export function GradesPage()
{
    const summary = useGradesSummary();
    const current = useCurrentGrades();
    const sessions = useSessionResults();

    return (
        <>
            <PageHeader title="Успеваемость" subtitle="Баллы за семестр и результаты сессий" />
            <QueryView query={summary} isEmpty={(data) => data.average_grade5 == null && data.average_percent == null
                && !data.rating && data.debts_count === 0 && data.traffic.green + data.traffic.yellow + data.traffic.red === 0}
                empty={<EmptyState title="Оценок пока нет" description="Средний балл появится после первых оценок." />}>
                {(data) => (
                    <section aria-label="Сводка успеваемости" className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:p-6">
                        <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
                            <div>
                                <dt className="text-sm text-muted-foreground">Средний балл</dt>
                                <dd className="mt-2 text-2xl font-semibold tabular-nums">{decimal(data.average_grade5, 2)}</dd>
                            </div>
                            <div>
                                <dt className="text-sm text-muted-foreground">Средний процент</dt>
                                <dd className="mt-2 text-2xl font-semibold tabular-nums">
                                    {data.average_percent == null ? 'Пока нет данных' : `${decimal(data.average_percent)}%`}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm text-muted-foreground">Долги</dt>
                                <dd className={cn('mt-2 text-2xl font-semibold tabular-nums', data.debts_count > 0 && 'text-danger-strong')}>
                                    {data.debts_count}
                                </dd>
                            </div>
                            <div>
                                <dt className="text-sm text-muted-foreground">Текущий семестр</dt>
                                <dd className="mt-2 text-2xl font-semibold tabular-nums">{data.current_semester}</dd>
                            </div>
                        </dl>
                        {data.rating && (
                            <div className="border-t pt-4">
                                <p className="font-medium">Академический рейтинг: {decimal(data.rating.percent)}%</p>
                                {data.rating.percentile != null && <p className="mt-1 text-sm text-muted-foreground">Выше, чем у {data.rating.percentile}% студентов курса</p>}
                            </div>
                        )}
                        <ul aria-label="Дисциплины по степени риска" className="flex flex-wrap gap-2">
                            {(['red', 'yellow', 'green'] as const).map((traffic) => (
                                <li key={traffic}><StatusBadge tone={trafficTones[traffic]}>{trafficLabels[traffic]}: {data.traffic[traffic]}</StatusBadge></li>
                            ))}
                        </ul>
                        <AsOf date={data.as_of} />
                    </section>
                )}
            </QueryView>
            <Tabs defaultValue="current" className="mt-8 gap-5">
                <TabsList aria-label="Раздел успеваемости">
                    <TabsTrigger value="current" className="h-11 px-3">Текущий семестр</TabsTrigger>
                    <TabsTrigger value="sessions" className="h-11 px-3">Сессии</TabsTrigger>
                </TabsList>
                <TabsContent value="current">
                    <QueryView query={current} isEmpty={(data) => data.disciplines.length === 0}
                        empty={<EmptyState title="Дисциплины пока не добавлены" />}>
                        {(data) => (
                            <div className="flex flex-col gap-4">
                                <ul aria-label="Дисциплины текущего семестра" className="divide-y overflow-hidden rounded-xl border bg-card">
                                    {data.disciplines.map((discipline) => (
                                        <li key={discipline.discipline.id}><CurrentDiscipline discipline={discipline} /></li>
                                    ))}
                                </ul>
                                <AsOf date={data.as_of} />
                            </div>
                        )}
                    </QueryView>
                </TabsContent>
                <TabsContent value="sessions">
                    <QueryView query={sessions} isEmpty={(data) => data.semesters.length === 0}
                        empty={<EmptyState title="Результатов сессий пока нет" description="Здесь будут оценки и зачёты завершённых семестров." />}>
                        {(data) => <div className="flex flex-col gap-6">{data.semesters.map((semester) => (
                            <section key={semester.semester} aria-labelledby={`semester-${semester.semester}`}>
                                <h2 id={`semester-${semester.semester}`} className="mb-3 text-lg font-semibold">{semester.semester}-й семестр</h2>
                                <p className="mb-4 text-sm text-muted-foreground">{termLabels[semester.term]}, {semester.academic_year}</p>
                                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                                    {semester.results.map((result) => <SessionResult key={result.discipline.id} result={result} />)}
                                </ul>
                            </section>
                        ))}<AsOf date={data.as_of} /></div>}
                    </QueryView>
                </TabsContent>
            </Tabs>
        </>
    );
}
