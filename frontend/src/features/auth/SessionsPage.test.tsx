import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders } from '@/test/render';

describe('Безопасность: сеансы', () => {
  it('студент открывает из шапки, видит устройства и выходит на всех других', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/requests', login: 'student.mo' });
    await user.click(await screen.findByRole('link', { name: 'Безопасность: где выполнен вход' }));
    const list = await screen.findByRole('list', { name: 'Сеансы' });
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(3);
    expect(within(items[0]).getByText('Это устройство')).toBeInTheDocument();
    expect(items[0]).toHaveTextContent('Chrome · Windows');

    await user.click(screen.getByRole('button', { name: 'Выйти на всех других устройствах' }));
    expect(await screen.findByText('Вход выполнен только на этом устройстве.')).toBeInTheDocument();
    expect(within(screen.getByRole('list', { name: 'Сеансы' })).getAllByRole('listitem')).toHaveLength(1);
  });

  it('у сотрудника — своя страница в кабинете сотрудника', async () => {
    renderWithProviders(<AppRoutes />, { route: '/staff/security', login: 'dekanat.mo' });
    expect(await screen.findByRole('heading', { name: 'Безопасность' })).toBeInTheDocument();
    expect(await screen.findByRole('list', { name: 'Сеансы' })).toBeInTheDocument();
  });
});
