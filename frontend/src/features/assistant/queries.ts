import { useMutation } from '@tanstack/react-query';
import { assistantApi, unwrap } from '@/api/clients';
import type { components } from '@/api/assistant';

export type Answer = components['schemas']['Answer'];

export function useAsk() {
  return useMutation({ mutationFn: (question: string) => unwrap(assistantApi.POST('/ask', { body: { question } })) });
}
