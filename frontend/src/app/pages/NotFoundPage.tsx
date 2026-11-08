import { SearchXIcon } from 'lucide-react';
import { Link } from 'react-router';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-md py-6 md:py-12">
      <h1 className="sr-only">Страница не найдена</h1>
      <EmptyState
        title="Такой страницы нет"
        description="Возможно, адрес набран с ошибкой или страница была удалена."
        illustration={
          <div className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground" aria-hidden>
            <SearchXIcon className="size-6" />
          </div>
        }
        action={
          <Button asChild>
            <Link to="/">На главную</Link>
          </Button>
        }
      />
    </div>
  );
}
