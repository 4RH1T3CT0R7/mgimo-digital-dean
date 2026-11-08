import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestsApi, unwrap } from '@/api/clients';
import type { operations } from '@/api/requests';

export type StaffListQuery = NonNullable<operations['listStaffApplications']['parameters']['query']>;

// Живое обновление: новые заявки и ответы студентов появляются без перезагрузки (только на видимой вкладке).
const LIST_REFRESH_MS = 30_000;
const APPLICATION_REFRESH_MS = 15_000;
const FINAL_STATUSES = ['ready', 'rejected', 'cancelled'];

export function useStaffStats() {
  return useQuery({
    queryKey: ['requests', 'staff', 'stats'],
    queryFn: () => unwrap(requestsApi.GET('/staff/stats')),
    refetchInterval: LIST_REFRESH_MS,
  });
}

// ponytail: одна страница до 100 заявок — хватает прототипу; больше — «Показать ещё» на offset
export const LIST_LIMIT = 100;

export function useStaffApplications(query: StaffListQuery) {
  return useQuery({
    queryKey: ['requests', 'staff', 'applications', query],
    refetchInterval: LIST_REFRESH_MS,
    queryFn: () =>
      unwrap(
        requestsApi.GET('/staff/applications', {
          params: { query: { ...query, limit: LIST_LIMIT } },
          // status — через запятую (style: form, explode: false в контракте)
          querySerializer: { array: { style: 'form', explode: false } },
        }),
      ),
  });
}

export function useServiceTypes() {
  return useQuery({
    queryKey: ['requests', 'service-types'],
    queryFn: () => unwrap(requestsApi.GET('/service-types')),
    staleTime: Infinity,
  });
}

export function useStaffApplication(id: string) {
  return useQuery({
    queryKey: ['requests', 'staff', 'application', id],
    refetchInterval: (q) => (q.state.data && FINAL_STATUSES.includes(q.state.data.status) ? false : APPLICATION_REFRESH_MS),
    queryFn: () => unwrap(requestsApi.GET('/staff/applications/{application_id}', { params: { path: { application_id: id } } })),
  });
}

/** Мутация по заявке: после ответа (и после ошибки — например, 409) обновляем всё о заявках */
function useStaffMutation<V, R>(mutationFn: (vars: V) => Promise<R>) {
  const queryClient = useQueryClient();
  return useMutation({ mutationFn, onSettled: () => queryClient.invalidateQueries({ queryKey: ['requests'] }) });
}

type StatusChange = NonNullable<operations['changeApplicationStatus']['requestBody']>['content']['application/json'];

export function useChangeStatus(id: string) {
  return useStaffMutation((body: StatusChange) =>
    unwrap(requestsApi.POST('/staff/applications/{application_id}/status', { params: { path: { application_id: id } }, body })),
  );
}

export function useSendMessage(id: string) {
  return useStaffMutation((text: string) =>
    unwrap(requestsApi.POST('/staff/applications/{application_id}/messages', { params: { path: { application_id: id } }, body: { text } })),
  );
}

export function useUploadResult(id: string) {
  return useStaffMutation((file: File) => {
    const body = new FormData();
    body.append('file', file);
    body.append('is_result', 'true');
    // multipart: openapi-fetch отдаёт FormData как есть, тип тела в схеме — строка (binary)
    return unwrap(requestsApi.POST('/staff/applications/{application_id}/attachments', { params: { path: { application_id: id } }, body: body as never }));
  });
}
