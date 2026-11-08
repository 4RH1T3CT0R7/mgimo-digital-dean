import { useQuery } from '@tanstack/react-query';
import { screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/lib/errors';
import { renderWithProviders } from '@/test/render';
import { EmptyState } from './empty-state';
import { QueryView } from './query-view';

function Demo({ fetcher }: { fetcher: () => Promise<string[]> }) {
  const query = useQuery({ queryKey: ['demo'], queryFn: fetcher });
  return (
    <QueryView query={query} isEmpty={(d) => d.length === 0} empty={<EmptyState title="Список пуст" />}>
      {(items) => <p>Данные: {items.join(', ')}</p>}
    </QueryView>
  );
}

describe('QueryView', () => {
  it('загрузка — LoadingState', () => {
    renderWithProviders(<Demo fetcher={() => new Promise(() => {})} />);
    expect(screen.getByRole('status')).toHaveTextContent('Загрузка…');
  });

  it('ошибка — ErrorState, «Повторить» перезапрашивает', async () => {
    const fetcher = vi
      .fn<() => Promise<string[]>>()
      .mockRejectedValueOnce(new ApiError(new Response(null, { status: 500 }), { code: 'internal', message: 'Внутренняя ошибка' }))
      .mockResolvedValueOnce(['после повтора']);
    const { user } = renderWithProviders(<Demo fetcher={fetcher} />);
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис временно недоступен');
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(await screen.findByText('Данные: после повтора')).toBeInTheDocument();
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('пусто — переданный EmptyState', async () => {
    renderWithProviders(<Demo fetcher={async () => []} />);
    expect(await screen.findByText('Список пуст')).toBeInTheDocument();
  });

  it('данные — children', async () => {
    renderWithProviders(<Demo fetcher={async () => ['а', 'б']} />);
    expect(await screen.findByText('Данные: а, б')).toBeInTheDocument();
  });
});
