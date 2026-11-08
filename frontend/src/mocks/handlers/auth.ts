import { http, HttpResponse } from 'msw';
import type { components } from '@/api/auth';
import { MOCK_PASSWORD, users } from '../fixtures/auth';

// Сессия мока — в sessionStorage: в dev:mock вход переживает перезагрузку страницы
const KEY = 'mock-session-login';

export function mockUser(): components['schemas']['Me'] | null {
  const login = sessionStorage.getItem(KEY);
  return login ? (users[login] ?? null) : null;
}

/** Войти под тестовым аккаунтом без формы (тесты): setMockUser('student.mo') */
export function setMockUser(login: string | null) {
  if (login) sessionStorage.setItem(KEY, login);
  else sessionStorage.removeItem(KEY);
}

export const authHandlers = [
  http.post('/api/auth/login', async ({ request }) => {
    const { login, password } = (await request.json()) as components['schemas']['LoginRequest'];
    if (!users[login] || password !== MOCK_PASSWORD) {
      return HttpResponse.json({ code: 'invalid_credentials', message: 'Неверный логин или пароль' }, { status: 401 });
    }
    setMockUser(login);
    return HttpResponse.json(users[login]);
  }),

  http.post('/api/auth/logout', () => {
    setMockUser(null);
    return new HttpResponse(null, { status: 204 });
  }),

  http.get('/api/auth/me', () => {
    const user = mockUser();
    return user
      ? HttpResponse.json(user)
      : HttpResponse.json({ code: 'unauthenticated', message: 'Войдите в систему' }, { status: 401 });
  }),
];
