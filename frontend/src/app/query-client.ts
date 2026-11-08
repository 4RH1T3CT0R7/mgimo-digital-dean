import { QueryClient } from '@tanstack/react-query';
import { ApiError } from '@/shared/lib/errors';

export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Ошибки 4xx повтором не лечатся; сбой сети или 5xx — пробуем ещё раз
        retry: (failureCount, error) => failureCount < 1 && !(error instanceof ApiError && error.status < 500),
      },
    },
  });
}
