import { useQuery } from '@tanstack/react-query';
import { notificationsApi, unwrap } from '@/api/clients';

/** Счётчики ленты: значок вкладки «Уведомления» в оболочке и главная. После read/ack/read-all — инвалидировать. */
export function useFeedCounters() {
  return useQuery({
    queryKey: ['notifications', 'feed', 'counters'],
    queryFn: () => unwrap(notificationsApi.GET('/me/feed/counters')),
  });
}
