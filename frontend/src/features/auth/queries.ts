import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { authApi, unwrap } from '@/api/clients';
import type { components } from '@/api/auth';
import { endSession, meQueryKey, type Me } from '@/app/session';
import { ApiError } from '@/shared/lib/errors';

/** Текущий пользователь; `null` — не вошёл. */
export function useMe() {
  return useQuery<Me | null>({
    queryKey: meQueryKey,
    queryFn: async () => {
      const { data, error, response } = await authApi.GET('/me');
      if (response.status === 401) return null;
      if (!response.ok || !data) throw new ApiError(response, error);
      return data;
    },
    // Сессию «теряем» только по 401 от API или по выходу (session.ts)
    staleTime: Infinity,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: components['schemas']['LoginRequest']) => unwrap(authApi.POST('/login', { body })),
    onSuccess: (me) => queryClient.setQueryData(meQueryKey, me),
    gcTime: 0, // пароль в переменных мутации не храним дольше, чем нужно
  });
}

/** Выход: `useLogout().mutate()` → сессия завершена на сервере и в браузере, переход на /login. */
export function useLogout() {
  const navigate = useNavigate();
  return useMutation({
    // Даже если сервер недоступен, на клиенте сессию завершаем
    mutationFn: () => authApi.POST('/logout').catch(() => undefined),
    onSettled: () => {
      endSession();
      navigate('/login', { replace: true });
    },
  });
}
