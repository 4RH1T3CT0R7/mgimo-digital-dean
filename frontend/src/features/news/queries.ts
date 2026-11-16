import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, unwrap } from '@/api/clients';

// Под ['notifications', 'feed']: публикация сотрудника и общие инвалидации ленты обновляют и новости.
const key = ['notifications', 'feed', 'news'] as const;

export function useNews() {
  return useInfiniteQuery({
    queryKey: key,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => unwrap(notificationsApi.GET('/me/feed', {
      params: { query: { type: ['news'], limit: 20, offset: pageParam } },
      querySerializer: { array: { style: 'form', explode: false } },
      signal,
    })),
    getNextPageParam: (last, _pages, offset) =>
      last.items.length > 0 && offset + last.items.length < last.total ? offset + last.items.length : undefined,
  });
}

/** «Пойду» (true) или отмена (false). */
export function useGoing() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ id, going }: { id: string; going: boolean }) => {
      const params = { params: { path: { item_id: id } } };
      return unwrap(going
        ? notificationsApi.POST('/me/feed/{item_id}/going', params)
        : notificationsApi.DELETE('/me/feed/{item_id}/going', params));
    },
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
