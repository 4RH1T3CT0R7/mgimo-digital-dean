import { useState } from 'react';
import type { components } from '@/api/notifications';
import { useMe } from '@/features/auth/queries';
import { AudienceLabel } from '@/features/staff-announcements/AudienceField';
import { FormDialog } from '@/features/staff-announcements/FormDialog';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge, type Tone } from '@/shared/ui/status-badge';
import { toast } from '@/shared/ui/toast';
import { BannerForm } from './BannerForm';
import { useAdminBanners, useBannerActions } from './queries';

type AdminBanner = components['schemas']['AdminBanner'];

const statusLabels: Record<AdminBanner['status'], string> = {
  scheduled: 'Запланирован',
  active: 'Показывается',
  ended: 'Завершён',
};
const statusTones: Record<AdminBanner['status'], Tone> = { scheduled: 'info', active: 'success', ended: 'neutral' };

function EndBanner({ item }: { item: AdminBanner }) {
  const [open, setOpen] = useState(false);
  const { end } = useBannerActions();

  async function confirm() {
    try {
      await end.mutateAsync(item.id);
      setOpen(false);
      toast.success('Баннер снят');
    } catch {
      // Ошибка остаётся в диалоге, можно повторить.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        end.reset();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={`Снять сейчас: ${item.title}`}>
          Снять сейчас
        </Button>
      </DialogTrigger>
      <DialogContent className="[&>button]:size-11">
        <DialogHeader>
          <DialogTitle>Снять баннер?</DialogTitle>
          <DialogDescription className="wrap-anywhere">«{item.title}» перестанет показываться студентам сразу.</DialogDescription>
        </DialogHeader>
        {end.isError && (
          <p role="alert" className="text-sm text-danger-strong">
            {apiErrorMessage(end.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={end.isPending}>
              Не снимать
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={end.isPending} onClick={() => void confirm()}>
            {end.isPending ? 'Снимаем…' : 'Снять баннер'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AdminBannersPage() {
  const me = useMe().data;
  const admin = me?.role === 'admin';
  const query = useAdminBanners(admin);
  const [open, setOpen] = useState(false);

  if (me && !admin) {
    return <EmptyState title="Раздел доступен только администратору" description="Объявления для студентов публикуются в разделе «Объявления»." />;
  }
  return (
    <>
      <PageHeader
        title="Баннеры"
        subtitle="Короткие объявления на время: обычный — вверху «Сегодня», срочный — полосой на всех страницах студента"
        actions={
          me && (
            <FormDialog title="Новый баннер" description="Текст без оформления, адресат и срок показа." open={open} onOpenChange={setOpen}>
              {open && <BannerForm me={me} done={() => setOpen(false)} />}
            </FormDialog>
          )
        }
      />
      <QueryView
        query={query}
        isEmpty={(items) => items.length === 0}
        empty={<EmptyState title="Баннеров пока нет" description="Создайте баннер, и студенты увидят его в кабинете в указанный срок." />}
      >
        {(items) => (
          <ul className="divide-y rounded-xl border bg-card">
            {items.map((item) => (
              <li key={item.id} className="flex min-w-0 flex-col items-start gap-3 px-4 py-4 sm:flex-row sm:justify-between md:px-5">
                <div className="min-w-0 space-y-2 wrap-anywhere">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge tone={statusTones[item.status]}>{statusLabels[item.status]}</StatusBadge>
                    {item.priority === 'urgent' && <StatusBadge tone="warning">Срочный</StatusBadge>}
                  </div>
                  <h2 className="font-semibold">{item.title}</h2>
                  {item.body && <p className="max-w-prose">{item.body}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <span>
                      С <time dateTime={item.starts_at}>{formatDateTime(item.starts_at)}</time> до{' '}
                      <time dateTime={item.ends_at}>{formatDateTime(item.ends_at)}</time>
                    </span>
                    <span>
                      <AudienceLabel audience={item.audience} admin />
                    </span>
                    {item.priority === 'normal' && <span>Скрыли: {item.dismissed_count}</span>}
                    {item.link_url && <span className="break-all">Ссылка: {item.link_url}</span>}
                  </div>
                </div>
                {item.status !== 'ended' && <EndBanner item={item} />}
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </>
  );
}
