import { http, HttpResponse } from 'msw';
import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

// Запрос, для которого мок ещё не написан, — понятная ошибка вместо index.html от dev-сервера
const notMocked = http.all('/api/*', ({ request }) =>
  HttpResponse.json(
    { code: 'not_found', message: `Мок не написан: ${request.method} ${new URL(request.url).pathname}` },
    { status: 404 },
  ),
);

export const worker = setupWorker(...handlers, notMocked);
