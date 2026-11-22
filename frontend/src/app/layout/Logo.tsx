import { Link } from 'react-router';
import { cn } from '@/shared/lib/utils';

// Логотип «Мой вуз» целиком (T17, D57; замечание команды 22.11 — вырезанный корпус выглядел странно); файлы собирает docs/brand/make-icons.ps1
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      className={cn('flex min-h-11 w-fit items-center gap-2.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', className)}
    >
      <img
        src="/brand/logo-80.png"
        srcSet="/brand/logo-80.png 2x, /brand/logo-160.png 4x"
        width={40}
        height={40}
        alt=""
        className="size-10 shrink-0"
      />
      <span className={cn('flex flex-col leading-tight', compact && 'sr-only sm:not-sr-only sm:flex')}>
        <span className="text-sm font-semibold">Мой вуз</span>
        <span className="text-xs text-muted-foreground">концепт для конкурса</span>
      </span>
    </Link>
  );
}
