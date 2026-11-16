import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { notificationsApi, unwrap } from '@/api/clients';

const key = ['notifications', 'banners'] as const;

/** Баннеры администратора: один запрос на полосу срочных в оболочке и карточки на «Сегодня». */
export function useMyBanners() {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => unwrap(notificationsApi.GET('/me/banners', { signal })),
  });
}

export function useDismissBanner() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      unwrap(notificationsApi.POST('/me/banners/{banner_id}/dismiss', { params: { path: { banner_id: id } } })),
    onSuccess: () => client.invalidateQueries({ queryKey: key }),
  });
}
