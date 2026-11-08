import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const tones: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground',
  info: 'bg-info-soft text-info-strong',
  success: 'bg-success-soft text-success-strong',
  warning: 'bg-warning-soft text-warning-strong',
  danger: 'bg-danger-soft text-danger-strong',
};

/** Метка статуса. Цвет — не единственный признак: в children всегда текст. */
export function StatusBadge({ tone, children, className }: { tone: Tone; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-[0.8125rem] leading-none font-medium whitespace-nowrap', tones[tone], className)}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {children}
    </span>
  );
}
