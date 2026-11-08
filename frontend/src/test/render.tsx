import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import type { ReactElement } from 'react';
import { BrowserRouter } from 'react-router';
import { Providers } from '@/app/providers';
import { createQueryClient } from '@/app/query-client';
import { handlers } from '@/mocks/handlers';
import { setMockUser } from '@/mocks/handlers/auth';

/** Те же обработчики MSW, что в dev:mock. Переопределение в тесте: server.use(http.get(...)) */
export const server = setupServer(...handlers);

/**
 * Рендер с QueryClient (без повторов запросов) и роутером.
 * `route` — адрес страницы (вместе с ?scenario=…), `login` — войти под тестовым аккаунтом из seed.md.
 *
 *   const { user } = renderWithProviders(<AppRoutes />, { route: '/schedule', login: 'student.mo' });
 */
export function renderWithProviders(ui: ReactElement, { route = '/', login }: { route?: string; login?: string } = {}) {
  window.history.replaceState(null, '', route);
  if (login) setMockUser(login);
  const client = createQueryClient();
  client.setDefaultOptions({ queries: { ...client.getDefaultOptions().queries, retry: false } });
  return {
    user: userEvent.setup(),
    client,
    ...render(
      <Providers client={client}>
        <BrowserRouter>{ui}</BrowserRouter>
      </Providers>,
    ),
  };
}
