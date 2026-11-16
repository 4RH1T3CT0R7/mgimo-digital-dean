import { ExternalLinkIcon } from 'lucide-react';
import { Link } from 'react-router';
import { useProfile } from '@/features/profile/queries';
import { askDeanPath } from '@/features/requests/links';
import { RoomLink } from '@/features/schedule/components/RoomLink';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { campusMapUrl, deanHours, deanOffices, resourceGroups } from './resources';

export function UsefulPage() {
  return (
    <>
      <PageHeader title="Полезное" subtitle="Деканат вашего факультета и официальные страницы МГИМО" />
      <div className="flex max-w-3xl flex-col gap-10">
        <DeanCard />
        {resourceGroups.map((group) => (
          <section key={group.title} aria-labelledby={`useful-${group.title}`} className="flex flex-col gap-3">
            <h2 id={`useful-${group.title}`} className="text-xl font-semibold">
              {group.title}
            </h2>
            <ul className="divide-y overflow-hidden rounded-xl border bg-card">
              {group.links.map((link) => (
                <li key={link.url}>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex min-h-14 items-center gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:ring-inset md:px-5"
                  >
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="font-medium text-primary">{link.title}</span>
                      <span className="truncate text-sm text-muted-foreground">{link.url.replace(/^https:\/\//, '').replace(/\/$/, '')}</span>
                    </span>
                    <ExternalLinkIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="sr-only"> (в новой вкладке)</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </>
  );
}

/** Карточка деканата своего факультета (факультет — из профиля). Ссылки сюда: вход и готовая заявка (/useful#dean). */
function DeanCard() {
  const profile = useProfile();
  return (
    <QueryView query={profile}>
      {(data) => {
        const office = deanOffices[data.faculty.short_name];
        return (
          <section id="dean" aria-labelledby="dean-title" className="flex scroll-mt-20 flex-col gap-5 rounded-xl border bg-card p-5 md:p-6">
            <div>
              <h2 id="dean-title" className="text-xl font-semibold">
                Деканат {data.faculty.short_name}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">{data.faculty.name}</p>
            </div>
            {office ? (
              <dl className="grid gap-5 sm:grid-cols-[auto_auto_minmax(0,1fr)] sm:gap-x-10">
                <div>
                  <dt className="text-sm text-muted-foreground">Кабинет</dt>
                  <dd className="mt-1">
                    <RoomLink room={office.room} />
                  </dd>
                </div>
                <div>
                  <dt className="text-sm text-muted-foreground">Часы приёма</dt>
                  <dd className="mt-1 flex flex-col gap-0.5 text-sm">
                    {deanHours.map(([days, time]) => (
                      <span key={days}>
                        {days}: {time}
                      </span>
                    ))}
                  </dd>
                </div>
                <div className="min-w-0">
                  <dt className="text-sm text-muted-foreground">Почта</dt>
                  <dd className="mt-1 text-sm break-words">{office.email}</dd>
                </div>
              </dl>
            ) : (
              <p className="text-sm">
                Кабинет деканата вашего факультета можно найти на{' '}
                <a href={campusMapUrl} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
                  карте МГИМО<span className="sr-only"> (в новой вкладке)</span>
                </a>
                .
              </p>
            )}
            <p className="text-[0.8125rem] text-muted-foreground">Учебный прототип: кабинет — настоящая аудитория МГИМО, часы приёма и почта вымышлены.</p>
            <Button asChild variant="outline" className="sm:self-start">
              <Link to={askDeanPath('', 'Другое')}>Задать вопрос в деканат</Link>
            </Button>
          </section>
        );
      }}
    </QueryView>
  );
}
