import { InboxIcon } from 'lucide-react';
import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
  illustration,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  /** Картинка из public/illustrations (T17); по умолчанию — значок */
  illustration?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/60 px-5 py-10 text-center">
      {illustration ?? (
        <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
          <InboxIcon className="size-6" />
        </div>
      )}
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}
