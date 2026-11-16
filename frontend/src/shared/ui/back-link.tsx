import { ArrowLeftIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Button } from './button';

/** «← Все заявки» над заголовком страницы */
export function BackLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Button asChild variant="link" className="mb-1 h-auto min-h-11 px-0">
      <Link to={to}>
        <ArrowLeftIcon aria-hidden />
        {children}
      </Link>
    </Button>
  );
}
