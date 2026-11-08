import { http, HttpResponse } from 'msw';
import type { components } from '@/api/auth';
import { MOCK_PASSWORD, users } from '../fixtures/auth';

// Сессия мока — в sessionStorage: в dev:mock вход переживает перезагрузку страницы
const KEY = 'mock-session-login';

// Сеансы мока: текущий + два «других устройства», пока их не завершили
let othersEnded = false;
const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();
function sessions(): components['schemas']['Session'][] {
  const current = { device: 'Chrome · Windows', created_at: hoursAgo(2), last_seen_at: hoursAgo(0), current: true };
  if (othersEnded) return [current];
  return [
    current,
    { device: 'Safari · iPhone', created_at: hoursAgo(20), last_seen_at: hoursAgo(3), current: false },
    { device: 'Яндекс Браузер · Android', created_at: hoursAgo(9), last_seen_at: hoursAgo(8), current: false },
  ];
}

export function mockUser(): components['schemas']['Me'] | null {
  const login = sessionStorage.getItem(KEY);
  return login ? (users[login] ?? null) : null;
}

/** Войти под тестовым аккаунтом без формы (тесты): setMockUser('student.mo') */
export function setMockUser(login: string | null) {
  othersEnded = false;
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

  http.get('/api/auth/me/sessions', () =>
    mockUser() ? HttpResponse.json({ items: sessions() }) : HttpResponse.json({ code: 'unauthenticated', message: 'Войдите в систему' }, { status: 401 }),
  ),

  http.delete('/api/auth/me/sessions/others', () => {
    const ended = sessions().length - 1;
    othersEnded = true;
    return HttpResponse.json({ ended });
  }),
];
