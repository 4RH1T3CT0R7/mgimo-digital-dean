import { useParams } from 'react-router';
import type { components } from '@/api/notifications';
import { useMe } from '@/features/auth/queries';
import { formatDateTime } from '@/shared/lib/format';
import { BackLink } from '@/shared/ui/back-link';
import { EmptyState } from '@/shared/ui/empty-state';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { AudienceLabel } from './AudienceField';
import { useAckReport, useAnnouncement } from './queries';

type AckStudent = components['schemas']['AckStudent'];

function StudentList({ title, students, empty }: { title: string; students: AckStudent[]; empty: string }) {
  return (
    <section aria-label={title} className="min-w-0 rounded-xl border bg-card p-4">
      <h3 className="mb-2 font-semibold">{title}</h3>
      {students.length > 0 ? (
        <ul className="divide-y">
          {students.map((student) => (
            <li key={student.id} className="py-2 wrap-anywhere">
              <p className="font-medium">{student.short_name}</p>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                <span>{student.group_name}</span>
                {student.acked_at && <time dateTime={student.acked_at}>{formatDateTime(student.acked_at)}</time>}
              </div>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted-foreground">{empty}</p>}
    </section>
  );
}

function AckReport({ id }: { id: string }) {
  const query = useAckReport(id);
  return (
    <QueryView query={query}>
      {(report) => (
        <section aria-label="Отчёт об ознакомлении" className="space-y-3">
          <h2 className="text-lg font-semibold">Ознакомились: {report.acked.length} из {report.total}</h2>
          <div className="grid gap-3 md:grid-cols-2">
            <StudentList title="Ознакомились" students={report.acked} empty="Пока никто не подтвердил ознакомление." />
            <StudentList title="Ещё нет" students={report.not_acked} empty="Нет студентов, ожидающих подтверждения." />
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
        {(item) => item ? (
          <>
            <PageHeader title={<span className="wrap-anywhere">{item.title}</span>}
              subtitle={<AudienceLabel audience={item.audience} admin={me?.role === 'admin'} />} />
            <p className="mb-5 rounded-xl border bg-card p-4 whitespace-pre-wrap wrap-anywhere">{item.body}</p>
            {item.requires_ack ? <AckReport id={item.id} /> : <EmptyState title="Подтверждение не требуется" />}
          </>
        ) : <EmptyState title="Объявление не найдено" description="Проверьте ссылку или вернитесь к списку объявлений." />}
      </QueryView>
    </>
  );
}
