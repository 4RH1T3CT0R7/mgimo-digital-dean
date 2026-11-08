import { ConstructionIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { EmptyState } from './empty-state';
import { PageHeader } from './page-header';

/** Заглушка раздела, пока его делает владелец фичи (T09–T16, T26). Номер задачи — только в разметке, не в тексте для жюри. */
export function StubPage({ title, task, children }: { title: string; task: string; children?: ReactNode }) {
  return (
    <div data-task={task}>
      <PageHeader title={title} />
      {children}
      <EmptyState
        title={`Раздел «${title}» в прототипе ещё не готов`}
        illustration={
          <div className="flex size-12 items-center justify-center rounded-full bg-warning-soft text-warning-strong" aria-hidden>
            <ConstructionIcon className="size-6" />
          </div>
        }
      />
    </div>
  );
}
