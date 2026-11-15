import { Link } from 'react-router';
import { cn } from '@/shared/lib/utils';

// Знак «Мой вуз» (T17, D57): центральный корпус здания из логотипа; файлы собирает docs/brand/make-icons.ps1
export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link
      to="/"
      className={cn('flex w-fit items-center gap-2.5 rounded-md focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none', className)}
    >
      <img
        src="/brand/mark-64.png"
        srcSet="/brand/mark-32.png 1x, /brand/mark-64.png 2x, /brand/mark-128.png 4x"
        width={32}
        height={32}
        alt=""
        className="size-8 shrink-0 rounded-[22%] dark:ring-1 dark:ring-white/15"
      />
      <span className={cn('flex flex-col leading-tight', compact && 'sr-only sm:not-sr-only sm:flex')}>
        <span className="text-sm font-semibold">Мой вуз</span>
        <span className="text-xs text-muted-foreground">концепт для конкурса</span>
      </span>
    </Link>
  );
}
