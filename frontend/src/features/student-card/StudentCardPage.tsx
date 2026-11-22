import { ExternalLinkIcon, UserRoundIcon } from 'lucide-react';
import { Link } from 'react-router';
import type { components } from '@/api/requests';
import { studyFormLabels } from '@/features/profile/labels';
import { formatDate } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { QR_URL, useStudentCard } from './queries';

type StudentCard = components['schemas']['StudentCard'];

/** Электронный студенческий учебного прототипа (D60): без фото, с крупной пометкой, QR ведёт на нашу /verify. */
export function StudentCardPage() {
  const card = useStudentCard();
  return (
    <>
      <PageHeader title="Студенческий" />
      <QueryView query={card}>
        {(c) => (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,28rem)_minmax(0,22rem)] lg:items-start">
            <Card c={c} />
            <Section title="Как проверяют">
              <p className="text-sm text-muted-foreground">
                QR и код ведут на страницу проверки на этом сайте. Там видны фамилия с инициалами, факультет, курс и срок действия.
              </p>
              <p className="text-sm text-muted-foreground">Срок продлевается, когда вы открываете эту страницу в новом учебном году.</p>
              <Button asChild variant="outline" className="self-start">
                <Link to={c.verify_url} target="_blank" rel="noopener">
                  <ExternalLinkIcon aria-hidden />
                  Страница проверки
                  <span className="sr-only"> (в новой вкладке)</span>
                </Link>
              </Button>
            </Section>
          </div>
        )}
      </QueryView>
    </>
  );
}

function Card({ c }: { c: StudentCard }) {
  const fields: { label: string; value: string | number; wide?: boolean }[] = [
    { label: 'Факультет', value: c.faculty_name, wide: true },
    { label: 'Направление', value: `${c.program_code} ${c.program_name}`, wide: true },
    { label: 'Курс', value: c.course },
    { label: 'Форма обучения', value: studyFormLabels[c.study_form] },
    { label: 'Номер билета', value: c.number },
    { label: 'Действителен до', value: formatDate(c.valid_until, { withYear: true }).replace(/ г\.$/, '\u00a0г.') },
  ];
  return (
    <article aria-labelledby="student-card-title" className="overflow-hidden rounded-xl border bg-card">
      {/* Пометка — первой и крупно: карточка не выдаёт себя за документ вуза (D60) */}
      <div className="border-b bg-warning-soft px-5 py-3 text-warning-strong">
        <p className="text-lg font-semibold">Учебный прототип</p>
        <p className="text-sm">Не является документом, данные вымышлены</p>
      </div>
      <div className="flex flex-col gap-5 p-5">
        <div className="flex items-center gap-3">
          <img
            src="/brand/logo-80.png"
            srcSet="/brand/logo-80.png 2x, /brand/logo-160.png 4x"
            width={40}
            height={40}
            alt=""
            className="size-10 shrink-0"
          />
          <div className="min-w-0">
            <h2 id="student-card-title" className="leading-tight font-semibold">
              Студенческий билет
            </h2>
            <p className="text-sm text-muted-foreground">Мой вуз</p>
          </div>
        </div>
        <div className="flex items-start gap-4">
          {/* Фото не храним (security.md §2) — нейтральный силуэт */}
          <div aria-hidden className="flex h-28 w-24 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <UserRoundIcon className="size-12" strokeWidth={1.5} />
          </div>
          <p className="min-w-0 text-lg leading-snug font-semibold break-words">{c.full_name}</p>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
          {fields.map((f) => (
            <div key={f.label} className={cn('min-w-0', f.wide && 'col-span-2')}>
              <dt className="text-sm text-muted-foreground">{f.label}</dt>
              <dd className="break-words">{f.value}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-col gap-4 border-t pt-5 min-[400px]:flex-row min-[400px]:items-center">
          <img src={QR_URL} width={176} height={176} alt={`QR-код страницы проверки, код ${c.code}`} className="size-44 shrink-0 rounded-md" />
          <div className="flex min-w-0 flex-col gap-3">
            <p>Покажите QR — по нему откроется страница проверки</p>
            <p className="flex flex-col">
              <span className="text-sm text-muted-foreground">Код проверки</span>
              <span className="font-mono text-lg font-semibold tracking-widest break-all">{c.code}</span>
            </p>
          </div>
        </div>
      </div>
    </article>
  );
}
