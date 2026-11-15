import { randomUUID } from 'node:crypto';
import { expect, request, test, type APIRequestContext, type APIResponse } from '@playwright/test';
import { mockMode, password, studentId, type Account } from './helpers.js';

const secretFields = ['password', 'password_hash', 'token_hash'];

/** Поиск по всему телу ответа: ловит и поля, и значения вроде вложенного JSON в строке. */
function noSecretText(value: unknown, endpoint: string): void {
  const text = JSON.stringify(value).toLowerCase();
  for (const field of secretFields) {
    expect(text.includes(field), `подстрока ${field} в ответе ${endpoint}`).toBe(false);
  }
}

function noSecretFields(value: unknown, endpoint: string): void {
  if (Array.isArray(value)) {
    for (const item of value) noSecretFields(item, endpoint);
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      expect(secretFields.includes(key.toLowerCase()),
        `запрещённое поле в ответе ${endpoint}`).toBe(false);
      noSecretFields(child, endpoint);
    }
  }
}

async function json(response: APIResponse, status: number, endpoint: string): Promise<unknown> {
  expect(response.status(), endpoint).toBe(status);
  const body: unknown = await response.json();
  noSecretFields(body, endpoint);
  noSecretText(body, endpoint);
  return body;
}

const profile = '/api/academic/me/profile';
const mine = '/api/requests/me/applications';
const staffed = '/api/requests/staff/applications';

test('S1–S7: шлюз, изоляция заявок, ограничение входа и поля ответов', async ({ baseURL, ignoreHTTPSErrors }) => {
  test.skip(mockMode, 'Проверки доступа требуют шлюз и настоящие cookies.');
  const contexts: APIRequestContext[] = [];
  async function context(account?: Account) {
    const api = await request.newContext({ baseURL, ignoreHTTPSErrors });
    contexts.push(api);
    if (account) {
      await json(await api.post('/api/auth/login', { data: { login: account, password: password(account) } }), 200, 'login');
    }
    return api;
  }
  try {
    const student = await context('student.mo');
    const otherStudent = await context('student.meo');
    const staff = await context('dekanat.mo');
    const otherStaff = await context('dekanat.meo');
    const admin = await context('admin');
    const anonymous = await context();

    // Собственная заявка создаётся в этом прогоне, поэтому известны автор и факультет.
    const created = await json(await student.post(mine, {
      data: { service_type_id: 'dean-question', fields: { question: `Тест доступа T20 ${randomUUID()}` } },
    }), 201, 'создание заявки');
    const id = (created as { id?: unknown }).id;
    expect(typeof id === 'string' && /^[\da-f-]{36}$/i.test(id), 'ID созданной заявки').toBe(true);
    const studentURL = `${mine}/${id}`;
    const staffURL = `${staffed}/${id}`;
    await json(await student.get(studentURL), 200, 'своя заявка');
    await json(await staff.get(staffURL), 200, 'заявка своего факультета');

    await test.step('S1: заявка другого студента возвращает 404', async () => {
      await json(await otherStudent.get(studentURL), 404, 'чужая заявка');
    });
    await test.step('S2: заголовок личности без сессии возвращает 401', async () => {
      expect((await anonymous.get(profile, { headers: { 'X-User-Id': studentId } })).status()).toBe(401);
    });
    await test.step('S3: заявка чужого факультета возвращает 404', async () => {
      await json(await otherStaff.get(staffURL), 404, 'чужой факультет');
    });
    await test.step('S4: внутренний маршрут недоступен через шлюз', async () => {
      expect((await student.get(`/api/academic/internal/students/${studentId}`, { maxRedirects: 0 })).status()).not.toBe(200);
    });
    await test.step('S5: шестой неверный вход возвращает 429', async () => {
      // Один и тот же заведомо несуществующий логин в серии, уникальный между запусками.
      const login = `e2e.nobody.${randomUUID()}`;
      const invalid = randomUUID();
      for (let attempt = 1; attempt <= 6; attempt++) {
        const response = await anonymous.post('/api/auth/login', { data: { login, password: invalid } });
        await json(response, attempt === 6 ? 429 : 401, `неверный вход №${attempt}`);
      }
    });
    await test.step('S6: студенту закрыт список сотрудника', async () => {
      await json(await student.get(staffed), 403, 'список заявок сотрудника');
    });
    await test.step('S7: публичные JSON не содержат полей паролей и хешей токенов', async () => {
      await json(await student.get('/api/auth/me'), 200, 'me студента');
      await json(await student.get('/api/auth/me/sessions'), 200, 'сеансы');
      await json(await student.get(profile), 200, 'профиль');
      await json(await student.get(mine), 200, 'мои заявки');
      await json(await student.get('/api/notifications/me/feed'), 200, 'лента');
      await json(await staff.get(staffed), 200, 'заявки факультета');
      await json(await admin.get(staffed), 200, 'заявки администратора');
    });
  } finally {
    await Promise.all(contexts.map((api) => api.dispose()));
  }
});
