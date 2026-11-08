import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, server } from '@/test/render';
import { AppRoutes } from './routes';
import { onLogout } from './session';

// В jsdom нет CSS: в DOM и боковое меню, и нижняя панель; берём нижнюю (последнюю)
function tabBar() {
  return screen.getAllByRole('navigation', { name: 'Разделы' }).at(-1)!;
}

describe('Охрана маршрутов', () => {
  it('без входа — на /login', async () => {
    renderWithProviders(<AppRoutes />, { route: '/schedule' });
    expect(await screen.findByRole('heading', { name: 'Вход в личный кабинет' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
  });

  it('student — студенческая оболочка: 5 вкладок, счётчик непрочитанных', async () => {
    renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    const links = within(tabBar()).getAllByRole('link');
    expect(links.map((l) => l.textContent?.replace(/\d+$/, ''))).toHaveLength(5);
    expect(within(tabBar()).getByRole('link', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page');
    expect(await within(tabBar()).findByRole('link', { name: /Уведомления, непрочитанных: 3/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Профиль/ })).toHaveTextContent('Лебедева А. В.');
  });

  it('student на /staff — обратно на свою главную', async () => {
    renderWithProviders(<AppRoutes />, { route: '/staff', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/');
  });

  it('staff на / — в оболочку сотрудника /staff', async () => {
    renderWithProviders(<AppRoutes />, { route: '/', login: 'dekanat.mo' });
    expect(await screen.findByRole('heading', { name: 'Заявки' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/staff');
    expect(within(tabBar()).getAllByRole('link').map((l) => l.textContent)).toEqual(['Заявки', 'Объявления', 'Дедлайны', 'Занятия']);
    expect(screen.queryByLabelText('Факультет')).not.toBeInTheDocument(); // фильтр — только у admin
  });

  it('admin видит фильтр факультета', async () => {
    renderWithProviders(<AppRoutes />, { route: '/staff', login: 'admin' });
    expect(await screen.findByLabelText('Факультет')).toBeInTheDocument();
  });

  it('неизвестный адрес — страница 404 с подвалом', async () => {
    renderWithProviders(<AppRoutes />, { route: '/net-takoi-stranicy' });
    expect(await screen.findByText('Такой страницы нет')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Политика обработки персональных данных' })).toHaveAttribute('href', '/privacy');
  });
});

describe('Сценарии моков на главной-заглушке', () => {
  it('?scenario=error — ErrorState с «Повторить»', async () => {
    renderWithProviders(<AppRoutes />, { route: '/?scenario=error', login: 'student.mo' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Не удалось загрузить данные');
    expect(within(alert).getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });

  it('?scenario=empty — EmptyState', async () => {
    renderWithProviders(<AppRoutes />, { route: '/?scenario=empty', login: 'student.mo' });
    expect(await screen.findByText('На этой неделе занятий нет')).toBeInTheDocument();
  });

  it('?scenario=slow — LoadingState', async () => {
    renderWithProviders(<AppRoutes />, { route: '/?scenario=slow', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(screen.getByText('Загрузка…')).toBeInTheDocument();
  });

  it('без сценария — данные', async () => {
    renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    expect(await screen.findByText('Теория международных отношений')).toBeInTheDocument();
    expect(screen.getByText(/Данные актуальны на/)).toBeInTheDocument();
  });
});

describe('Выход', () => {
  it('кнопка «Выйти» — на /login и событие onLogout', async () => {
    const listener = vi.fn();
    const off = onLogout(listener);
    const { user } = renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    await user.click(await screen.findByRole('button', { name: 'Выйти' }));
    expect(await screen.findByRole('heading', { name: 'Вход в личный кабинет' })).toBeInTheDocument();
    expect(listener).toHaveBeenCalledOnce();
    off();
  });

  it('401 от сервиса (сессия истекла) — на /login и событие onLogout', async () => {
    server.use(
      http.get('/api/academic/me/schedule', () =>
        HttpResponse.json({ code: 'unauthenticated', message: 'Сессия истекла' }, { status: 401 }),
      ),
    );
    const listener = vi.fn();
    const off = onLogout(listener);
    renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Вход в личный кабинет' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/login');
    expect(listener).toHaveBeenCalled();
    off();
  });
});
