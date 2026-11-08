import type { ReactNode } from 'react';
import { cn } from '@/shared/lib/utils';

/** Самостоятельный блок экрана с заголовком (переписка, сведения, файлы). Блок в блоке — нет. */
export function Section({ title, children, className }: { title: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-5 md:p-6', className)}>
      <h2 className="text-lg leading-snug font-semibold">{title}</h2>
      {children}
    </section>
  );
}
