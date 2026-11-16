import { useState, type FormEvent } from 'react';
import type { components } from '@/api/notifications';
import type { Me } from '@/app/session';
import { AudienceField, FieldError } from '@/features/staff-announcements/AudienceField';
import { fieldState, length, useFormErrors, validateAudience } from '@/features/staff-announcements/fields';
import { DateTimeFields, FormLayout } from '@/features/staff-announcements/forms';
import { formatTime, toApiDate } from '@/shared/lib/format';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { useBannerActions } from './queries';

type S = components['schemas'];

const priorities: { value: S['BannerPriority']; label: string; hint: string }[] = [
  { value: 'normal', label: 'Обычный', hint: 'Карточка вверху «Сегодня», студент может её скрыть' },
  { value: 'urgent', label: 'Срочный', hint: 'Полоса под шапкой на всех страницах, скрыть нельзя' },
];

/** Те же правила, что на сервере: раздел кабинета (`/news`) или https-адрес без логина в адресе. */
function linkError(value: string) {
  if (/^\/[a-z0-9][a-z0-9/_-]*$/.test(value)) return undefined;
  try {
    const url = new URL(value);
    if (value.startsWith('https://') && url.hostname && !url.username && !url.password) return undefined;
  } catch {
    // ниже — общий текст ошибки
  }
  return 'Укажите адрес https://… или раздел кабинета, например /news.';
}

function Counter({ id, value, max }: { id: string; value: string; max: number }) {
  return (
    <p id={id} className="text-sm text-muted-foreground">
      {length(value)} / {max}
    </p>
  );
}

export function BannerForm({ me, done }: { me: Me; done: () => void }) {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState<S['BannerPriority']>('normal');
  const [link, setLink] = useState('');
  const [label, setLabel] = useState('');
  const [audience, setAudience] = useState<S['Audience']>({ kind: 'all' });
  const [startDate, setStartDate] = useState(toApiDate());
  const [startTime, setStartTime] = useState(formatTime(new Date()));
  const [endDate, setEndDate] = useState('');
  const [endTime, setEndTime] = useState('23:59');
  const { create } = useBannerActions();
  const errors = useFormErrors();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = `${startDate}T${startTime}:00+03:00`;
    const endsAt = `${endDate}T${endTime}:00+03:00`;
    const valid = errors.validate({
      title: length(title.trim()) < 3 || length(title.trim()) > 80 ? 'Введите от 3 до 80 символов.' : undefined,
      body: length(body.trim()) > 200 ? 'Не больше 200 символов.' : undefined,
      link_url: link.trim() ? linkError(link.trim()) : label.trim() ? 'Укажите ссылку или уберите подпись.' : undefined,
      link_label: link.trim() && !label.trim() ? 'Укажите подпись ссылки.' : length(label.trim()) > 30 ? 'Не больше 30 символов.' : undefined,
      starts_at: !startDate || !startTime ? 'Укажите дату и время начала.' : undefined,
      ends_at: !endDate || !endTime ? 'Укажите дату и время окончания.'
        : !(Date.parse(endsAt) > Date.parse(startsAt)) ? 'Окончание должно быть позже начала.'
          : !(Date.parse(endsAt) > Date.now()) ? 'Окончание должно быть в будущем.' : undefined,
      audience: validateAudience(audience, true),
    });
    if (create.isPending || !valid) return;
    create.mutate({
      title: title.trim(),
      body: body.trim() || null,
      priority,
      link_url: link.trim() || null,
      link_label: label.trim() || null,
      audience,
      starts_at: startsAt,
      ends_at: endsAt,
    }, {
      onSuccess: () => {
        toast.success('Баннер создан');
        done();
      },
      onError: errors.fail,
    });
  }

  return (
    <FormLayout submit={submit} label="Создать баннер" pendingLabel="Создаём…" pending={create.isPending} message={errors.message}>
      <div className="grid gap-2">
        <Label htmlFor="banner-title">Заголовок</Label>
        <Input
          id="banner-title"
          value={title}
          required
          aria-invalid={!!errors.fields.title}
          aria-describedby={errors.fields.title ? 'banner-title-count title-error' : 'banner-title-count'}
          onChange={(e) => setTitle(e.target.value)}
        />
        <Counter id="banner-title-count" value={title} max={80} />
        <FieldError name="title" message={errors.fields.title} />
      </div>
      <div className="grid gap-2">
        <Label htmlFor="banner-body">Текст — необязательно</Label>
        <Textarea
          id="banner-body"
          value={body}
          aria-invalid={!!errors.fields.body}
          aria-describedby={errors.fields.body ? 'banner-body-count body-error' : 'banner-body-count'}
          onChange={(e) => setBody(e.target.value)}
        />
        <Counter id="banner-body-count" value={body} max={200} />
        <FieldError name="body" message={errors.fields.body} />
      </div>
      <fieldset className="min-w-0">
        <legend className="mb-1 font-semibold">Важность</legend>
        {priorities.map((item) => (
          <Label key={item.value} className="flex min-h-11 cursor-pointer items-start gap-3 py-2">
            <input
              type="radio"
              name="banner-priority"
              className="mt-0.5 size-5 shrink-0 accent-primary"
              checked={priority === item.value}
              {...fieldState('priority', errors.fields.priority)}
              onChange={() => setPriority(item.value)}
            />
            <span className="grid gap-0.5">
              <span>{item.label}</span>
              <span className="text-sm font-normal text-muted-foreground">{item.hint}</span>
            </span>
          </Label>
        ))}
        <FieldError name="priority" message={errors.fields.priority} />
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_12rem]">
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="banner-link">Ссылка — необязательно</Label>
          <Input
            id="banner-link"
            value={link}
            inputMode="url"
            placeholder="/news или https://…"
            {...fieldState('link_url', errors.fields.link_url)}
            onChange={(e) => setLink(e.target.value)}
          />
          <FieldError name="link_url" message={errors.fields.link_url} />
        </div>
        <div className="grid min-w-0 gap-2">
          <Label htmlFor="banner-link-label">Подпись ссылки</Label>
          <Input
            id="banner-link-label"
            value={label}
            placeholder="Подробнее"
            {...fieldState('link_label', errors.fields.link_label)}
            onChange={(e) => setLabel(e.target.value)}
          />
          <FieldError name="link_label" message={errors.fields.link_label} />
        </div>
      </div>
      <AudienceField me={me} value={audience} onChange={setAudience} errors={errors.fields} />
      <DateTimeFields
        id="banner-start"
        legend="Начало показа, по Москве"
        date={startDate}
        time={startTime}
        setDate={setStartDate}
        setTime={setStartTime}
        name="starts_at"
        error={errors.fields.starts_at}
      />
      <DateTimeFields
        id="banner-end"
        legend="Окончание показа"
        date={endDate}
        time={endTime}
        setDate={setEndDate}
        setTime={setEndTime}
        name="ends_at"
        error={errors.fields.ends_at}
      />
    </FormLayout>
  );
}
