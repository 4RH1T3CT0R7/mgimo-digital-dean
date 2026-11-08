import { SearchIcon, ThumbsUpIcon } from 'lucide-react';
import type { FormEvent } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import type { components } from '@/api/requests';
import { FacultyFilter, useFacultyFilter } from '@/app/layout/FacultyFilter';
import { formatDate, plural } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { LoadingState } from '@/shared/ui/loading-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { StatusBadge } from '@/shared/ui/status-badge';
import { LIST_FILTERS, statusLabel, statusTone, type ListFilter } from '../labels';
import { useServiceTypes, useStaffApplications, useStaffStats } from '../queries';

type Summary = components['schemas']['StaffApplicationSummary'];
type Stats = components['schemas']['StaffStats'];

const ALL = 'all';

const COUNTERS: { key: keyof Stats; label: string; filter: ListFilter }[] = [
  { key: 'submitted', label: 'Новые', filter: 'submitted' },
  { key: 'in_progress', label: 'В работе', filter: 'in_progress' },
  { key: 'needs_info', label: 'Ждут студента', filter: 'needs_info' },
  { key: 'overdue', label: 'Просрочены', filter: 'overdue' },
  { key: 'ready_today', label: 'Готово сегодня', filter: 'ready' },
];

export function ApplicationsPage() {
  const [params, setParams] = useSearchParams();
  const { search } = useLocation();
  const facultyId = useFacultyFilter();
  const filter = LIST_FILTERS.find((f) => f.value === params.get('status'))?.value;
  const service = params.get('service') ?? undefined;
  const q = params.get('q') ?? '';
  const overdue = filter === 'overdue';

  const stats = useStaffStats();
  const serviceTypes = useServiceTypes();
  const applications = useStaffApplications({
    // «Просрочены» — незавершённые заявки с прошедшим сроком: берём submitted + in_progress, оставляем overdue
    status: overdue ? ['submitted', 'in_progress'] : filter && [filter],
    service_type_id: service,
    q: q || undefined,
    faculty_id: facultyId,
  });
  const visible = (items: Summary[]) => (overdue ? items.filter((a) => a.overdue) : items);
  const filtered = Boolean(filter || service || q || facultyId);

  function setParam(key: string, value: string | undefined) {
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value);
      else next.delete(key);
      return next;
    });
  }

  function onSearch(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setParam('q', String(new FormData(e.currentTarget).get('q') ?? '').trim());
  }

  return (
    <>
      <PageHeader title="Заявки" subtitle="Сначала просроченные, затем по сроку готовности" />

      <section aria-label="Счётчики" className="mb-6">
        <QueryView query={stats} loading={<LoadingState rows={1} />}>
          {(s) => (
            <>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
                {COUNTERS.map((c) => {
                  const active = filter === c.filter;
                  return (
                    <li key={c.key}>
                      <button
                        type="button"
                        aria-pressed={active}
                        aria-label={`${c.label}: ${s[c.key]}`}
                        onClick={() => setParam('status', active ? undefined : c.filter)}
                        className={cn(
                          'flex h-full w-full items-baseline gap-2 rounded-xl border bg-card px-4 py-3 text-left transition-colors hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none sm:flex-col sm:gap-1 sm:py-4',
                          active && 'border-primary bg-accent',
                        )}
                      >
                        <span className={cn('text-xl font-semibold tabular-nums sm:text-2xl', c.key === 'overdue' && s.overdue > 0 && 'text-danger-strong')}>
                          {s[c.key]}
                        </span>
                        <span className="text-sm text-muted-foreground">{c.label}</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <p className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
                <ThumbsUpIcon className="size-4 shrink-0" aria-hidden />
                {s.feedback_total > 0
                  ? `Оценки студентов: помогло ${s.feedback_helpful} из ${s.feedback_total} ${plural(s.feedback_total, ['ответа', 'ответов', 'ответов'])} (${Math.round((s.feedback_helpful / s.feedback_total) * 100)} %)`
                  : 'Студенты ещё не оценивали ответы деканата'}
              </p>
            </>
          )}
        </QueryView>
      </section>

      <div className="mb-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div className="flex flex-col gap-2">
          <Label htmlFor="status-filter">Статус</Label>
          <Select value={filter ?? ALL} onValueChange={(v) => setParam('status', v === ALL ? undefined : v)}>
            <SelectTrigger id="status-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все статусы</SelectItem>
              {LIST_FILTERS.map((f) => (
                <SelectItem key={f.value} value={f.value}>
                  {f.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-2">
          <Label htmlFor="service-filter">Услуга</Label>
          <Select value={service ?? ALL} onValueChange={(v) => setParam('service', v === ALL ? undefined : v)} disabled={!serviceTypes.data}>
            <SelectTrigger id="service-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>Все услуги</SelectItem>
              {serviceTypes.data?.map((t) => (
                <SelectItem key={t.id} value={t.id}>
                  {t.title}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <form role="search" onSubmit={onSearch} className="flex flex-col gap-2 sm:col-span-2 lg:col-span-1">
          <Label htmlFor="search">Поиск</Label>
          <div className="flex gap-2">
            <Input key={q} id="search" name="q" type="search" defaultValue={q} maxLength={100} placeholder="Номер заявки или ФИО" />
            <Button type="submit" variant="outline" size="icon" aria-label="Найти">
              <SearchIcon aria-hidden />
            </Button>
          </div>
        </form>
        <FacultyFilter />
      </div>

      <QueryView
        query={applications}
        isEmpty={(d) => visible(d.items).length === 0}
        empty={
          <EmptyState
            title={filtered ? 'Ничего не найдено' : 'Заявок пока нет'}
            description={filtered ? 'Измените фильтры или запрос поиска.' : 'Новые заявки студентов появятся здесь.'}
          />
        }
      >
        {(d) => (
          <>
            <ApplicationList items={visible(d.items)} back={`/staff${search}`} />
            {d.total > d.items.length && (
              <p className="mt-3 text-sm text-muted-foreground">
                Показаны первые {d.items.length} из {d.total}. Уточните фильтры или поиск.
              </p>
            )}
          </>
        )}
      </QueryView>
    </>
  );
}

function Due({ a }: { a: Summary }) {
  if (!a.due_at) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-2 gap-y-1">
      {formatDate(a.due_at)}
      {a.overdue && <StatusBadge tone="danger">Просрочено</StatusBadge>}
    </span>
  );
}

function Status({ a }: { a: Summary }) {
  return <StatusBadge tone={statusTone(a.status)}>{statusLabel(a.status, a.service_type.kind)}</StatusBadge>;
}

// Компьютер — таблица, телефон — карточки (вторая копия скрыта CSS и не читается экранными чтецами)
function ApplicationList({ items, back }: { items: Summary[]; back: string }) {
  const linkProps = (a: Summary) => ({ to: `/staff/requests/${a.id}`, state: { back } });
  return (
    <>
      <div className="hidden overflow-x-auto rounded-xl border bg-card px-5 md:block">
        <table className="w-full text-[0.9375rem]">
          <caption className="sr-only">Заявки</caption>
          <thead>
            <tr className="border-b text-left text-sm text-muted-foreground">
              <th scope="col" className="py-3.5 pr-4 font-medium">Номер</th>
              <th scope="col" className="py-3.5 pr-4 font-medium">Услуга</th>
              <th scope="col" className="py-3.5 pr-4 font-medium">Студент</th>
              <th scope="col" className="py-3.5 pr-4 font-medium">Статус</th>
              <th scope="col" className="py-3.5 font-medium">Срок</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b align-top last:border-0">
                <td className="py-3.5 pr-4 whitespace-nowrap">
                  <Link {...linkProps(a)} className="font-medium text-primary underline-offset-4 hover:underline focus-visible:underline">
                    № {a.number}
                  </Link>
                </td>
                <td className="py-3.5 pr-4">{a.service_type.title}</td>
                <td className="py-3.5 pr-4">
                  {a.student.full_name}
                  <span className="block text-muted-foreground">{a.student.group_name}</span>
                </td>
                <td className="py-3.5 pr-4">
                  <Status a={a} />
                </td>
                <td className="py-3.5">
                  <Due a={a} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y overflow-hidden rounded-xl border bg-card md:hidden">
        {items.map((a) => (
          <li key={a.id}>
            <Link
              {...linkProps(a)}
              className="flex flex-col gap-1.5 px-4 py-4 transition-colors hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset"
            >
              <span className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-semibold">№ {a.number}</span>
                <Status a={a} />
              </span>
              <span className="font-medium">{a.service_type.title}</span>
              <span className="text-sm text-muted-foreground">
                {a.student.full_name}, {a.student.group_name}
              </span>
              <span className="text-sm">
                Срок: <Due a={a} />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
