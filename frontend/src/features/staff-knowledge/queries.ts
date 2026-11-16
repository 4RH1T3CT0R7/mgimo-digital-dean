import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { components } from '@/api/assistant';
import { assistantApi, unwrap } from '@/api/clients';

export type KnowledgeDocument = components['schemas']['KnowledgeDocument'];
export type Answer = components['schemas']['Answer'];

const key = ['assistant', 'staff', 'knowledge'] as const;

export function useKnowledge() {
  return useQuery({
    queryKey: key,
    queryFn: ({ signal }) => unwrap(assistantApi.GET('/staff/knowledge', { signal })),
  });
}

export function useKnowledgeActions() {
  const client = useQueryClient();
  const refresh = () => client.invalidateQueries({ queryKey: key });
  const add = useMutation({
    mutationFn: ({ title, file, text }: { title: string; file?: File; text?: string }) => {
      const form = new FormData();
      form.append('title', title);
      if (file) form.append('file', file);
      else form.append('text', text ?? '');
      return unwrap(
        assistantApi.POST('/staff/knowledge', {
          body: { title }, // тело для типов; отправляется form (multipart)
          bodySerializer: () => form,
        }),
      );
    },
    onSuccess: refresh,
  });
  const setActive = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      unwrap(assistantApi.PATCH('/staff/knowledge/{document_id}', { params: { path: { document_id: id } }, body: { active } })),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: (id: string) => unwrap(assistantApi.DELETE('/staff/knowledge/{document_id}', { params: { path: { document_id: id } } })),
    onSuccess: refresh,
  });
  return { add, setActive, remove };
}

export function useStaffAsk() {
  return useMutation({ mutationFn: (question: string) => unwrap(assistantApi.POST('/staff/ask', { body: { question } })) });
}
