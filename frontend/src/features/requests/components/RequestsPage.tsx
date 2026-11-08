import { ChevronRightIcon, ClockIcon, MessageSquareIcon, PlusIcon, SearchIcon } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';
import { categoryLabels, slaLabel, statusLabel, statusTones } from '../labels';
import { useMyApplications, useServiceTypes, type ApplicationSummary, type ServiceType } from '../queries';

export function RequestsPage() {
  const [search, setSearch] = useState('');
  return (
    <>
      <PageHeader
        title="Заявки"
        subtitle="Справки, заявления и вопросы в деканат"
        actions={
          <Button asChild>
            <a href="#catalog">
              <PlusIcon aria-hidden />
              Новая заявка
            </a>
          </Button>
        }
      />

      <section aria-labelledby="my-title" className="flex flex-col gap-4">
        <h2 id="my-title" className="sr-only">
          Мои заявки
        </h2>
        <Tabs defaultValue="all">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <TabsList aria-label="Какие заявки показать">
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="answered">Пришёл ответ</TabsTrigger>
            </TabsList>
            <div className="relative sm:w-72">
              <Label htmlFor="request-search" className="sr-only">
                Поиск по номеру заявки
              </Label>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="request-search"
                type="search"
                inputMode="numeric"
                placeholder="Номер заявки"
                className="pl-10"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>
          <TabsContent value="all">
            <ApplicationList answered={false} search={search} />
          </TabsContent>
          <TabsContent value="answered">
            <ApplicationList answered search={search} />
          </TabsContent>
        </Tabs>
      </section>

      <Catalog />
    </>
  );
}

function ApplicationList({ answered, search }: { answered: boolean; search: string }) {
  const applications = useMyApplications(answered);
  const digits = search.replace(/\D/g, '');
  return (
    <QueryView
      query={applications}
      isEmpty={(data) => data.items.length === 0}
      empty={
        answered ? (
          <EmptyState title="Ответов пока нет" description="Когда деканат ответит или попросит уточнить, заявка появится здесь." />
        ) : (
          <EmptyState title="Заявок пока нет" description="Выберите услугу в каталоге ниже — заявка появится в этом списке." />
        )
      }
    >
      {(data) => {
        const items = digits ? data.items.filter((a) => a.number.includes(digits)) : data.items;
        if (items.length === 0) return <EmptyState title={`Заявок с номером «${search.trim()}» нет`} description="Проверьте номер или очистите поиск." />;
        return (
          <ul className="divide-y overflow-hidden rounded-xl border bg-card">
            {items.map((a) => (
              <ApplicationRow key={a.id} application={a} />
            ))}
          </ul>
        );
      }}
    </QueryView>
  );
}

function ApplicationRow({ application: a }: { application: ApplicationSummary }) {
  return (
    <li>
      <Link
        to={`/requests/${a.id}`}
        className="flex items-center gap-4 px-4 py-4 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset md:px-5"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="min-w-0 font-semibold">{a.service_type.title}</p>
            <StatusBadge tone={statusTones[a.status]}>{statusLabel(a.status, a.service_type.kind)}</StatusBadge>
            {a.overdue && <StatusBadge tone="danger">Просрочено</StatusBadge>}
          </div>
          <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
            <span>№ {a.number}</span>
            <span>подана {formatDate(a.created_at)}</span>
            {a.due_at && <span className={cn(a.overdue && 'font-medium text-danger-strong')}>срок — до {formatDate(a.due_at)}</span>}
          </p>
          {a.last_message_from === 'staff' && (
            <p className="flex items-center gap-1.5 text-sm font-medium text-info-strong">
              <MessageSquareIcon className="size-4" aria-hidden />
              Сообщение от деканата
            </p>
          )}
        </div>
        <ChevronRightIcon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
      </Link>
    </li>
  );
}

function Catalog() {
  const serviceTypes = useServiceTypes();
  return (
    <section id="catalog" aria-labelledby="catalog-title" className="mt-12 flex scroll-mt-20 flex-col gap-5">
      <div>
        <h2 id="catalog-title" className="text-xl font-semibold">
          Подать заявку
        </h2>
        <p className="mt-1 text-muted-foreground">Выберите услугу — статус заявки появится в списке выше.</p>
      </div>
      <QueryView query={serviceTypes} isEmpty={(list) => list.length === 0} empty={<EmptyState title="Услуги пока недоступны" description="Загляните позже." />}>
        {(list) =>
          (Object.keys(categoryLabels) as ServiceType['category'][]).map((category) => {
            const items = list.filter((s) => s.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="flex flex-col gap-3">
                <h3 className="font-semibold">{categoryLabels[category]}</h3>
                <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {items.map((s) => (
                    <li key={s.id} className="flex">
                      <Link
                        to={`/requests/new/${s.id}`}
                        className="flex flex-1 flex-col gap-1.5 rounded-xl border bg-card p-4 transition-colors outline-none hover:border-primary/50 focus-visible:ring-[3px] focus-visible:ring-ring/50 md:p-5"
                      >
                        <span className="font-semibold">{s.title}</span>
                        <span className="text-sm text-muted-foreground">{s.description}</span>
                        <span className={cn('mt-auto flex items-center gap-1.5 pt-2 text-sm', s.sla_days === 0 ? 'font-medium text-success-strong' : 'text-muted-foreground')}>
                          <ClockIcon className="size-4" aria-hidden />
                          {slaLabel(s.sla_days)}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        }
      </QueryView>
    </section>
  );
}
