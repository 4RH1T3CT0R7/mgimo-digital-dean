import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { resetNotificationsState } from '@/mocks/handlers/notifications';
import { renderWithProviders } from '@/test/render';

const renderPage = (login = 'admin', route = '/admin/banners') => renderWithProviders(<AppRoutes />, { route, login });
const row = (title: string) => within(screen.getByRole('heading', { name: title }).closest('li')!);

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
  resetNotificationsState();
});
afterEach(() => vi.useRealTimers());

describe('Баннеры администратора', () => {
  it('пункт «Баннеры» в меню — только у администратора', async () => {
    const staff = renderPage('dekanat.mo', '/staff');
    expect(await screen.findByRole('heading', { name: 'Заявки' })).toBeInTheDocument();
    expect(screen.queryAllByRole('link', { name: 'Баннеры' })).toHaveLength(0);
    staff.unmount();
    renderPage('admin', '/staff');
    expect((await screen.findAllByRole('link', { name: 'Баннеры' }))[0]).toHaveAttribute('href', '/admin/banners');
  });

  it('сотруднику страница недоступна', async () => {
    renderPage('dekanat.mo');
    expect(await screen.findByText('Раздел доступен только администратору')).toBeVisible();
  });

  it('список со статусом и числом скрывших, «Снять сейчас»', async () => {
    const { user } = renderPage();
    const normal = 'Новости и мероприятия — в отдельном разделе';
    await screen.findByRole('heading', { name: normal });
    expect(row(normal).getByText('Показывается')).toBeVisible();
    expect(row(normal).getByText('Скрыли: 0')).toBeVisible();
    expect(row('Плановые работы в ночь на 28 ноября').getByText('Срочный')).toBeVisible();

    await user.click(row(normal).getByRole('button', { name: `Снять сейчас: ${normal}` }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Снять баннер' }));
    expect(await row(normal).findByText('Завершён')).toBeVisible();
    expect(row(normal).queryByRole('button', { name: /Снять сейчас/ })).not.toBeInTheDocument();
  });

  it('форма проверяет ссылку и создаёт баннер', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Новый баннер' }));
    const form = within(await screen.findByRole('dialog'));
    await user.type(form.getByLabelText('Заголовок'), 'Библиотека работает до 16:00');
    await user.type(form.getByLabelText('Ссылка — необязательно'), 'javascript:alert(1)');
    await user.type(form.getByLabelText('Подпись ссылки'), 'Подробнее');
    const end = within(form.getByRole('group', { name: 'Окончание показа' }));
    fireEvent.change(end.getByLabelText('Дата'), { target: { value: '2026-11-25' } });
    await user.click(form.getByRole('button', { name: 'Создать баннер' }));
    expect(await form.findByText(/Укажите адрес https/)).toBeVisible();
    expect(form.getByLabelText('Ссылка — необязательно')).toHaveAttribute('aria-invalid', 'true');

    await user.clear(form.getByLabelText('Ссылка — необязательно'));
    await user.type(form.getByLabelText('Ссылка — необязательно'), '/useful');
    await user.click(form.getByRole('radio', { name: /Срочный/ }));
    await user.click(form.getByRole('button', { name: 'Создать баннер' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    const created = row('Библиотека работает до 16:00');
    expect(created.getByText('Показывается')).toBeVisible();
    expect(created.getByText('Срочный')).toBeVisible();
    expect(created.getByText('Ссылка: /useful')).toBeVisible();
  });
});
