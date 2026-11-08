import { CircleAlertIcon, RotateCwIcon } from 'lucide-react';
import { apiErrorMessage } from '@/shared/lib/errors';
import { Button } from './button';

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-xl border border-danger-strong/20 bg-danger-soft px-5 py-8 text-center">
      <CircleAlertIcon className="size-7 text-danger-strong" aria-hidden />
      <div className="flex max-w-sm flex-col gap-1">
        <p className="font-medium">Не удалось загрузить данные</p>
        <p className="text-sm text-muted-foreground">{apiErrorMessage(error)}</p>
      </div>
      {onRetry && (
        <Button variant="outline" onClick={onRetry}>
          <RotateCwIcon aria-hidden />
          Повторить
        </Button>
      )}
    </div>
  );
}
