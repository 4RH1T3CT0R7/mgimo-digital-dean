import { Link } from 'react-router';
import { cn } from '@/shared/lib/utils';

// Логотип-заглушка: заменит T17
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      className={cn('flex w-fit items-center gap-2.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', className)}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary text-[13px] font-bold tracking-tight text-primary-foreground" aria-hidden>
        ЦД
      </span>
      <span className={cn('flex flex-col leading-tight', compact && 'sr-only sm:not-sr-only sm:flex')}>
        <span className="text-sm font-semibold">Цифровой деканат</span>
        <span className="text-[11px] text-muted-foreground">концепт для конкурса</span>
      </span>
    </Link>
  );
}
