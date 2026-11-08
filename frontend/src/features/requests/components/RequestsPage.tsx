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

const cardLink =
  'rounded-xl border bg-card p-4 transition-colors outline-none hover:bg-accent/60 focus-visible:ring-[3px] focus-visible:ring-ring/50';

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

      <section aria-labelledby="my-title" className="flex flex-col gap-3">
        <h2 id="my-title" className="text-lg font-semibold">
          Мои заявки
        </h2>
        <Tabs defaultValue="all">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <TabsList aria-label="Какие заявки показать">
              <TabsTrigger value="all">Все</TabsTrigger>
              <TabsTrigger value="answered">Пришёл ответ</TabsTrigger>
            </TabsList>
            <div className="relative sm:w-64">
              <Label htmlFor="request-search" className="sr-only">
                Поиск по номеру заявки
              </Label>
              <SearchIcon className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
              <Input
                id="request-search"
                type="search"
                inputMode="numeric"
                placeholder="Номер заявки"
                className="pl-9"
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
          <ul className="flex flex-col gap-2">
            {items.map((a) => (
              <ApplicationCard key={a.id} application={a} />
            ))}
          </ul>
        );
      }}
    </QueryView>
  );
}

function ApplicationCard({ application: a }: { application: ApplicationSummary }) {
  return (
    <li>
      <Link to={`/requests/${a.id}`} className={cn(cardLink, 'flex items-center gap-3')}>
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <p className="min-w-0 font-medium">{a.service_type.title}</p>
            <div className="flex flex-wrap gap-1.5">
              <StatusBadge tone={statusTones[a.status]}>{statusLabel(a.status, a.service_type.kind)}</StatusBadge>
              {a.overdue && <StatusBadge tone="danger">Просрочено</StatusBadge>}
            </div>
          </div>
          <p className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>№ {a.number}</span>
            <span>подана {formatDate(a.created_at)}</span>
            {a.due_at && <span className={cn(a.overdue && 'font-medium text-danger-strong')}>срок — до {formatDate(a.due_at)}</span>}
          </p>
          {a.last_message_from === 'staff' && (
            <p className="flex items-center gap-1.5 text-sm text-info-strong">
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
    <section id="catalog" aria-labelledby="catalog-title" className="mt-10 flex scroll-mt-20 flex-col gap-4">
      <div>
        <h2 id="catalog-title" className="text-lg font-semibold">
          Подать заявку
        </h2>
        <p className="text-sm text-muted-foreground">Выберите услугу — статус заявки появится в списке выше.</p>
      </div>
      <QueryView query={serviceTypes} isEmpty={(list) => list.length === 0} empty={<EmptyState title="Услуги пока недоступны" description="Загляните позже." />}>
        {(list) =>
          (Object.keys(categoryLabels) as ServiceType['category'][]).map((category) => {
            const items = list.filter((s) => s.category === category);
            if (items.length === 0) return null;
            return (
              <div key={category} className="flex flex-col gap-2">
                <h3 className="text-sm font-semibold tracking-wide text-muted-foreground uppercase">{categoryLabels[category]}</h3>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {items.map((s) => (
                    <li key={s.id} className="flex">
                      <Link to={`/requests/new/${s.id}`} className={cn(cardLink, 'flex flex-1 flex-col gap-1')}>
                        <span className="font-medium">{s.title}</span>
                        <span className="text-sm text-muted-foreground">{s.description}</span>
                        <span className={cn('mt-auto flex items-center gap-1.5 pt-1 text-sm', s.sla_days === 0 ? 'font-medium text-success-strong' : 'text-muted-foreground')}>
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
