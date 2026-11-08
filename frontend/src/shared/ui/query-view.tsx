import type { UseQueryResult } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { EmptyState } from './empty-state';
import { ErrorState } from './error-state';
import { LoadingState } from './loading-state';

/**
 * Единый способ показать загрузку, ошибку, пустоту и данные запроса:
 *
 *   <QueryView query={q} isEmpty={(d) => d.items.length === 0} empty={<EmptyState title="Заявок пока нет" />}>
 *     {(data) => <List items={data.items} />}
 *   </QueryView>
 *
 * Если данные уже были, а фоновое обновление упало, остаются прежние данные.
 */
export function QueryView<T>({
  query,
  isEmpty,
  empty = <EmptyState title="Здесь пока ничего нет" />,
  loading = <LoadingState />,
  children,
}: {
  query: UseQueryResult<T>;
  isEmpty?: (data: T) => boolean;
  empty?: ReactNode;
  loading?: ReactNode;
  children: (data: T) => ReactNode;
}) {
  if (query.data === undefined) {
    if (query.isError) return <ErrorState error={query.error} onRetry={() => void query.refetch()} />;
    return loading;
  }
  if (isEmpty?.(query.data)) return empty;
  return children(query.data);
}
