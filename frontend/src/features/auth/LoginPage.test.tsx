import { screen } from '@testing-library/react';
import { delay, http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, server } from '@/test/render';

async function fillAndSubmit(user: ReturnType<typeof renderWithProviders>['user'], login: string, password: string) {
  await user.type(await screen.findByLabelText('Логин'), login);
  await user.type(screen.getByLabelText('Пароль'), password);
  await user.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('Вход', () => {
  it('student.mo входит и попадает на «Сегодня»', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/login' });
    await fillAndSubmit(user, 'student.mo', 'demo');
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('после входа возвращает на страницу, с которой отправили на вход', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/grades' });
    await fillAndSubmit(user, 'student.mo', 'demo');
    expect(await screen.findByRole('heading', { name: 'Успеваемость' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/grades');
  });

  it('401 — «Неверный логин или пароль», можно попробовать снова', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/login' });
    await fillAndSubmit(user, 'student.mo', 'не-тот');
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный логин или пароль');
    expect(screen.getByRole('button', { name: 'Войти' })).toBeEnabled();
    expect(window.location.pathname).toBe('/login');
  });

  it('429 — когда можно повторить', async () => {
    server.use(
      http.post('/api/auth/login', () =>
        HttpResponse.json(
          { code: 'too_many_attempts', message: 'Слишком много попыток' },
          { status: 429, headers: { 'Retry-After': '120' } },
        ),
      ),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: '/login' });
    await fillAndSubmit(user, 'student.mo', 'demo');
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много попыток. Попробуйте через 2 минуты.');
  });

  it('во время запроса кнопка заблокирована', async () => {
    server.use(http.post('/api/auth/login', () => delay('infinite')));
    const { user } = renderWithProviders(<AppRoutes />, { route: '/login' });
    await fillAndSubmit(user, 'student.mo', 'demo');
    expect(await screen.findByRole('button', { name: 'Входим…' })).toBeDisabled();
  });
});
