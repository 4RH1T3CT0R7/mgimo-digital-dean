import { CheckIcon, CircleAlertIcon, XIcon } from 'lucide-react';
import type { CSSProperties } from 'react';
import { cn } from '@/shared/lib/utils';

/**
 * Шкала шагов процесса («Подана → В работе → Готово»). Только для настоящей последовательности.
 * attention — нужен ответ человека; failed — процесс завершился отказом; stopped — остановлен (отозван).
 */
export type StepState = 'done' | 'current' | 'upcoming' | 'attention' | 'failed' | 'stopped';
export type Step = { label: string; state: StepState; hint?: string };

const REACHED: StepState[] = ['done', 'current', 'attention'];

const SR: Record<StepState, string> = {
  done: 'пройден',
  current: 'текущий шаг',
  upcoming: 'впереди',
  attention: 'нужно действие',
  failed: 'отказ',
  stopped: 'остановлен',
};

const marker: Record<StepState, string> = {
  done: 'bg-primary text-primary-foreground',
  current: 'border-2 border-primary bg-card text-primary',
  upcoming: 'border-2 border-border bg-card text-muted-foreground',
  attention: 'bg-warning-soft text-warning-strong ring-2 ring-warning-strong/40',
  failed: 'bg-danger-soft text-danger-strong ring-2 ring-danger-strong/40',
  stopped: 'bg-muted text-muted-foreground',
};

function Marker({ state }: { state: StepState }) {
  return (
    <span className={cn('relative z-10 flex size-8 shrink-0 items-center justify-center rounded-full', marker[state])} aria-hidden>
      {state === 'done' && <CheckIcon className="size-4" strokeWidth={3} />}
      {state === 'current' && <span className="size-2.5 rounded-full bg-primary" />}
      {state === 'attention' && <CircleAlertIcon className="size-4" />}
      {(state === 'failed' || state === 'stopped') && <XIcon className="size-4" strokeWidth={3} />}
    </span>
  );
}

export function StatusSteps({ steps, label, className }: { steps: Step[]; label: string; className?: string }) {
  return (
    <ol
      aria-label={label}
      className={cn('grid grid-cols-[repeat(var(--steps),minmax(0,1fr))]', className)}
      style={{ '--steps': steps.length } as CSSProperties}
    >
      {steps.map((s, i) => {
        const next = steps[i + 1];
        return (
          <li key={s.label} aria-current={s.state === 'current' || s.state === 'attention' ? 'step' : undefined} className="relative flex flex-col gap-2.5">
            {next && (
              // Линия к следующему шагу: закрашена, если процесс до него дошёл
              <span
                aria-hidden
                className={cn('absolute top-4 left-8 h-0.5 w-[calc(100%-2rem)]', REACHED.includes(next.state) ? 'bg-primary' : 'bg-border')}
              />
            )}
            <Marker state={s.state} />
            <div className="flex flex-col gap-0.5 pr-2">
              <p className={cn('text-[0.9375rem] leading-snug font-medium', s.state === 'upcoming' && 'text-muted-foreground')}>
                {s.label}
                <span className="sr-only">: {SR[s.state]}</span>
              </p>
              {s.hint && <p className="text-sm text-muted-foreground">{s.hint}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
