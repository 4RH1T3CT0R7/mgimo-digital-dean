// Клиенты API на openapi-fetch. Типы — из сгенерированных *.d.ts (npm run gen), руками не пишутся.
import createClient, { type Middleware } from 'openapi-fetch';
import { endSession } from '@/app/session';
import { ApiError } from '@/shared/lib/errors';
import type { paths as AcademicPaths } from './academic';
import type { paths as AssistantPaths } from './assistant';
import type { paths as AuthPaths } from './auth';
import type { paths as NotificationsPaths } from './notifications';
import type { paths as RequestsPaths } from './requests';

// Абсолютный адрес нужен тестам (в Node fetch не понимает относительные URL); в браузере это тот же /api/<svc>
const origin = globalThis.location?.origin ?? '';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- ограничение как в самом openapi-fetch
function client<Paths extends {}>(service: string) {
  return createClient<Paths>({
    baseUrl: `${origin}/api/${service}`,
    credentials: 'include',
    // fetch берём в момент запроса, а не при создании клиента: так его перехватывает MSW в тестах
    fetch: (request) => globalThis.fetch(request),
  });
}

// 401 от сервиса — сессия истекла: забываем пользователя, охрана маршрутов отправит на /login.
// К authApi не подключаем: там 401 — это «не вошёл» (/me) или «неверный пароль» (/login).
const sessionExpired: Middleware = {
  onResponse({ response }) {
    if (response.status === 401) endSession();
  },
};

export const authApi = client<AuthPaths>('auth');
export const academicApi = client<AcademicPaths>('academic');
export const requestsApi = client<RequestsPaths>('requests');
export const notificationsApi = client<NotificationsPaths>('notifications');
export const assistantApi = client<AssistantPaths>('assistant');

for (const api of [academicApi, requestsApi, notificationsApi, assistantApi]) api.use(sessionExpired);

/**
 * Данные ответа или исключение ApiError — для queryFn и mutationFn:
 * `queryFn: () => unwrap(academicApi.GET('/me/profile'))`
 */
export async function unwrap<T>(request: Promise<{ data?: T; error?: unknown; response: Response }>): Promise<T> {
  const { data, error, response } = await request;
  if (!response.ok) throw new ApiError(response, error);
  return data as T;
}
