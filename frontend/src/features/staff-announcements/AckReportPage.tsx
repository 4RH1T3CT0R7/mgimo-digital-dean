import { useParams } from 'react-router';
import type { components } from '@/api/notifications';
import { useMe } from '@/features/auth/queries';
import { formatDateTime } from '@/shared/lib/format';
import { BackLink } from '@/shared/ui/back-link';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { AudienceLabel } from './AudienceField';
import { useAckReport, useAnnouncement } from './queries';

type AckStudent = components['schemas']['AckStudent'];

function StudentList({ students, empty }: { students: AckStudent[]; empty: string }) {
  if (students.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="divide-y">
      {students.map((student) => (
        <li key={student.id} className="py-3 wrap-anywhere first:pt-0 last:pb-0">
          <p className="font-medium">{student.short_name}</p>
          <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{student.group_name}</span>
            {student.acked_at && <time dateTime={student.acked_at}>{formatDateTime(student.acked_at)}</time>}
          </div>
        </li>
      ))}
    </ul>
  );
}

function AckReport({ id }: { id: string }) {
  const query = useAckReport(id);
  return (
    <QueryView query={query}>
      {(report) => (
        <section aria-label="Отчёт об ознакомлении" className="flex flex-col gap-5">
          <p className="text-xl font-semibold">
            Ознакомились: {report.acked.length} из {report.total}
          </p>
          <div className="grid gap-5 md:grid-cols-2">
            <Section title="Ознакомились">
              <StudentList students={report.acked} empty="Пока никто не подтвердил ознакомление." />
            </Section>
            <Section title="Ещё нет">
              <StudentList students={report.not_acked} empty="Нет студентов, ожидающих подтверждения." />
            </Section>
          </div>
        </section>
      )}
    </QueryView>
  );
}

export function AckReportPage() {
  const { id = '' } = useParams();
  const query = useAnnouncement(id);
  const me = useMe().data;
  return (
    <>
      <BackLink to="/staff/announcements">Все объявления</BackLink>
      <QueryView query={query}>
        {(item) =>
          item ? (
            <>
              <PageHeader
                title={<span className="wrap-anywhere">{item.title}</span>}
                subtitle={<AudienceLabel audience={item.audience} admin={me?.role === 'admin'} />}
              />
              <Section title="Текст объявления">
                <p className="whitespace-pre-wrap wrap-anywhere">{item.body}</p>
              </Section>
              <div className="mt-10">
                {item.requires_ack ? <AckReport id={item.id} /> : <EmptyState title="Подтверждение не требуется" />}
              </div>
            </>
          ) : (
            <EmptyState title="Объявление не найдено" description="Проверьте ссылку или вернитесь к списку объявлений." />
          )
        }
      </QueryView>
    </>
  );
}
