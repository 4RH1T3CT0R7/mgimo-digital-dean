import { useState, type FormEvent, type ReactNode } from 'react';
import type { components } from '@/api/notifications';
import type { Me } from '@/app/session';
import { useServiceTypes } from '@/features/requests/queries';
import { toApiDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { QueryView } from '@/shared/ui/query-view';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { AudienceField, FieldError, SelectField } from './AudienceField';
import { fieldState, length, useFormErrors, validateAudience } from './fields';
import { announcementTypeLabels, deadlineKindLabels, type AnnouncementType } from './labels';
import { useStaffActions } from './queries';

type S = components['schemas'];

/** Radix Select не принимает пустое значение у пункта, поэтому «без услуги» обозначен своим маркером. */
const noService = 'none';

function titleError(value: string) {
  return length(value.trim()) < 3 || length(value.trim()) > 120 ? 'Введите от 3 до 120 символов.' : undefined;
}

export function FormLayout({ submit, label, pendingLabel, pending, message, children }: {
  submit: (event: FormEvent<HTMLFormElement>) => void;
  label: string;
  /** Подпись кнопки во время отправки — по действию: «Публикуем…», «Создаём…» */
  pendingLabel: string;
  pending: boolean;
  message?: string;
  children: ReactNode;
}) {
  return (
    <form noValidate onSubmit={submit} className="flex min-h-0 flex-col gap-3">
      <div className="min-h-0 space-y-4 overflow-y-auto px-1 pb-1">
        <fieldset disabled={pending} className="min-w-0 space-y-4">
          {children}
        </fieldset>
        {message && (
          <p role="alert" className="text-sm text-danger-strong">
            {message}
          </p>
        )}
      </div>
      <div className="shrink-0 border-t pt-3 sm:flex sm:justify-end">
        <Button type="submit" className="w-full sm:w-auto" disabled={pending}>
          {pending ? pendingLabel : label}
        </Button>
      </div>
    </form>
  );
}

function TitleField({ title, setTitle, error }: { title: string; setTitle: (text: string) => void; error?: string }) {
  return (
    <div className="grid gap-2">
      <Label htmlFor="publication-title">Заголовок</Label>
      <Input
        id="publication-title"
        value={title}
        required
        aria-invalid={!!error}
        aria-describedby={error ? 'title-count title-error' : 'title-count'}
        onChange={(event) => setTitle(event.target.value)}
      />
      <p id="title-count" className="text-sm text-muted-foreground">
        {length(title)} / 120
      </p>
      <FieldError name="title" message={error} />
    </div>
  );
}

export function AnnouncementForm({ me, done }: { me: Me; done: () => void }) {
  const [type, setType] = useState<AnnouncementType>('announcement');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [important, setImportant] = useState(false);
  const [requiresAck, setRequiresAck] = useState(false);
  const [audience, setAudience] = useState<S['Audience']>({ kind: 'faculty' });
  const [isEvent, setIsEvent] = useState(false);
  const [eventDate, setEventDate] = useState('');
  const [eventTime, setEventTime] = useState('18:00');
  const [place, setPlace] = useState('');
  const { publish } = useStaffActions();
  const errors = useFormErrors();
  const event = type === 'news' && isEvent;

  function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const startsAt = `${eventDate}T${eventTime}:00+03:00`;
    const valid = errors.validate({
      title: titleError(title),
      body: !body.trim() ? 'Введите текст.' : length(body.trim()) > 4000 ? 'Не больше 4000 символов.' : undefined,
      audience: validateAudience(audience, me.role === 'admin'),
      ...(event && {
        event_starts_at: !eventDate || !eventTime ? 'Укажите дату и время.'
          : !(Date.parse(startsAt) > Date.now()) ? 'Мероприятие должно быть в будущем.' : undefined,
        event_place: !place.trim() ? 'Укажите место.' : length(place.trim()) > 120 ? 'Не больше 120 символов.' : undefined,
      }),
    });
    if (publish.isPending || !valid) return;
    const request = {
      type,
      title: title.trim(),
      body: body.trim(),
      important,
      requires_ack: type === 'announcement' && requiresAck,
      audience,
      event_starts_at: event ? startsAt : null,
      event_place: event ? place.trim() : null,
    };
    publish.mutate(request, {
      onSuccess: () => {
        toast.success(event ? 'Мероприятие опубликовано' : type === 'news' ? 'Новость опубликована' : 'Объявление опубликовано');
        done();
      },
      onError: errors.fail,
    });
  }

  return (
    <FormLayout submit={submit} label="Опубликовать" pendingLabel="Публикуем…" pending={publish.isPending} message={errors.message}>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Тип</legend>
        <div className="flex flex-wrap gap-x-4">
          {(['announcement', 'news'] as const).map((value) => (
            <Label key={value} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="publication-type"
                className="size-5 accent-primary"
                checked={type === value}
                {...fieldState('type', errors.fields.type)}
                onChange={() => {
                  setType(value);
                  if (value === 'news') setRequiresAck(false);
                }}
              />
              {announcementTypeLabels[value]}
            </Label>
          ))}
        </div>
        <FieldError name="type" message={errors.fields.type} />
      </fieldset>
      <TitleField title={title} setTitle={setTitle} error={errors.fields.title} />
      <div className="grid gap-2">
        <Label htmlFor="publication-body">Текст</Label>
        <Textarea
          id="publication-body"
          value={body}
          required
          {...fieldState('body', errors.fields.body)}
          onChange={(event) => setBody(event.target.value)}
        />
        <FieldError name="body" message={errors.fields.body} />
      </div>
      <div>
        <Label className="flex min-h-11 w-fit cursor-pointer items-center gap-2">
          <Checkbox
            checked={important}
            {...fieldState('important', errors.fields.important)}
            onCheckedChange={(value) => setImportant(value === true)}
          />
          Важное
        </Label>
        <FieldError name="important" message={errors.fields.important} />
        {type === 'announcement' && (
          <>
            <Label className="flex min-h-11 w-fit cursor-pointer items-center gap-2">
              <Checkbox
                checked={requiresAck}
                {...fieldState('requires_ack', errors.fields.requires_ack)}
                onCheckedChange={(value) => setRequiresAck(value === true)}
              />
              Попросить подтвердить ознакомление
            </Label>
            <FieldError name="requires_ack" message={errors.fields.requires_ack} />
          </>
        )}
        {type === 'news' && (
          <Label className="flex min-h-11 w-fit cursor-pointer items-center gap-2">
            <Checkbox checked={isEvent} onCheckedChange={(value) => setIsEvent(value === true)} />
            Это мероприятие: с датой и местом
          </Label>
        )}
      </div>
      {event && (
        <>
          <DateTimeFields
            id="event"
            legend="Когда, по Москве"
            date={eventDate}
            time={eventTime}
            setDate={setEventDate}
            setTime={setEventTime}
            name="event_starts_at"
            error={errors.fields.event_starts_at}
          />
          <div className="grid gap-2">
            <Label htmlFor="event-place">Место</Label>
            <Input
              id="event-place"
              value={place}
              placeholder="Корпус Г, аудитория 2115"
              {...fieldState('event_place', errors.fields.event_place)}
              onChange={(e) => setPlace(e.target.value)}
            />
            <FieldError name="event_place" message={errors.fields.event_place} />
          </div>
        </>
      )}
      <AudienceField me={me} value={audience} onChange={setAudience} errors={errors.fields} />
    </FormLayout>
  );
}

