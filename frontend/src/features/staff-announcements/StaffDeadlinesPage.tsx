import { useState } from 'react';
import type { components } from '@/api/notifications';
import { useMe } from '@/features/auth/queries';
import { useServiceTypes } from '@/features/requests/queries';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDate, formatTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { toast } from '@/shared/ui/toast';
import { AudienceLabel } from './AudienceField';
import { FormDialog } from './FormDialog';
import { DeadlineForm, DeadlineKindLabel } from './forms';
import { useStaffActions, useStaffDeadlines } from './queries';

type StaffDeadline = components['schemas']['StaffDeadline'];

function DeleteDeadline({ item }: { item: StaffDeadline }) {
  const [open, setOpen] = useState(false);
  const { deleteDeadline } = useStaffActions();

  return (
    <Dialog open={open} onOpenChange={(value) => { deleteDeadline.reset(); setOpen(value); }}>
      <DialogTrigger asChild><Button variant="outline" aria-label={`Удалить: ${item.title}`}>Удалить</Button></DialogTrigger>
      <DialogContent className="[&>button]:size-11">
        <DialogHeader>
          <DialogTitle>Удалить дедлайн?</DialogTitle>
          <DialogDescription className="wrap-anywhere">«{item.title}» исчезнет у студентов, которым он адресован.</DialogDescription>
        </DialogHeader>
        {deleteDeadline.isError && <p role="alert" className="text-sm text-danger-strong">{apiErrorMessage(deleteDeadline.error)}</p>}
        <DialogFooter>
          <DialogClose asChild><Button variant="outline" disabled={deleteDeadline.isPending}>Отмена</Button></DialogClose>
          <Button variant="destructive" disabled={deleteDeadline.isPending}
            onClick={async () => {
              try {
                await deleteDeadline.mutateAsync(item.id);
                setOpen(false);
                toast.success('Дедлайн удалён');
              } catch {
                // Ошибка остаётся в диалоге, пользователь может повторить запрос.
              }
            }}>
            {deleteDeadline.isPending ? 'Удаляем…' : 'Удалить дедлайн'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ServiceLabel({ id }: { id: string }) {
  const query = useServiceTypes();
  const service = query.data?.find((item) => item.id === id);
  return service ? <span>Услуга · {service.title}</span> : null;
}

export function StaffDeadlinesPage() {
  const me = useMe().data;
  const query = useStaffDeadlines();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader title="Дедлайны" subtitle="Сроки для студентов по датам"
        actions={me && <FormDialog title="Новый дедлайн" description="Укажите срок по московскому времени и выберите адресатов." open={open} onOpenChange={setOpen}>
          {open && <DeadlineForm me={me} done={() => setOpen(false)} />}
        </FormDialog>} />
      <QueryView query={query} isEmpty={(items) => items.length === 0}
        empty={<EmptyState title="Дедлайнов пока нет" description="Добавьте срок, чтобы студенты увидели его в списке дедлайнов." />}>
        {(items) => (
          <ul className="divide-y rounded-xl border bg-card">
            {[...items].sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at)).map((item) => (
              <li key={item.id} className="flex min-w-0 flex-col items-start gap-2 p-4 sm:flex-row sm:justify-between">
                <div className="min-w-0 space-y-2 wrap-anywhere">
                  <StatusBadge tone="neutral"><DeadlineKindLabel kind={item.kind} /></StatusBadge>
                  <h2 className="font-semibold">{item.title}</h2>
                  {item.description && <p className="whitespace-pre-wrap">{item.description}</p>}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
                    <time dateTime={item.due_at}>{formatDate(item.due_at, { withYear: true })} в {formatTime(item.due_at)}</time>
                    <span><AudienceLabel audience={item.audience} admin={me?.role === 'admin'} /></span>
                    {item.service_type_id && <ServiceLabel id={item.service_type_id} />}
                  </div>
                </div>
                <DeleteDeadline item={item} />
              </li>
            ))}
          </ul>
        )}
      </QueryView>
    </>
  );
}
