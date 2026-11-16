import { useState } from 'react';
import { Link } from 'react-router';
import { useMe } from '@/features/auth/queries';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDate, formatDateTime, formatTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { AudienceLabel } from './AudienceField';
import { FormDialog } from './FormDialog';
import { AnnouncementForm } from './forms';
import { announcementTypeLabels } from './labels';
import { useAnnouncements } from './queries';

export function StaffAnnouncementsPage() {
  const me = useMe().data;
  const query = useAnnouncements();
  const [open, setOpen] = useState(false);

  return (
    <>
      <PageHeader
        title="Объявления"
        subtitle="Публикуйте новости и проверяйте, кто ознакомился"
        actions={
          me && (
            <FormDialog
              title="Новое объявление"
              description="Напишите текст и выберите, кому он будет виден."
              open={open}
              onOpenChange={setOpen}
            >
              {open && <AnnouncementForm me={me} done={() => setOpen(false)} />}
            </FormDialog>
          )
        }
      />
      <QueryView
        query={query}
        isEmpty={({ pages }) => pages.every(({ items }) => items.length === 0)}
        empty={<EmptyState title="Объявлений пока нет" description="Создайте объявление, чтобы студенты увидели его в своей ленте." />}
      >
        {({ pages }) => (
          <div className="space-y-4">
            <ul className="divide-y rounded-xl border bg-card">
              {pages
                .flatMap(({ items }) => items)
                .map((item) => (
                  <li key={item.id} className="min-w-0 space-y-2 px-4 py-4 wrap-anywhere md:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge tone="neutral">{item.event_starts_at ? 'Мероприятие' : announcementTypeLabels[item.type]}</StatusBadge>
                      {item.important && <StatusBadge tone="warning">Важное</StatusBadge>}
                    </div>
                    <h2 className="font-semibold">{item.title}</h2>
                    {item.event_starts_at && (
                      <p className="text-sm">
                        <time dateTime={item.event_starts_at}>
                          {formatDate(item.event_starts_at)} в {formatTime(item.event_starts_at)}
                        </time>
                        , {item.event_place}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                      <span>
                        <AudienceLabel audience={item.audience} admin={me?.role === 'admin'} />
                      </span>
                      <time dateTime={item.created_at}>{formatDateTime(item.created_at)}</time>
                      <span>Прочитали {item.read_count ?? '—'}</span>
                    </div>
                    {item.requires_ack && (
                      <Button asChild variant="link" className="max-w-full px-0 text-left whitespace-normal">
                        <Link to={`/staff/announcements/${encodeURIComponent(item.id)}`}>
                          Отчёт: ознакомились {item.acked_count ?? '—'}
                        </Link>
                      </Button>
                    )}
                    {item.going_count != null && (
                      <Button asChild variant="link" className="max-w-full px-0 text-left whitespace-normal">
                        <Link to={`/staff/announcements/${encodeURIComponent(item.id)}`}>Отчёт: пойдут {item.going_count}</Link>
                      </Button>
                    )}
                  </li>
                ))}
            </ul>
            {query.isFetchNextPageError && (
              <p role="alert" className="text-sm text-danger-strong">
                {apiErrorMessage(query.error)}
              </p>
            )}
            {query.hasNextPage && (
              <Button variant="outline" disabled={query.isFetching} onClick={() => void query.fetchNextPage()}>
                {query.isFetchingNextPage ? 'Загружаем…' : 'Показать ещё'}
              </Button>
            )}
          </div>
        )}
      </QueryView>
    </>
  );
}
