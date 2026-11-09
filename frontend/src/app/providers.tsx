import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { useEffect, type ReactNode } from 'react';
import { Toaster } from '@/shared/ui/toast';
import { OfflineBanner } from '@/features/pwa/OfflineBanner';
import { meQueryKey, onLogout } from './session';

export function Providers({ client, children }: { client: QueryClient; children: ReactNode }) {
  // Выход или истёкшая сессия: забыть пользователя (охрана отправит на /login) и все его данные
  useEffect(
    () =>
      onLogout(() => {
        client.setQueryData(meQueryKey, null);
        client.removeQueries({ predicate: (q) => q.queryKey[0] !== meQueryKey[0] });
        client.getMutationCache().clear();
      }),
    [client],
  );

  return (
    <QueryClientProvider client={client}>
      <OfflineBanner />
      {children}
      <Toaster />
    </QueryClientProvider>
  );
}
