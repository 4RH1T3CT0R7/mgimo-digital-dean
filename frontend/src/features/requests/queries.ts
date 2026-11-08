import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { requestsApi, unwrap } from '@/api/clients';
import type { components } from '@/api/requests';

type S = components['schemas'];
export type ServiceType = S['ServiceType'];
export type Application = S['Application'];
export type ApplicationSummary = S['ApplicationSummary'];

const applicationsKey = ['requests', 'applications'] as const;

export function useServiceTypes() {
  return useQuery({
    queryKey: ['requests', 'service-types'],
    queryFn: () => unwrap(requestsApi.GET('/service-types')),
    staleTime: 5 * 60_000, // каталог меняется редко
  });
}

/** Мои заявки; `answered` — только те, где пришёл ответ. */
// Живое обновление: студент видит ответ и смену статуса деканатом без перезагрузки страницы.
// Опрос идёт только на видимой вкладке (по умолчанию TanStack Query) и останавливается у завершённых заявок.
const LIST_REFRESH_MS = 30_000;
const APPLICATION_REFRESH_MS = 15_000;
const FINAL_STATUSES = ['ready', 'rejected', 'cancelled'];

export function useMyApplications(answered: boolean) {
  return useQuery({
    queryKey: [...applicationsKey, { answered }],
    refetchInterval: LIST_REFRESH_MS,
    // ponytail: поиск по номеру — на клиенте среди 100 последних; у API студента нет параметра q
    queryFn: () => unwrap(requestsApi.GET('/me/applications', { params: { query: { answered: answered || undefined, limit: 100 } } })),
  });
}

export function useMyApplication(id: string) {
  return useQuery({
    queryKey: [...applicationsKey, id],
    refetchInterval: (q) => (q.state.data && FINAL_STATUSES.includes(q.state.data.status) ? false : APPLICATION_REFRESH_MS),
    queryFn: () => unwrap(requestsApi.GET('/me/applications/{application_id}', { params: { path: { application_id: id } } })),
  });
}

function uploadAttachment(applicationId: string, file: File) {
  const form = new FormData();
  form.append('file', file);
  return unwrap(
    requestsApi.POST('/me/applications/{application_id}/attachments', {
      params: { path: { application_id: applicationId } },
      body: { file: file.name }, // тело для типов; отправляется form (multipart)
      bodySerializer: () => form,
    }),
  );
}

/** Подать заявку и загрузить вложения. Ошибка загрузки файла не отменяет поданную заявку — см. uploadError. */
export function useCreateApplication() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ files, ...body }: S['CreateApplicationRequest'] & { files: File[] }) => {
      const application = await unwrap(requestsApi.POST('/me/applications', { body }));
      let uploadError: unknown = null;
      for (const file of files) {
        try {
          await uploadAttachment(application.id, file);
        } catch (err) {
          uploadError = err;
          break;
        }
      }
      return { application, uploadError };
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: applicationsKey }),
  });
}

export function useUploadAttachment(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => uploadAttachment(applicationId, file),
    onSettled: () => queryClient.invalidateQueries({ queryKey: applicationsKey }),
  });
}

export function useCancelApplication(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () =>
      unwrap(requestsApi.POST('/me/applications/{application_id}/cancel', { params: { path: { application_id: applicationId } } })),
    onSettled: () => queryClient.invalidateQueries({ queryKey: applicationsKey }),
  });
}

export function usePostMessage(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (text: string) =>
      unwrap(
        requestsApi.POST('/me/applications/{application_id}/messages', {
          params: { path: { application_id: applicationId } },
          body: { text },
        }),
      ),
    // Сообщение в needs_info переводит заявку в in_progress — перечитываем и заявку, и список
    onSettled: () => queryClient.invalidateQueries({ queryKey: applicationsKey }),
  });
}

/** «Помог ли ответ деканата» — повторная отправка заменяет оценку. */
export function useSendFeedback(applicationId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: S['FeedbackRequest']) =>
      unwrap(
        requestsApi.PUT('/me/applications/{application_id}/feedback', {
          params: { path: { application_id: applicationId } },
          body,
        }),
      ),
    onSuccess: (application) => queryClient.setQueryData([...applicationsKey, applicationId], application),
  });
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Скачиваем через fetch, а не ссылкой: так работают и моки (MSW не видит переходов по ссылке), и 401 → вход
export function useDownloadCertificate(application: Pick<Application, 'id' | 'number'>) {
  return useMutation({
    mutationFn: async () => {
      const blob = await unwrap(
        requestsApi.GET('/me/applications/{application_id}/certificate.pdf', {
          params: { path: { application_id: application.id } },
          parseAs: 'blob',
        }),
      );
      saveBlob(blob, `spravka-${application.number}.pdf`);
    },
  });
}

export function useDownloadAttachment(applicationId: string) {
  return useMutation({
    mutationFn: async (attachment: S['Attachment']) => {
      const blob = await unwrap(
        requestsApi.GET('/me/applications/{application_id}/attachments/{attachment_id}', {
          params: { path: { application_id: applicationId, attachment_id: attachment.id } },
          parseAs: 'blob',
        }),
      );
      saveBlob(blob, attachment.file_name);
    },
  });
}
