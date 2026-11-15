import type { ComponentProps } from 'react';
import { cn } from '@/shared/lib/utils';

// Общий вид полей ввода: Input, Textarea, SelectTrigger
export const fieldClass =
  'w-full min-w-0 rounded-lg border border-input bg-card px-3.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20';

export function Input({ className, type, ...props }: ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClass, 'h-11 py-1', className)} {...props} />;
}
