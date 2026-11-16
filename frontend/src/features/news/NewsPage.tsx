import { CalendarIcon, CalendarPlusIcon, CheckIcon, MapPinIcon } from 'lucide-react';
import { useState } from 'react';
import type { components } from '@/api/notifications';
import { useClock } from '@/features/today/clock';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDate, formatTime, plural } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { downloadIcs } from './ics';
import { useGoing, useNews } from './queries';

type FeedItem = components['schemas']['FeedItem'];
type Filter = 'all' | 'news' | 'events';

const filters: { value: Filter; label: string; empty: string }[] = [
  { value: 'all', label: 'Все', empty: 'Новостей и мероприятий пока нет' },
  { value: 'news', label: 'Новости', empty: 'Новостей пока нет' },
  { value: 'events', label: 'Мероприятия', empty: 'Мероприятий пока нет' },
];

const isPast = (item: FeedItem, now: number) => !!item.event && Date.parse(item.event.starts_at) <= now;

/** Мероприятия: ближайшие сверху, прошедшие — в конце, от недавних к давним. */
function byEventDate(now: number) {
  return (a: FeedItem, b: FeedItem) => {
    const pastA = isPast(a, now);
    const pastB = isPast(b, now);
    if (pastA !== pastB) return pastA ? 1 : -1;
    const diff = Date.parse(a.event!.starts_at) - Date.parse(b.event!.starts_at);
    return pastA ? -diff : diff;
  };
}

function goingText(count: number, past: boolean) {
  const people = `${count} ${plural(count, ['человек', 'человека', 'человек'])}`;
  if (past) return count > 0 ? `${plural(count, ['Собирался', 'Собирались', 'Собирались'])} ${people}` : null;
  return count > 0 ? `${plural(count, ['Пойдёт', 'Пойдут', 'Пойдут'])} ${people}` : 'Пока никто не отметился';
}

function EventActions({ item, event }: { item: FeedItem; event: NonNullable<FeedItem['event']> }) {
  const going = useGoing();
  return (
    <>
      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Переключатель: повторное нажатие отменяет; ширина постоянная, соседние кнопки не прыгают */}
        <Button
          variant={event.going ? 'secondary' : 'outline'}
          aria-pressed={event.going}
          disabled={going.isPending}
          className="w-36"
          onClick={() => going.mutate({ id: item.id, going: !event.going })}
        >
          {event.going && <CheckIcon className="size-5 text-success-strong" aria-hidden />}
          {event.going ? 'Вы идёте' : 'Пойду'}
        </Button>
        <Button
          variant="outline"
          onClick={() => downloadIcs({ id: item.id, title: item.title, body: item.body, starts_at: event.starts_at, place: event.place })}
        >
          <CalendarPlusIcon className="size-5" aria-hidden />
          В календарь
        </Button>
        <span className="text-sm text-muted-foreground">{goingText(event.going_count, false)}</span>
      </div>
      {going.isError && (
        <p role="alert" className="mt-2 text-sm text-danger-strong">
          {apiErrorMessage(going.error)}
        </p>
      )}
    </>
  );
}

function NewsCard({ item, now }: { item: FeedItem; now: number }) {
  const [expanded, setExpanded] = useState(false);
  const event = item.event;
  const past = isPast(item, now);
  const long = item.body.length > 320;

  return (
    <li className="min-w-0 px-4 py-4 wrap-anywhere md:px-5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.8125rem] text-muted-foreground">
        {item.author_label && <span>{item.author_label}</span>}
        <time dateTime={item.created_at}>{formatDate(item.created_at)}</time>
      </div>
      <h2 className="mt-1 font-semibold">{item.title}</h2>
      {event && (
        <dl className="mt-2 flex flex-col gap-1 text-sm sm:flex-row sm:flex-wrap sm:gap-x-5">
          <div className="flex items-center gap-2">
            <dt className="sr-only">Когда</dt>
            <CalendarIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd>
              <time dateTime={event.starts_at}>
                {formatDate(event.starts_at)} в {formatTime(event.starts_at)}
              </time>
            </dd>
            {past && <StatusBadge tone="neutral">Прошло</StatusBadge>}
          </div>
          <div className="flex items-center gap-2">
            <dt className="sr-only">Где</dt>
            <MapPinIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <dd>{event.place}</dd>
          </div>
        </dl>
      )}
      <p className={cn('mt-2 max-w-prose whitespace-pre-wrap text-muted-foreground', long && !expanded && 'line-clamp-4')}>{item.body}</p>
      {long && (
        <Button variant="link" className="h-11 px-0" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? 'Свернуть' : 'Читать полностью'}
        </Button>
      )}
      {event && !past && <EventActions item={item} event={event} />}
      {event && past && goingText(event.going_count, true) && (
        <p className="mt-2 text-sm text-muted-foreground">{goingText(event.going_count, true)}</p>
      )}
    </li>
  );
}

export function NewsPage() {
  const [filter, setFilter] = useState<Filter>('all');
  const query = useNews();
  const now = useClock();
  const current = filters.find(({ value }) => value === filter)!;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <PageHeader title="Новости и мероприятия" subtitle="Новости деканата и мероприятия, на которые можно прийти" />
      <div role="group" aria-label="Что показать" className="flex flex-wrap gap-2">
        {filters.map(({ value, label }) => (
          <Button
            key={value}
            className="rounded-full px-4"
            aria-pressed={filter === value}
            variant={filter === value ? 'secondary' : 'outline'}
            onClick={() => setFilter(value)}
          >
            {label}
          </Button>
        ))}
      </div>
      <QueryView query={query}>
        {({ pages }) => {
          const all = [...new Map(pages.flatMap((p) => p.items).map((item) => [item.id, item])).values()];
          const items = filter === 'news' ? all.filter((item) => !item.event)
            : filter === 'events' ? all.filter((item) => item.event).sort(byEventDate(now))
              : all;
          return (
            <>
              {items.length > 0 ? (
                <ul className="divide-y rounded-xl border bg-card">
                  {items.map((item) => (
                    <NewsCard key={item.id} item={item} now={now} />
                  ))}
                </ul>
              ) : (
                <EmptyState
                  title={current.empty}
                  description={query.hasNextPage ? 'Можно проверить следующую страницу.' : 'Здесь появятся новости деканата и мероприятия вуза.'}
                />
              )}
              {query.isFetchNextPageError && (
                <p role="alert" className="text-sm text-danger-strong">
                  {apiErrorMessage(query.error)}
                </p>
              )}
              {query.hasNextPage && (
                <Button variant="outline" className="self-start" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
                  {query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
                </Button>
              )}
            </>
          );
        }}
      </QueryView>
    </div>
  );
}
