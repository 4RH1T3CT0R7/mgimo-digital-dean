import { ChevronDownIcon } from 'lucide-react';
import { formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { statusLabel } from '../labels';
import type { Application } from '../queries';

const WHO = {
  student: { student: 'Вы', staff: 'Деканат', system: 'Автоматически' },
  staff: { student: 'Студент', staff: 'Деканат', system: 'Автоматически' },
} as const;

/**
 * История смен статуса — у студента и у сотрудника одинаковая. Свёрнута: даты шагов уже есть на шкале,
 * здесь — кто менял и комментарии; если комментарии есть, история открыта сразу.
 */
export function StatusHistory({ application: a, viewer }: { application: Pick<Application, 'status_history' | 'service_type'>; viewer: 'student' | 'staff' }) {
  const withComments = a.status_history.some((h) => h.comment);
  return (
    <details open={withComments} className="group min-w-0 rounded-xl border bg-card">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-5 py-4 text-lg font-semibold outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 md:px-6 [&::-webkit-details-marker]:hidden">
        История
        <ChevronDownIcon className="size-5 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="mx-5 mb-5 flex flex-col gap-4 border-l-2 pl-5 md:mx-6">
        {a.status_history.map((h, i) => (
          <li key={`${h.status}-${h.at}`} className="relative">
            <span
              className={cn('absolute top-1.5 -left-[1.6875rem] size-3 rounded-full ring-4 ring-card', i === a.status_history.length - 1 ? 'bg-primary' : 'bg-muted-foreground/50')}
              aria-hidden
            />
            <p className="font-medium">{statusLabel(h.status, a.service_type.kind)}</p>
            <p className="text-sm text-muted-foreground">
              {WHO[viewer][h.by_role]}, <time dateTime={h.at}>{formatDateTime(h.at)}</time>
            </p>
            {h.comment && <p className="mt-1 text-sm break-words whitespace-pre-wrap">{h.comment}</p>}
          </li>
        ))}
      </ol>
    </details>
  );
}
