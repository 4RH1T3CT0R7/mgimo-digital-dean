import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { components } from '@/api/academic';
import { shortDate, validDate } from '@/features/schedule/calendar';
import type { Lesson } from '@/features/schedule/queries';
import { ApiError, apiErrorMessage, fieldErrors } from '@/shared/lib/errors';
import { toApiDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { changeActions, changeLabels } from './labels';
import { pairs } from './pairs';
import { useChangeLesson } from './queries';

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: ReactNode })
{
    return <div className="flex min-w-0 flex-col gap-2"><Label htmlFor={id}>{label}</Label>{children}{error && <p id={`${id}-error`} className="text-sm text-danger-strong">{error}</p>}</div>;
}

export function ChangeLessonSheet({ lesson, open = true, onClose, returnFocus }: { lesson: Lesson; open?: boolean; onClose: () => void; returnFocus?: () => void })
{
    const [type, setType] = useState<components['schemas']['LessonChangeType']>('moved');
    const [date, setDate] = useState('');
    const [pair, setPair] = useState(String(pairs.find((item) => item.start === lesson.start_time && item.end === lesson.end_time)?.number ?? 'custom'));
    const [start, setStart] = useState(lesson.start_time);
    const [end, setEnd] = useState(lesson.end_time);
    const [building, setBuilding] = useState('');
    const [room, setRoom] = useState('');
    const [reason, setReason] = useState('');
    const [errors, setErrors] = useState<Record<string, string>>({});
    const [body, setBody] = useState<components['schemas']['LessonChangeRequest'] | null>(null);
    const formRef = useRef<HTMLFormElement>(null);
    const change = useChangeLesson(lesson.id);

    useEffect(() =>
    {
        if (Object.keys(errors).length > 0)
        {
            formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
        }
    }, [errors]);

    const choosePair = (value: string) =>
    {
        setPair(value);
        const selected = pairs.find((item) => String(item.number) === value);

        if (selected)
        {
            setStart(selected.start);
            setEnd(selected.end);
        }
    };
    const prepare = (event: FormEvent) =>
    {
        event.preventDefault();
        const nextErrors: Record<string, string> = {};
        const hasRoom = !!building.trim() || !!room.trim();
        const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/;

        if (type === 'moved')
        {
            if (!validDate(date))
            {
                nextErrors.new_date = 'Укажите новую дату';
            }
            else if (date < toApiDate())
            {
                nextErrors.new_date = 'Нельзя перенести занятие в прошлое';
            }
            if (!timePattern.test(start))
            {
                nextErrors.new_start_time = 'Укажите время начала';
            }
            if (!timePattern.test(end) || end <= start)
            {
                nextErrors.new_end_time = 'Время окончания должно быть позже начала';
            }
            if (date === lesson.date && start === lesson.start_time && end === lesson.end_time)
            {
                nextErrors.new_date = 'Выберите другую дату или время';
            }
        }
        if (type === 'room_changed' || (type === 'moved' && hasRoom))
        {
            if (!building.trim() || !room.trim())
            {
                nextErrors.new_room = 'Укажите корпус и номер аудитории';
            }
            else if (building.trim().length > 100 || room.trim().length > 100)
            {
                nextErrors.new_room = 'Корпус и аудитория — не более 100 символов';
            }
            else if (type === 'room_changed' && building.trim() === lesson.room?.building && room.trim() === lesson.room?.number)
            {
                nextErrors.new_room = 'Укажите другую аудиторию';
            }
        }
        if (reason.trim().length > 300)
        {
            nextErrors.reason = 'Причина — не более 300 символов';
        }
        setErrors(nextErrors);

        if (Object.keys(nextErrors).length > 0)
        {
            return;
        }
        change.reset();
        setBody({ type, ...(type === 'moved' ? { new_date: date, new_start_time: start, new_end_time: end } : {}),
            ...((type === 'room_changed' || (type === 'moved' && hasRoom)) ? { new_room: { building: building.trim(), number: room.trim() } } : {}),
            ...(reason.trim() ? { reason: reason.trim() } : {}) });
    };
    const submit = () =>
    {
        if (!body || change.isPending)
        {
            return;
        }
        change.mutate(body, {
            onSuccess: () =>
            {
                toast.success(changeActions[body.type].success);
                onClose();
            },
            onError: (error) =>
            {
                const fields = fieldErrors(error);

                if (error instanceof ApiError && error.status === 400)
                {
                    if (fields.new_start_time || fields.new_end_time)
                    {
                        setPair('custom');
                    }
                    setErrors({ ...fields, ...(fields['new_room.building'] || fields['new_room.number'] ? { new_room: fields['new_room.building'] ?? fields['new_room.number'] } : {}) });
                    setBody(null);
                }
            },
        });
    };
    const error = change.error instanceof ApiError && change.error.status === 409
        ? 'Занятие уже отменено, изменить его нельзя' : change.error ? apiErrorMessage(change.error) : null;
    const fieldProps = (key: string) => ({ 'aria-invalid': !!errors[key], 'aria-describedby': errors[key] ? `${key}-error` : undefined });
    const handleOpenChange = (open: boolean) =>
    {
        if (!open && !change.isPending)
        {
            onClose();
        }
    };
    const preventPendingClose = (event: { preventDefault: () => void }) =>
    {
        if (change.isPending)
        {
            event.preventDefault();
        }
    };
    const back = () =>
    {
        setBody(null);
        change.reset();
    };
    const chooseType = (value: string) =>
    {
        setType(value as typeof type);
        setErrors({});
        change.reset();
    };

    return (
        <Sheet open={open} onOpenChange={handleOpenChange}>
            <SheetContent className="mx-auto max-w-2xl [&>button:last-child]:size-11" onEscapeKeyDown={preventPendingClose} onPointerDownOutside={preventPendingClose}
                onCloseAutoFocus={(event) => { if (returnFocus) { event.preventDefault(); returnFocus(); } }}>
                <SheetHeader><SheetTitle>Изменить занятие</SheetTitle><SheetDescription>{lesson.discipline.name}, {shortDate(lesson.date)}, {lesson.start_time}–{lesson.end_time}</SheetDescription></SheetHeader>
                {error && <p role="alert" className="text-sm text-danger-strong">{error}</p>}
                {body ? <div className="flex flex-col gap-5">
                    <h3 className="font-semibold">Проверьте изменение</h3>
                    <p>Занятие «{lesson.discipline.name}» {shortDate(lesson.date)} в {lesson.start_time}{body.type === 'moved' ? ` переносится на ${shortDate(body.new_date!)} в ${body.new_start_time}–${body.new_end_time}.` : body.type === 'cancelled' ? ' отменяется.' : ': меняется аудитория.'}</p>
                    {body.new_room && <p>Аудитория: {body.new_room.building}, {body.new_room.number}</p>}
                    {body.reason && <p className="break-words">Причина: {body.reason}</p>}
                    <p className="text-sm text-muted-foreground">Уведомление получат студенты {lesson.groups.length === 1 ? 'группы' : 'групп'} {lesson.groups.map((group) => group.name).join(', ')}.</p>
                    <div className="sticky -bottom-5 -mx-5 flex flex-wrap gap-3 border-t bg-card px-5 py-3">
                        <Button variant={body.type === 'cancelled' ? 'destructive' : 'default'}
                            disabled={change.isPending || (change.error instanceof ApiError && change.error.status === 409)} onClick={submit}>
                            {change.isPending ? changeActions[body.type].pending : changeActions[body.type].action}
                        </Button>
                        <Button variant="outline" disabled={change.isPending} onClick={back}>Назад</Button>
                    </div>
                </div> : <form ref={formRef} onSubmit={prepare} noValidate className="flex flex-col gap-5">
                    <Field id="change-type" label="Что изменить">
                        <Select value={type} onValueChange={chooseType}>
                            <SelectTrigger id="change-type"><SelectValue /></SelectTrigger>
                            <SelectContent>{Object.entries(changeLabels).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
                        </Select>
                    </Field>
                    {type === 'moved' && <>
                        <Field id="new_date" label="Новая дата" error={errors.new_date}>
                            <Input id="new_date" type="date" min={toApiDate()} value={date} onChange={(event) => setDate(event.target.value)} {...fieldProps('new_date')} />
                        </Field>
                        <Field id="pair" label="Пара">
                            <Select value={pair} onValueChange={choosePair}>
                                <SelectTrigger id="pair"><SelectValue /></SelectTrigger>
                                <SelectContent>
                                    {pairs.map((item) => <SelectItem key={item.number} value={String(item.number)}>{item.number}-я пара — {item.start}–{item.end}</SelectItem>)}
                                    <SelectItem value="custom">Своё время</SelectItem>
                                </SelectContent>
                            </Select>
                        </Field>
                        {pair === 'custom' && <div className="grid grid-cols-2 gap-4">
                            <Field id="new_start_time" label="Начало" error={errors.new_start_time}><Input id="new_start_time" type="time" value={start} onChange={(event) => setStart(event.target.value)} {...fieldProps('new_start_time')} /></Field>
                            <Field id="new_end_time" label="Окончание" error={errors.new_end_time}><Input id="new_end_time" type="time" value={end} onChange={(event) => setEnd(event.target.value)} {...fieldProps('new_end_time')} /></Field>
                        </div>}
                    </>}
                    {type !== 'cancelled' && <>
                        <Field id="building" label={type === 'moved' ? 'Корпус (необязательно)' : 'Корпус'}><Input id="building" value={building} maxLength={100} onChange={(event) => setBuilding(event.target.value)} aria-describedby={errors.new_room ? 'new_room-error' : undefined} aria-invalid={!!errors.new_room} /></Field>
                        <Field id="new_room" label={type === 'moved' ? 'Аудитория (необязательно)' : 'Аудитория'} error={errors.new_room}><Input id="new_room" value={room} maxLength={100} onChange={(event) => setRoom(event.target.value)} {...fieldProps('new_room')} /></Field>
                    </>}
                    <Field id="reason" label="Причина" error={errors.reason}><Textarea id="reason" value={reason} maxLength={300} onChange={(event) => setReason(event.target.value)} {...fieldProps('reason')} /></Field>
                    <div className="sticky -bottom-5 -mx-5 border-t bg-card px-5 py-3"><Button type="submit">Далее</Button></div>
                </form>}
            </SheetContent>
        </Sheet>
    );
}
