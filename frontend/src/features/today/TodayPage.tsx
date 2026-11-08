import { formatDate } from '@/shared/lib/format';
import { AsOf } from '@/shared/ui/as-of';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { useWeekSchedule } from './queries';

// Главная-заглушка: показывает работу QueryView и моков (?scenario=…). Полноценный экран — T09.
export function TodayPage() {
  const schedule = useWeekSchedule();
  return (
    <>
      <PageHeader title="Сегодня" subtitle="Главный экран появится в задаче T09" />
      <section aria-labelledby="week-title" className="flex flex-col gap-3">
        <h2 id="week-title" className="font-semibold">
          Занятия на этой неделе
        </h2>
        <QueryView
          query={schedule}
          isEmpty={(data) => data.lessons.length === 0}
          empty={<EmptyState title="На этой неделе занятий нет" />}
        >
          {(data) => (
            <>
              <ul className="flex flex-col gap-2">
                {data.lessons.slice(0, 5).map((lesson) => (
                  <li key={`${lesson.id}-${lesson.status}`} className="rounded-lg border bg-card px-4 py-3">
                    <p className="text-sm text-muted-foreground">
                      {formatDate(lesson.date)}, {lesson.start_time}–{lesson.end_time}
                    </p>
                    <p className="font-medium">{lesson.discipline.name}</p>
                  </li>
                ))}
              </ul>
              <AsOf date={data.as_of} />
            </>
          )}
        </QueryView>
      </section>
    </>
  );
}
