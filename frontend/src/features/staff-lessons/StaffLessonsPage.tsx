import { useState } from 'react';
import { useSearchParams } from 'react-router';
import { useMe } from '@/features/auth/queries';
import { addDays, monday, validDate, weekdayLabel } from '@/features/schedule/calendar';
import { LessonRow } from '@/features/schedule/components/LessonRow';
import { WeekSwitcher } from '@/features/schedule/components/WeekSwitcher';
import type { Lesson } from '@/features/schedule/queries';
import { formatDate, toApiDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { fieldClass } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { ChangeLessonSheet } from './ChangeLessonSheet';
import { useFaculties, useStaffGroups, useStaffLessons } from './queries';

export function StaffLessonsPage()
{
    const me = useMe();
    const admin = me.data?.role === 'admin';
    const [faculty, setFaculty] = useState('');
    const [groupChoice, setGroupChoice] = useState('');
    const [selected, setSelected] = useState<Lesson | null>(null);
    const [params, setParams] = useSearchParams();
    const date = params.get('date');
    const from = monday(validDate(date) ? date : toApiDate());
    const to = addDays(from, 6);
    const faculties = useFaculties(admin);
    const groups = useStaffGroups(admin ? faculty : undefined, !!me.data && (!admin || !!faculty));
    const group = groups.data?.find((item) => item.id === groupChoice) ?? groups.data?.[0];
    const lessons = useStaffLessons(group?.id ?? '', from, to);
    const chooseDate = (next: string) => setParams((current) =>
    {
        current.set('date', next);

        return current;
    });
    const chooseFaculty = (value: string) =>
    {
        setFaculty(value);
        setGroupChoice('');
    };

    return (
        <>
            <PageHeader title="Занятия" subtitle="Переносы, отмены и смена аудитории" />
            <div className="mb-6 grid min-w-0 gap-4 sm:grid-cols-2">
                {admin && <QueryView query={faculties} isEmpty={(data) => data.length === 0} empty={<EmptyState title="Факультетов пока нет" />}>
                    {(data) => <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="faculty">Факультет</Label><select id="faculty" className={`${fieldClass} h-11`} value={faculty} onChange={(event) => chooseFaculty(event.target.value)}><option value="">Выберите факультет</option>{data.map((item) => <option key={item.id} value={item.id}>{item.short_name}</option>)}</select></div>}
                </QueryView>}
                {(!admin || faculty) && <QueryView query={groups} isEmpty={(data) => data.length === 0} empty={<EmptyState title="Групп пока нет" description="У выбранного факультета пока нет групп." />}>
                    {(data) => <div className="flex min-w-0 flex-col gap-2"><Label htmlFor="group">Группа</Label><select id="group" className={`${fieldClass} h-11`} value={group?.id ?? ''} onChange={(event) => setGroupChoice(event.target.value)}>{data.map((item) => <option key={item.id} value={item.id}>{item.name}{item.kind === 'language' ? ' (языковая)' : ''}</option>)}</select></div>}
                </QueryView>}
            </div>
            {admin && !faculty ? <EmptyState title="Выберите факультет" description="Затем выберите группу, чтобы увидеть занятия." /> : group && <>
                <WeekSwitcher from={from} to={to} onPrevious={() => chooseDate(addDays(from, -7))} onNext={() => chooseDate(addDays(from, 7))} onToday={() => chooseDate(toApiDate())} />
                <QueryView query={lessons} isEmpty={(data) => data.length === 0} empty={<EmptyState title="На этой неделе занятий нет" description="Выберите другую неделю или группу." />}>
                    {(data) => <div className="flex min-w-0 flex-col gap-6">{Array.from({ length: 7 }, (_, index) => addDays(from, index)).map((day) => <section key={day} aria-labelledby={`staff-day-${day}`}>
                        <h2 id={`staff-day-${day}`} className="sticky top-header z-10 mb-3 bg-background py-3 text-lg font-semibold capitalize">{weekdayLabel(day)}, {formatDate(day)}</h2>
                        {data.some((lesson) => lesson.date === day) ? <ul className="divide-y overflow-hidden rounded-xl border bg-card">{data.filter((lesson) => lesson.date === day).map((lesson) => <li key={`${lesson.id}-${lesson.status}-${lesson.date}`}>
                            <LessonRow lesson={lesson} schedulePath="/staff/lessons" />
                            {['scheduled', 'moved', 'changed'].includes(lesson.status) && <div className="px-4 pb-5 sm:px-5"><Button variant="outline" onClick={() => setSelected(lesson)}>Изменить</Button></div>}
                        </li>)}</ul> : <p className="py-2 text-muted-foreground">Нет занятий</p>}
                    </section>)}</div>}
                </QueryView>
            </>}
            {selected && <ChangeLessonSheet key={`${selected.id}-${selected.date}-${selected.start_time}`} lesson={selected} onClose={() => setSelected(null)} />}
        </>
    );
}
