import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router';
import { FacultyFilter, useFacultyFilter } from '@/app/layout/FacultyFilter';
import { useMe } from '@/features/auth/queries';
import { addDays, dayHeading, monday, validDate } from '@/features/schedule/calendar';
import { LessonRow } from '@/features/schedule/components/LessonRow';
import { WeekSwitcher } from '@/features/schedule/components/WeekSwitcher';
import type { Lesson } from '@/features/schedule/queries';
import { formatDate, toApiDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { ChangeLessonSheet } from './ChangeLessonSheet';
import { useStaffGroups, useStaffLessons } from './queries';

export function StaffLessonsPage()
{
    const me = useMe();
    const faculty = useFacultyFilter();
    // Панель остаётся смонтированной после закрытия (анимация и возврат фокуса); opens — новый экземпляр на каждое открытие
    const [selected, setSelected] = useState<Lesson | null>(null);
    const [sheetOpen, setSheetOpen] = useState(false);
    const [opens, setOpens] = useState(0);
    const opener = useRef<HTMLElement | null>(null);
    const [params, setParams] = useSearchParams();
    const date = params.get('date');
    const groupChoice = params.get('group_id');
    const from = monday(validDate(date) ? date : toApiDate());
    const to = addDays(from, 6);
    const groups = useStaffGroups(me.data?.role === 'admin' ? faculty : undefined, !!me.data);
    const group = groups.data?.find((item) => item.id === groupChoice) ?? groups.data?.[0];
    const lessons = useStaffLessons(group?.id ?? '', from, to);

    useEffect(() =>
    {
        if (group && group.id !== groupChoice)
        {
            setParams((current) =>
            {
                const next = new URLSearchParams(current);
                next.set('group_id', group.id);

                return next;
            }, { replace: true });
        }
    }, [group, groupChoice, setParams]);

    const choose = (key: string, value: string) => setParams((current) =>
    {
        const next = new URLSearchParams(current);
        next.set(key, value);

        return next;
    });

    return (
        <>
            <PageHeader title="Занятия" subtitle="Переносы, отмены и смена аудитории" />
            <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-2">
                <FacultyFilter />
                <QueryView query={groups} isEmpty={(data) => data.length === 0}
                    empty={<EmptyState title="На факультете пока нет групп" />}>
                    {(data) => (
                        <div className="flex min-w-0 flex-col gap-2">
                            <Label htmlFor="group">Группа</Label>
                            <Select value={group?.id ?? ''} onValueChange={(value) => choose('group_id', value)}>
                                <SelectTrigger id="group"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {data.map((item) => (
                                        <SelectItem key={item.id} value={item.id}>
                                            {item.name}{item.kind === 'language' ? ' (языковая)' : ''}
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    )}
                </QueryView>
            </div>
            {group && <>
                <WeekSwitcher from={from} to={to} onPrevious={() => choose('date', addDays(from, -7))}
                    onNext={() => choose('date', addDays(from, 7))} onToday={() => choose('date', toApiDate())} />
                <QueryView query={lessons} isEmpty={(data) => data.length === 0} empty={<EmptyState title="На этой неделе занятий нет" description="Выберите другую неделю или группу." />}>
                    {(data) => <div className="flex min-w-0 flex-col gap-6">{Array.from({ length: 7 }, (_, index) => addDays(from, index)).map((day) => <section key={day} aria-labelledby={`staff-day-${day}`}>
                        <h2 id={`staff-day-${day}`} className="sticky top-header z-10 [@media(max-height:480px)]:static mb-3 bg-background py-3 text-lg font-semibold">{dayHeading(day)}</h2>
                        {data.some((lesson) => lesson.date === day) ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{data.filter((lesson) => lesson.date === day).map((lesson) => <li key={`${lesson.id}-${lesson.status}-${lesson.date}`}>
                            <LessonRow lesson={lesson} schedulePath="/staff/lessons" />
                            {['scheduled', 'moved', 'changed'].includes(lesson.status) && (
                                <div className="px-4 pb-5 sm:px-5">
                                    <Button variant="outline" onClick={(e) => { opener.current = e.currentTarget; setSelected(lesson); setOpens((n) => n + 1); setSheetOpen(true); }}
                                        aria-label={`Изменить: ${lesson.discipline.name}, ${formatDate(lesson.date)} ${lesson.start_time}`}>
                                        Изменить
                                    </Button>
                                </div>
                            )}
                        </li>)}</ul> : <p className="py-2 text-muted-foreground">Нет занятий</p>}
                    </section>)}</div>}
                </QueryView>
            </>}
            {selected && <ChangeLessonSheet key={opens} lesson={selected} open={sheetOpen} onClose={() => setSheetOpen(false)} returnFocus={() => opener.current?.focus()} />}
        </>
    );
}