/** Дата и время по Москве: два поля и общая ошибка. Строку RFC 3339 собирает форма: `${date}T${time}:00+03:00`. */
export function DateTimeFields({ id, legend, date, time, setDate, setTime, name, error }: {
  id: string;
  legend: string;
  date: string;
  time: string;
  setDate: (value: string) => void;
  setTime: (value: string) => void;
  /** Имя поля в ошибках сервера */
  name: string;
  error?: string;
}) {
  return (
    <fieldset className="grid min-w-0 gap-2">
      <legend className="pb-2 font-semibold">{legend}</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${id}-date`}>Дата</Label>
          <Input
            id={`${id}-date`}
            type="date"
            min={toApiDate()}
            required
            value={date}
            {...fieldState(name, error)}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor={`${id}-time`}>Время</Label>
          <Input
            id={`${id}-time`}
            type="time"
            required
            value={time}
            {...fieldState(name, error)}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>
      <FieldError name={name} message={error} />
    </fieldset>
  );
}

function ServiceField({ value, onChange, error }: { value: string; onChange: (value: string) => void; error?: string }) {
  const services = useServiceTypes();
  return (
    <QueryView query={services} isEmpty={(items) => items.length === 0} empty={<EmptyState title="Нет доступных услуг" />}>
      {(items) => (
        <SelectField
          id="deadline-service"
          label="Услуга"
          name="service_type_id"
          value={value}
          onChange={onChange}
          options={[
            { value: noService, label: 'Без связанной услуги' },
            ...items.map((item) => ({ value: item.id, label: item.title })),
          ]}
          error={error}
        />
      )}
    </QueryView>
  );
}

export function DeadlineForm({ me, done }: { me: Me; done: () => void }) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [kind, setKind] = useState<S['DeadlineKind']>('other');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('23:59');
  const [service, setService] = useState(noService);
  const [audience, setAudience] = useState<S['Audience']>({ kind: 'faculty' });
  const { createDeadline } = useStaffActions();
  const errors = useFormErrors();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const due = `${date}T${time}:00+03:00`;
    const future = Date.parse(due) > Date.now();
    const valid = errors.validate({
      title: titleError(title),
      description: length(description.trim()) > 1000 ? 'Не больше 1000 символов.' : undefined,
      due_at: !date || !time ? 'Укажите дату и время.' : !future ? 'Срок должен быть в будущем.' : undefined,
      audience: validateAudience(audience, me.role === 'admin'),
    });
    if (createDeadline.isPending || !valid) return;
    const request = {
      title: title.trim(),
      description: description.trim() || null,
      kind,
      due_at: due,
      service_type_id: kind === 'application' && service !== noService ? service : null,
      audience,
    };
    createDeadline.mutate(request, {
      onSuccess: () => {
        toast.success('Дедлайн создан');
        done();
      },
      onError: errors.fail,
    });
  }

  return (
    <FormLayout
      submit={submit}
      label="Создать дедлайн"
      pendingLabel="Создаём…"
      pending={createDeadline.isPending}
      message={errors.message}
    >
      <TitleField title={title} setTitle={setTitle} error={errors.fields.title} />
      <div className="grid gap-2">
        <Label htmlFor="deadline-description">Описание</Label>
        <Textarea
          id="deadline-description"
          value={description}
          {...fieldState('description', errors.fields.description)}
          onChange={(event) => setDescription(event.target.value)}
        />
        <FieldError name="description" message={errors.fields.description} />
      </div>
      <SelectField
        id="deadline-kind"
        label="Тип"
        name="kind"
        value={kind}
        onChange={(value) => setKind(value as S['DeadlineKind'])}
        options={Object.entries(deadlineKindLabels).map(([value, label]) => ({ value, label }))}
        error={errors.fields.kind}
      />
      <fieldset className="grid min-w-0 gap-2">
        <legend className="pb-2 font-semibold">Срок по Москве</legend>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="deadline-date">Дата</Label>
            <Input
              id="deadline-date"
              type="date"
              min={toApiDate()}
              required
              value={date}
              {...fieldState('due_at', errors.fields.due_at)}
              onChange={(event) => setDate(event.target.value)}
            />
          </div>
          <div className="grid min-w-0 gap-2">
            <Label htmlFor="deadline-time">Время</Label>
            <Input
              id="deadline-time"
              type="time"
              required
              value={time}
              {...fieldState('due_at', errors.fields.due_at)}
              onChange={(event) => setTime(event.target.value)}
            />
          </div>
        </div>
        <FieldError name="due_at" message={errors.fields.due_at} />
      </fieldset>
      {kind === 'application' && <ServiceField value={service} onChange={setService} error={errors.fields.service_type_id} />}
      <AudienceField me={me} value={audience} onChange={setAudience} errors={errors.fields} />
    </FormLayout>
  );
}
