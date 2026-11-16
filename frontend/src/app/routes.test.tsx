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

  it('student — студенческая оболочка (D63): 5 вкладок с «Ещё», колокольчик со счётчиком, все разделы в боковом меню', async () => {
    renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    expect(within(tabBar()).getAllByRole('link').map((l) => l.textContent)).toEqual(['Сегодня', 'Расписание', 'Учёба', 'Заявки', 'Ещё']);
    expect(within(tabBar()).getByRole('link', { name: 'Сегодня' })).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('link', { name: 'Уведомления, непрочитанных: 3' })).toHaveAttribute('href', '/notifications');
    const sidebar = screen.getAllByRole('navigation', { name: 'Разделы' })[0];
    expect(within(sidebar).getAllByRole('link').map((l) => l.textContent?.replace(/\d+ непрочитанных$/, ''))).toEqual([
      'Сегодня', 'Расписание', 'Учёба', 'Заявки', 'Уведомления', 'Полезное', 'Помощник', 'Профиль', 'Безопасность',
    ]);
    expect(screen.getByRole('button', { name: 'Меню пользователя: Лебедева А. В.' })).toBeInTheDocument();
  });

  it('«Ещё» — разделы из того же конфига; вкладка активна и на этих разделах', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Сегодня' })).toBeInTheDocument();
    await user.click(within(tabBar()).getByRole('link', { name: 'Ещё' }));
    const more = await screen.findByRole('navigation', { name: 'Другие разделы' });
    expect(within(more).getAllByRole('link').map((l) => [l.textContent, l.getAttribute('href')])).toEqual([
      ['Полезное', '/useful'],
      ['Помощник', '/assistant'],
      ['Профиль', '/profile'],
      ['Безопасность', '/security'],
    ]);
    await user.click(within(more).getByRole('link', { name: 'Полезное' }));
    expect(await screen.findByRole('heading', { name: 'Полезное' })).toBeInTheDocument();
    expect(within(tabBar()).getByRole('link', { name: 'Ещё' })).toHaveAttribute('aria-current', 'page');
  });

  it('колокольчик без непрочитанных — без числа', async () => {
    server.use(http.get('/api/notifications/me/feed/counters', () => HttpResponse.json({ unread: 0, important_unacked: 0, deadlines_soon: 0 })));
    renderWithProviders(<AppRoutes />, { route: '/notifications', login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Уведомления и дедлайны' })).toBeInTheDocument();
    // Пункт бокового меню и колокольчик (в jsdom видны оба), оба без числа
    const links = screen.getAllByRole('link', { name: 'Уведомления' });
    expect(links.map((l) => l.getAttribute('aria-label'))).toEqual([null, 'Уведомления']);
    for (const link of links) expect(link).toHaveAttribute('aria-current', 'page');
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
    expect(await screen.findByText('В ближайшие 14 дней занятий нет')).toBeInTheDocument();
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
    await user.click(await screen.findByRole('button', { name: /Меню пользователя/ }));
    await user.click(await screen.findByRole('menuitem', { name: 'Выйти' }));
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

describe('Меню пользователя и тема', () => {
  it('у студента: профиль, безопасность, тема; выбор темы ставит класс и запоминается', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
    await user.click(await screen.findByRole('button', { name: 'Меню пользователя: Лебедева А. В.' }));
    expect(screen.getByRole('menuitem', { name: 'Профиль' })).toHaveAttribute('href', '/profile');
    expect(screen.getByRole('menuitem', { name: 'Безопасность' })).toHaveAttribute('href', '/security');
    expect(screen.getByRole('menuitemradio', { name: 'Как в системе' })).toHaveAttribute('aria-checked', 'true');

    await user.click(screen.getByRole('menuitemradio', { name: 'Тёмная' }));
    expect(document.documentElement).toHaveClass('dark');
    expect(localStorage.getItem('theme')).toBe('dark');

    await user.click(screen.getByRole('button', { name: /Меню пользователя/ }));
    await user.click(screen.getByRole('menuitemradio', { name: 'Как в системе' }));
    expect(document.documentElement).not.toHaveClass('dark'); // в тестах система — светлая
    expect(localStorage.getItem('theme')).toBeNull();
  });

  it('у сотрудника профиля нет, безопасность — в кабинете сотрудника', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/staff', login: 'dekanat.mo' });
    await user.click(await screen.findByRole('button', { name: 'Меню пользователя: Деканат ФМО' }));
    expect(screen.queryByRole('menuitem', { name: 'Профиль' })).not.toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: 'Безопасность' })).toHaveAttribute('href', '/staff/security');
  });
});
