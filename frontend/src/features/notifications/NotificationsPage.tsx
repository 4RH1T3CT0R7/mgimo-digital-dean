import { BellIcon, CalendarDaysIcon, ChevronDownIcon, FileTextIcon, MegaphoneIcon, NewspaperIcon } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import type { components } from '@/api/notifications';
import { ApiError, apiErrorMessage } from '@/shared/lib/errors';
import { formatDate, formatDateTime, formatTime, plural, toApiDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import { EmptyState } from '@/shared/ui/empty-state';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { useDeadlines, useFeed, useFeedActions, useFeedCounters } from './queries';

type FeedItem = components['schemas']['FeedItem'];
type FeedType = components['schemas']['FeedItemType'];

const filters: { label: string; types?: FeedType[] }[] = [
  { label: 'Все' },
  { label: 'Важное' },
  { label: 'Объявления', types: ['announcement', 'news'] },
  { label: 'Расписание', types: ['schedule_change'] },
  { label: 'Заявки', types: ['application_status', 'application_message'] },
];

const typeInfo = {
  news: ['Новость', NewspaperIcon],
  announcement: ['Объявление', MegaphoneIcon],
  schedule_change: ['Расписание', CalendarDaysIcon],
  application_status: ['Статус заявки', FileTextIcon],
  application_message: ['Ответ по заявке', FileTextIcon],
} as const;

function relativeTime(value: string) {
  const day = toApiDate(value);
  const today = toApiDate();
  const yesterday = new Date(Date.parse(today) - 86_400_000).toISOString().slice(0, 10);
  if (day === today) return `сегодня в ${formatTime(value)}`;
  if (day === yesterday) return 'вчера';
  return formatDate(value);
}

function deadlineLabel(days: number) {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}

function Deadlines() {
  const query = useDeadlines();
  const [expanded, setExpanded] = useState(true);
  return (
    <section aria-labelledby="notification-deadlines" className="min-w-0">
      <h2 id="notification-deadlines" className="mb-2 text-lg font-semibold">
        <span className="hidden sm:inline">Дедлайны</span>
        <Button variant="ghost" className="w-full justify-between px-0 text-lg font-semibold sm:hidden"
          aria-controls="notification-deadline-list" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          Дедлайны <ChevronDownIcon aria-hidden className={cn(expanded && 'rotate-180')} />
        </Button>
      </h2>
      <div id="notification-deadline-list" className={cn(!expanded && 'hidden sm:block')}>
        <QueryView query={query} isEmpty={(items) => items.length === 0}
          empty={<EmptyState title="Предстоящих дедлайнов нет" description="Здесь появятся сроки на ближайшие две недели." />}>
          {(items) => (
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((item) => (
                <li key={item.id} className="flex flex-col items-start gap-2 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 space-y-1 wrap-anywhere">
                    <h3 className="font-medium">{item.title}</h3>
                    {item.description && <p className="whitespace-pre-wrap text-sm text-muted-foreground">{item.description}</p>}
                    <div className="flex flex-wrap items-center gap-2 text-sm">
                      <time dateTime={item.due_at}>до {formatDateTime(item.due_at)}</time>
                      <StatusBadge tone={item.days_left <= 1 ? 'danger' : 'neutral'}>{deadlineLabel(item.days_left)}</StatusBadge>
                    </div>
                  </div>
                  {item.kind === 'application' && item.service_type_id && (
                    <Button asChild variant="outline"><Link to={`/requests/new/${encodeURIComponent(item.service_type_id)}`}>Подать заявку</Link></Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </QueryView>
      </div>
    </section>
  );
}

function FeedCard({ item }: { item: FeedItem }) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const { read, ack } = useFeedActions();
  const [label, Icon] = typeInfo[item.type];
  const href = item.link.kind === 'application' && item.link.id
    ? `/requests/${encodeURIComponent(item.link.id)}`
    : item.link.kind === 'lesson' && item.link.date ? `/schedule?date=${encodeURIComponent(item.link.date)}` : null;
  const ackDate = item.acked_at ? toApiDate(item.acked_at).slice(5).split('-').reverse().join('.') : null;

  async function activate() {
    if (!href) setExpanded(!expanded);
    try {
      if (!item.read_at) await read.mutateAsync(item.id);
      if (href) navigate(href);
    } catch {
      // Ошибка остаётся в состоянии мутации и показывается в карточке.
    }
  }

  return (
    <li className={cn('min-w-0 px-4 py-3', item.important && 'border-l-4 border-l-warning-strong')}>
      <button type="button" className="flex min-h-11 w-full min-w-0 items-start gap-3 rounded-md py-2 text-left focus-visible:ring-2 focus-visible:ring-ring"
        aria-expanded={href ? undefined : expanded} aria-controls={href ? undefined : `feed-body-${item.id}`}
        aria-busy={read.isPending} onClick={() => { if (!read.isPending) void activate(); }}>
        <Icon aria-hidden className="mt-0.5 size-5 shrink-0 text-muted-foreground" />
        <span className="min-w-0 flex-1 space-y-1 wrap-anywhere">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
            <span>{label}</span>
            {item.author_label && <span>· {item.author_label}</span>}
            <time dateTime={item.created_at}>· {relativeTime(item.created_at)}</time>
            {!item.read_at && <span className="inline-flex items-center gap-1"><span aria-hidden className="size-2 rounded-full bg-primary" /><span className="sr-only">Не прочитано</span></span>}
          </span>
          <span className="block font-medium">{item.title}</span>
          {!expanded && <span className={cn('block whitespace-pre-wrap text-sm text-muted-foreground', !href && 'line-clamp-2')}>{item.body}</span>}
        </span>
        {!href && <ChevronDownIcon aria-hidden className={cn('mt-1 size-4 shrink-0', expanded && 'rotate-180')} />}
      </button>
      {expanded && <p id={`feed-body-${item.id}`} className="ml-8 whitespace-pre-wrap wrap-anywhere">{item.body}</p>}
      <div className="ml-8 flex flex-wrap items-center gap-2">
        {item.important && <StatusBadge tone="warning">Важное</StatusBadge>}
        {item.requires_ack && !item.acked_at && <StatusBadge tone="neutral">Требует ознакомления</StatusBadge>}
        {item.requires_ack && (item.acked_at ? (
          <p className="text-sm text-muted-foreground">Вы ознакомились {ackDate} в {formatTime(item.acked_at)}</p>
        ) : <Button variant="outline" disabled={ack.isPending} onClick={() => ack.mutate(item.id)}>Ознакомлен(а)</Button>)}
      </div>
      {read.isError && <p role="alert" className="ml-8 mt-2 text-sm text-danger-strong">{apiErrorMessage(read.error)}</p>}
      {ack.isError && <p role="alert" className="ml-8 mt-2 text-sm text-danger-strong">
        {ack.error instanceof ApiError && ack.error.status === 409
          ? 'Не удалось подтвердить ознакомление. Проверьте, что объявление ещё требует подтверждения, и повторите попытку.'
          : apiErrorMessage(ack.error)}
      </p>}
    </li>
  );
}

export function NotificationsPage() {
  const [filter, setFilter] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useFeed(filters[filter].types, unreadOnly);
  const counters = useFeedCounters();
  const { readAll } = useFeedActions();
  const importantOnly = filter === 1;
  const visible = (items: FeedItem[]) => importantOnly ? items.filter((item) => item.important) : items;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader title="Уведомления и дедлайны" />
      <Deadlines />
      <section aria-labelledby="notification-feed" className="min-w-0 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="notification-feed" className="text-lg font-semibold"><BellIcon aria-hidden className="mr-2 inline size-5" />Лента</h2>
          <Button variant="outline" disabled={readAll.isPending || counters.data?.unread === 0}
            onClick={() => readAll.mutate()}>Прочитать всё</Button>
        </div>
        {readAll.isError && <p role="alert" className="text-sm text-danger-strong">{apiErrorMessage(readAll.error)}</p>}
        <div role="group" aria-label="Тип уведомлений" className="flex flex-wrap gap-2">
          {filters.map(({ label }, index) => <Button key={label} className="rounded-full px-3"
            aria-pressed={filter === index} variant={filter === index ? 'secondary' : 'outline'} onClick={() => setFilter(index)}>{label}</Button>)}
        </div>
        <Label className="flex min-h-11 w-fit cursor-pointer items-center gap-2">
          <Checkbox checked={unreadOnly} onCheckedChange={(checked) => setUnreadOnly(checked === true)} />Только непрочитанные
        </Label>
        <QueryView query={query}>
          {({ pages }) => {
            const items = [...new Map(visible(pages.flatMap((p) => p.items)).map((item) => [item.id, item])).values()];
            return (
              <>
                {items.length > 0 ? <ul className="divide-y rounded-xl border bg-card">{items.map((item) => <FeedCard key={item.id} item={item} />)}</ul>
                  : <EmptyState title="Новых уведомлений нет" description={query.hasNextPage ? 'Можно проверить следующую страницу ленты.' : 'Здесь появятся объявления и изменения по вашим занятиям и заявкам.'} />}
                {query.isFetchNextPageError && <p role="alert" className="text-sm text-danger-strong">{apiErrorMessage(query.error)}</p>}
                {query.hasNextPage && <Button variant="outline" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
                  {query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
                </Button>}
              </>
            );
          }}
        </QueryView>
      </section>
    </div>
  );
}
