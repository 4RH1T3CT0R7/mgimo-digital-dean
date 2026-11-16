import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@/api/notifications';
import { notificationsApi, unwrap } from '@/api/clients';

const key = ['notifications', 'admin', 'banners'] as const;

export function useAdminBanners(enabled: boolean) {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => unwrap(notificationsApi.GET('/admin/banners', { signal })),
    enabled,
  });
}

export function useBannerActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const create = useMutation({
    mutationFn: (body: components['schemas']['CreateBannerRequest']) => unwrap(notificationsApi.POST('/admin/banners', { body })),
    onSuccess: refresh,
  });
  const end = useMutation({
    mutationFn: (id: string) =>
      unwrap(notificationsApi.POST('/admin/banners/{banner_id}/end', { params: { path: { banner_id: id } } })),
    onSuccess: refresh,
  });
  return { create, end };
}
