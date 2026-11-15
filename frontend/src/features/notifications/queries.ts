import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, unwrap } from '@/api/clients';
import type { components } from '@/api/notifications';

type FeedType = components['schemas']['FeedItemType'];

/** Счётчики ленты: значок вкладки «Уведомления» в оболочке и главная. После read/ack/read-all — инвалидировать. */
export function useFeedCounters() {
  return useQuery({
    queryKey: ['notifications', 'feed', 'counters'],
    queryFn: () => unwrap(notificationsApi.GET('/me/feed/counters')),
  });
}

export const feedLimit = 20;

export function useFeed(types: FeedType[] | undefined, unreadOnly: boolean) {
  return useInfiniteQuery({
    queryKey: ['notifications', 'feed', 'items', { types, unreadOnly }],
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => unwrap(notificationsApi.GET('/me/feed', {
      params: { query: { type: types, unread_only: unreadOnly || undefined, limit: feedLimit, offset: pageParam } },
      querySerializer: { array: { style: 'form', explode: false } },
      signal,
    })),
    getNextPageParam: (last, _pages, offset) =>
      last.items.length > 0 && offset + last.items.length < last.total ? offset + last.items.length : undefined,
  });
}

export function useDeadlines() {
  return useQuery({
    queryKey: ['notifications', 'deadlines', 14],
    queryFn: ({ signal }) =>
      unwrap(notificationsApi.GET('/me/deadlines', { params: { query: { days: 14 } }, signal })),
  });
}

export function useFeedActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: ['notifications', 'feed'] });
  // Прочтение идёт в фоне: лента обновляется, но мутация её не ждёт.
  const read = useMutation({
    mutationFn: (id: string) =>
      unwrap(notificationsApi.POST('/me/feed/{item_id}/read', { params: { path: { item_id: id } } })),
    onSuccess: () => void refresh(),
  });
  // Кнопка «Ознакомлен(а)» заблокирована, пока лента не покажет подтверждение.
  const ack = useMutation({
    mutationFn: (id: string) =>
      unwrap(notificationsApi.POST('/me/feed/{item_id}/ack', { params: { path: { item_id: id } } })),
    onSuccess: refresh,
  });
  const readAll = useMutation({
    mutationFn: () => unwrap(notificationsApi.POST('/me/feed/read-all')),
    onSuccess: refresh,
  });
  return { read, ack, readAll };
}
