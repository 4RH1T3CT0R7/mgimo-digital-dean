import { delay, http, HttpResponse } from 'msw';

// Сценарии для проверки состояний экранов: добавьте к адресу страницы ?scenario=empty | error | slow.
// Параметр действует, пока он есть в адресе. Вход и /me (/api/auth/*) работают всегда.
export type Scenario = 'empty' | 'error' | 'slow';

export function scenario(): Scenario | null {
  const value = new URLSearchParams(globalThis.location?.search).get('scenario');
  return value === 'empty' || value === 'error' || value === 'slow' ? value : null;
}

/** Список с учётом сценария empty. Оборачивайте им каждый список в обработчиках. */
export function list<T>(items: T[]): T[] {
  return scenario() === 'empty' ? [] : items;
}

/** Ответ `{ items, total }` с limit/offset из запроса и сценарием empty. */
export function page<T>(items: T[], request: Request): { items: T[]; total: number } {
  const all = list(items);
  const params = new URL(request.url).searchParams;
  const limit = Number(params.get('limit') ?? 20);
  const offset = Number(params.get('offset') ?? 0);
  return { items: all.slice(offset, offset + limit), total: all.length };
}

/** Стоит первым в списке обработчиков: error → 500, slow → задержка 2 с и дальше по цепочке. */
export const scenarioHandler = http.all('/api/*', async ({ request }) => {
  if (new URL(request.url).pathname.startsWith('/api/auth/')) return;
  const current = scenario();
  if (current === 'slow') await delay(2000);
  if (current === 'error') {
    return HttpResponse.json({ code: 'internal', message: 'Ошибка сервера (сценарий error)' }, { status: 500 });
  }
  // ничего не вернули — запрос обработает следующий подходящий обработчик
});
