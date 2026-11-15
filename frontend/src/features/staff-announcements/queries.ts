import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import type { components } from '@/api/notifications';
import { academicApi, notificationsApi, unwrap } from '@/api/clients';

type S = components['schemas'];
const announcementsKey = ['notifications', 'staff', 'announcements'] as const;
const deadlinesKey = ['notifications', 'staff', 'deadlines'] as const;
const limit = 20;

function announcementPage(offset: number, signal: AbortSignal) {
  return unwrap(notificationsApi.GET('/staff/announcements', { params: { query: { limit, offset } }, signal }));
}

export function useAnnouncements() {
  return useInfiniteQuery({
    queryKey: announcementsKey,
    initialPageParam: 0,
    queryFn: ({ pageParam, signal }) => announcementPage(pageParam, signal),
    getNextPageParam: (last, _pages, offset) =>
      last.items.length > 0 && offset + last.items.length < last.total ? offset + last.items.length : undefined,
  });
}

export function useAnnouncement(id: string) {
  const client = useQueryClient();
  return useQuery({
    queryKey: [...announcementsKey, id],
    initialData: () => client.getQueryData<InfiniteData<S['StaffAnnouncementList']>>(announcementsKey)
      ?.pages.flatMap(({ items }) => items).find((item) => item.id === id),
    initialDataUpdatedAt: () => client.getQueryState(announcementsKey)?.dataUpdatedAt,
    queryFn: async ({ signal }) => {
      let offset = 0;
      while (true) {
        const { items, total } = await announcementPage(offset, signal);
        const item = items.find((item) => item.id === id);
        if (item) return item;
        offset += items.length;
        if (items.length === 0 || offset >= total) return null;
      }
    },
  });
}

export function useAckReport(id: string) {
  return useQuery({
    queryKey: [...announcementsKey, id, 'acks'],
    queryFn: ({ signal }) =>
      unwrap(notificationsApi.GET('/staff/announcements/{announcement_id}/acks', {
        params: { path: { announcement_id: id } },
        signal,
      })),
  });
}

export function useStaffDeadlines() {
  return useQuery({
    queryKey: deadlinesKey,
    queryFn: ({ signal }) => unwrap(notificationsApi.GET('/staff/deadlines', { signal })),
  });
}

export function useStaffActions() {
  const client = useQueryClient();
  const refreshFeed = () => client.invalidateQueries({ queryKey: ['notifications', 'feed'] });
  const refreshDeadlines = () => Promise.all([
    client.invalidateQueries({ queryKey: deadlinesKey }),
    client.invalidateQueries({ queryKey: ['notifications', 'deadlines'] }),
    refreshFeed(),
  ]);
  const publish = useMutation({
    mutationFn: (body: S['CreateAnnouncementRequest']) =>
      unwrap(notificationsApi.POST('/staff/announcements', { body })),
    onSuccess: () => Promise.all([client.invalidateQueries({ queryKey: announcementsKey }), refreshFeed()]),
  });
  const createDeadline = useMutation({
    mutationFn: (body: S['CreateDeadlineRequest']) => unwrap(notificationsApi.POST('/staff/deadlines', { body })),
    onSuccess: refreshDeadlines,
  });
  const deleteDeadline = useMutation({
    mutationFn: (id: string) =>
      unwrap(notificationsApi.DELETE('/staff/deadlines/{deadline_id}', { params: { path: { deadline_id: id } } })),
    onSuccess: refreshDeadlines,
  });
  return { publish, createDeadline, deleteDeadline };
}

export function useFaculties(enabled: boolean) {
  return useQuery({
    queryKey: ['academic', 'faculties'],
    queryFn: ({ signal }) => unwrap(academicApi.GET('/faculties', { signal })),
    enabled,
  });
}
