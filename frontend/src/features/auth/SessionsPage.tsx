import { LoaderCircleIcon, LogOutIcon, MonitorIcon, SmartphoneIcon } from 'lucide-react';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDateTime } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { toast } from '@/shared/ui/toast';
import { useEndOtherSessions, useSessions } from './queries';

const isPhone = (device: string) => /iPhone|iPad|Android/.test(device);

/** Безопасность: где выполнен вход, «выйти на всех других устройствах». */
export function SessionsPage() {
  const sessions = useSessions();
  const endOthers = useEndOtherSessions();

  return (
    <>
      <PageHeader title="Безопасность" subtitle="Где вы вошли в кабинет" />
      <QueryView query={sessions}>
        {({ items }) => {
          const others = items.filter((s) => !s.current).length;
          return (
            <div className="flex max-w-2xl flex-col gap-4">
              <ul className="flex flex-col divide-y rounded-xl border bg-card" aria-label="Сеансы">
                {items.map((s) => {
                  const Icon = isPhone(s.device) ? SmartphoneIcon : MonitorIcon;
                  return (
                    <li key={s.created_at + s.device} className="flex items-start gap-3 p-4">
                      <Icon className="mt-0.5 size-5 shrink-0 text-muted-foreground" aria-hidden />
                      <div className="flex min-w-0 flex-col gap-0.5">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-medium">
                          {s.device}
                          {s.current && <StatusBadge tone="success">Это устройство</StatusBadge>}
                        </p>
                        <p className="text-sm text-muted-foreground">
                          Вход {formatDateTime(s.created_at)}
                          {!s.current && <span className="block">Последняя активность {formatDateTime(s.last_seen_at)}</span>}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
              {others > 0 ? (
                <Button
                  variant="outline"
                  className="sm:self-start"
                  disabled={endOthers.isPending}
                  onClick={() =>
                    endOthers.mutate(undefined, {
                      onSuccess: ({ ended }) => toast.success(ended > 0 ? 'Вы вышли на других устройствах' : 'Других сеансов уже нет'),
                      onError: (err) => toast.error(apiErrorMessage(err)),
                    })
                  }
                >
                  {endOthers.isPending ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <LogOutIcon aria-hidden />}
                  Выйти на всех других устройствах
                </Button>
              ) : (
                <p className="text-sm">Вы вошли только на этом устройстве.</p>
              )}
              <p className="text-sm text-muted-foreground">
                Сеанс действует 24 часа. Об устройстве мы храним только браузер и систему — без IP-адреса. Не узнаёте устройство — выйдите на всех других.
              </p>
            </div>
          );
        }}
      </QueryView>
    </>
  );
}
