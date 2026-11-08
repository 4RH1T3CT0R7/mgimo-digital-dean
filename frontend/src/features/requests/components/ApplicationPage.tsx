import { CircleAlertIcon, DownloadIcon, FileCheckIcon, FileIcon, LoaderCircleIcon, SendIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError, apiErrorMessage } from '@/shared/lib/errors';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog';
import { EmptyState } from '@/shared/ui/empty-state';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { formatSize, roleLabels, statusLabel, statusTones } from '../labels';
import {
  useCancelApplication,
  useDownloadAttachment,
  useMyApplication,
  usePostMessage,
  useSendFeedback,
  useServiceTypes,
  useUploadAttachment,
  type Application,
} from '../queries';
import { CertificateCard } from './CertificateCard';
import { FileDrop } from './FileDrop';
import { BackToRequests } from './NewRequestPage';

type Attachment = Application['attachments'][number];

export function ApplicationPage() {
  const { id = '' } = useParams();
  const application = useMyApplication(id);
  const notFound = application.error instanceof ApiError && [400, 404].includes(application.error.status);

  return (
    <>
      <BackToRequests />
      {notFound ? (
        <EmptyState
          title="Заявка не найдена"
          description="Возможно, ссылка устарела. Все ваши заявки — в списке."
          action={
            <Button asChild variant="outline">
              <Link to="/requests">К списку заявок</Link>
            </Button>
          }
        />
      ) : (
        <QueryView query={application}>{(data) => <ApplicationDetails application={data} />}</QueryView>
      )}
    </>
  );
}

/** Последний комментарий деканата к статусу (просьба уточнить, причина отказа). */
function lastComment(application: Application, status: Application['status']) {
  return application.status_history.findLast((h) => h.status === status)?.comment;
}

function ApplicationDetails({ application: a }: { application: Application }) {
  const results = a.attachments.filter((f) => f.is_result);
  const files = a.attachments.filter((f) => !f.is_result);
  // Можно ли приложить файл — по каталогу; каталог не загрузился — просто не показываем выбор файла
  const allowsFiles = useServiceTypes().data?.find((s) => s.id === a.service_type.id)?.attachments.allowed ?? false;
  const canUpload = allowsFiles && (a.status === 'submitted' || a.status === 'needs_info');

  return (
    <>
      <PageHeader title={`Заявка № ${a.number}`} subtitle={a.service_type.title} actions={a.status === 'submitted' && <CancelDialog application={a} />} />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
        <StatusBadge tone={statusTones[a.status]} className="text-sm">
          <span className="sr-only">Статус: </span>
          {statusLabel(a.status, a.service_type.kind)}
        </StatusBadge>
        {a.overdue && <StatusBadge tone="danger">Просрочено</StatusBadge>}
        <span className="text-muted-foreground">Подана {formatDateTime(a.created_at)}</span>
        {a.due_at && <span className={cn(a.overdue ? 'font-medium text-danger-strong' : 'text-muted-foreground')}>Срок готовности: до {formatDate(a.due_at)}</span>}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          {a.status === 'needs_info' && (
            <Notice tone="warning" title={`Деканат просит уточнить: ${lastComment(a, 'needs_info') ?? 'посмотрите сообщения ниже'}`}>
              Ответьте сообщением{canUpload && ' или приложите файл'} — заявка вернётся в работу.{' '}
              <a href="#message" className="font-medium underline underline-offset-4">
                Ответить
              </a>
            </Notice>
          )}
          {a.status === 'rejected' && (
            <Notice tone="danger" title="Заявка отклонена">
              {lastComment(a, 'rejected') ?? 'Подробности — в переписке с деканатом.'}
            </Notice>
          )}
          <CertificateCard application={a} />
          {results.length > 0 && (
            <section aria-labelledby="result-title" className="flex flex-col gap-3 rounded-xl border border-success-strong/25 bg-success-soft p-5">
              <h2 id="result-title" className="flex items-center gap-2 text-lg font-semibold">
                <FileCheckIcon className="size-5 text-success-strong" aria-hidden />
                Документ от деканата
              </h2>
              <AttachmentList applicationId={a.id} items={results} />
            </section>
          )}
          <Chat application={a} />
          {(a.status === 'ready' || a.status === 'rejected') && a.service_type.kind !== 'instant_certificate' && <FeedbackCard application={a} />}
        </div>

        <div className="flex min-w-0 flex-col gap-6">
          <Section title="Данные заявки">
            {a.fields.length === 0 && !a.comment ? (
              <p className="text-sm text-muted-foreground">Дополнительных данных нет.</p>
            ) : (
              <dl className="flex flex-col gap-3 text-sm">
                {a.fields.map((f) => (
                  <div key={f.key}>
                    <dt className="text-muted-foreground">{f.label}</dt>
                    <dd className="break-words whitespace-pre-wrap">{/^\d{4}-\d{2}-\d{2}$/.test(f.value) ? formatDate(f.value, { withYear: true }) : f.value}</dd>
                  </div>
                ))}
                {a.comment && (
                  <div>
                    <dt className="text-muted-foreground">Комментарий</dt>
                    <dd className="break-words whitespace-pre-wrap">{a.comment}</dd>
                  </div>
                )}
              </dl>
            )}
          </Section>

          {(files.length > 0 || canUpload) && (
            <Section title="Вложения">
              {files.length > 0 && <AttachmentList applicationId={a.id} items={files} />}
              {canUpload && <UploadMore applicationId={a.id} />}
            </Section>
          )}

          <Section title="История">
            <ol className="ml-1.5 flex flex-col gap-4 border-l-2 pl-5">
              {a.status_history.map((h, i) => (
                <li key={`${h.status}-${h.at}`} className="relative">
                  <span
                    className={cn(
                      'absolute top-1 -left-[1.75rem] size-3 rounded-full ring-4 ring-card',
                      i === a.status_history.length - 1 ? 'bg-primary' : 'bg-muted-foreground/40',
                    )}
                    aria-hidden
                  />
                  <p className="text-sm font-medium">{statusLabel(h.status, a.service_type.kind)}</p>
                  <p className="text-xs text-muted-foreground">
                    <time dateTime={h.at}>{formatDateTime(h.at)}</time> · {roleLabels[h.by_role]}
                  </p>
                  {h.comment && <p className="mt-1 text-sm break-words">{h.comment}</p>}
                </li>
              ))}
            </ol>
          </Section>
        </div>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <h2 className="text-base font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Notice({ tone, title, children }: { tone: 'warning' | 'danger'; title: string; children: ReactNode }) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-xl border p-4',
        tone === 'warning' ? 'border-warning-strong/30 bg-warning-soft' : 'border-danger-strong/25 bg-danger-soft',
      )}
    >
      <CircleAlertIcon className={cn('mt-0.5 size-5 shrink-0', tone === 'warning' ? 'text-warning-strong' : 'text-danger-strong')} aria-hidden />
      <div className="flex min-w-0 flex-col gap-1">
        <p className="font-medium break-words">{title}</p>
        <p className="text-sm">{children}</p>
      </div>
    </div>
  );
}

function AttachmentList({ applicationId, items }: { applicationId: string; items: Attachment[] }) {
  const download = useDownloadAttachment(applicationId);
  return (
    <ul className="flex flex-col gap-2">
      {items.map((file) => (
        <li key={file.id} className="flex items-center gap-3 rounded-lg border bg-card py-1.5 pr-1.5 pl-3 text-sm">
          <FileIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate">{file.file_name}</span>
            <span className="text-xs text-muted-foreground">
              {formatSize(file.size)} · {file.uploaded_by_role === 'student' ? 'вы' : 'деканат'}
            </span>
          </span>
          <Button
            variant="ghost"
            size="icon"
            disabled={download.isPending && download.variables?.id === file.id}
            onClick={() => download.mutate(file, { onError: (err) => toast.error(apiErrorMessage(err)) })}
          >
            <DownloadIcon aria-hidden />
            <span className="sr-only">Скачать {file.file_name}</span>
          </Button>
        </li>
      ))}
    </ul>
  );
}

function UploadMore({ applicationId }: { applicationId: string }) {
  const upload = useUploadAttachment(applicationId);
  async function onAdd(files: File[]) {
    for (const file of files) {
      try {
        await upload.mutateAsync(file);
        toast.success(`Файл «${file.name}» приложен`);
      } catch (err) {
        toast.error(apiErrorMessage(err));
        return;
      }
    }
  }
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="upload-more" className="sr-only">
        Приложить файл
      </Label>
      <FileDrop id="upload-more" disabled={upload.isPending} onAdd={(files) => void onAdd(files)} />
      {upload.isPending && (
        <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircleIcon className="size-4 animate-spin" aria-hidden />
          Загружаем файл…
        </p>
      )}
    </div>
  );
}

function Chat({ application: a }: { application: Application }) {
  const post = usePostMessage(a.id);
  const [text, setText] = useState('');
  const closed = a.status === 'rejected' || a.status === 'cancelled';

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (!text.trim()) return;
    post.mutate(text.trim(), {
      onSuccess: () => setText(''),
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  }

  return (
    <section aria-labelledby="chat-title" className="flex flex-col gap-4 rounded-xl border bg-card p-5">
      <h2 id="chat-title" className="text-lg font-semibold">
        Переписка с деканатом
      </h2>
      {a.messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Сообщений пока нет. Если появится вопрос по заявке — напишите деканату здесь.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {a.messages.map((m) => {
            const mine = m.author_role === 'student';
            return (
              <li
                key={m.id}
                className={cn(
                  'flex max-w-[85%] flex-col gap-1 rounded-2xl px-4 py-2.5',
                  mine ? 'self-end rounded-br-sm bg-primary text-primary-foreground' : 'self-start rounded-bl-sm bg-muted',
                )}
              >
                <span className="text-xs font-semibold">{mine ? 'Вы' : m.author_label}</span>
                <p className="break-words whitespace-pre-wrap">{m.text}</p>
                <time dateTime={m.created_at} className={cn('text-xs', mine ? 'text-primary-foreground/80' : 'text-muted-foreground')}>
                  {formatDateTime(m.created_at)}
                </time>
              </li>
            );
          })}
        </ol>
      )}
      {closed ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Заявка закрыта — писать по ней нельзя. Если вопрос остался, подайте новую заявку.</p>
      ) : (
        <form onSubmit={onSubmit} className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor="message">Сообщение для деканата</Label>
          <Textarea id="message" value={text} onChange={(e) => setText(e.target.value)} maxLength={4000} rows={3} required />
          <Button type="submit" disabled={post.isPending} className="sm:self-end">
            {post.isPending ? <LoaderCircleIcon className="animate-spin" aria-hidden /> : <SendIcon aria-hidden />}
            Отправить
          </Button>
        </form>
      )}
    </section>
  );
}

function CancelDialog({ application }: { application: Application }) {
  const [open, setOpen] = useState(false);
  const cancel = useCancelApplication(application.id);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        cancel.reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Отозвать заявку</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Отозвать заявку № {application.number}?</DialogTitle>
          <DialogDescription>Деканат не будет её рассматривать. Вернуть отозванную заявку нельзя — при необходимости подайте новую.</DialogDescription>
        </DialogHeader>
        {cancel.isError && (
          <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {apiErrorMessage(cancel.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Не отзывать</Button>
          </DialogClose>
          <Button
            variant="destructive"
            disabled={cancel.isPending}
            onClick={() =>
              cancel.mutate(undefined, {
                onSuccess: () => {
                  setOpen(false);
                  toast.success(`Заявка № ${application.number} отозвана`);
                },
              })
            }
          >
            {cancel.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
            Отозвать
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** «Помог ли ответ деканата?» — оценку видит деканат (кабинет сотрудника, счётчики на главной). */
function FeedbackCard({ application: a }: { application: Application }) {
  const send = useSendFeedback(a.id);
  const [editing, setEditing] = useState(!a.feedback);
  const [askComment, setAskComment] = useState(false); // выбрано «Нет» — спрашиваем, что улучшить
  const [comment, setComment] = useState('');

  function submit(helpful: boolean) {
    send.mutate(
      { helpful, comment: helpful ? null : comment.trim() || null },
      {
        onSuccess: () => {
          setEditing(false);
          setAskComment(false);
          toast.success('Спасибо за оценку!');
        },
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  }

  if (!editing && a.feedback) {
    const Icon = a.feedback.helpful ? ThumbsUpIcon : ThumbsDownIcon;
    return (
      <section aria-label="Ваша оценка" className="flex flex-wrap items-center gap-3 rounded-xl border bg-card px-5 py-3 text-sm">
        <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden />
        <p className="min-w-0 flex-1">Вы отметили, что ответ деканата {a.feedback.helpful ? 'помог' : 'не помог'}. Спасибо!</p>
        <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
          Изменить
        </Button>
      </section>
    );
  }

  return (
    <section aria-labelledby="feedback-title" className="flex flex-col gap-3 rounded-xl border bg-card p-5">
      <div>
        <h2 id="feedback-title" className="text-base font-semibold">
          Помог ли ответ деканата?
        </h2>
        <p className="text-sm text-muted-foreground">Оценку видит деканат — так он понимает, что улучшить.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" disabled={send.isPending} onClick={() => submit(true)}>
          <ThumbsUpIcon aria-hidden />
          Да, помог
        </Button>
        <Button variant={askComment ? 'secondary' : 'outline'} aria-expanded={askComment} disabled={send.isPending} onClick={() => setAskComment(true)}>
          <ThumbsDownIcon aria-hidden />
          Нет
        </Button>
      </div>
      {askComment && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submit(false);
          }}
          className="flex flex-col gap-2"
        >
          <Label htmlFor="feedback-comment">Что можно улучшить? Необязательно</Label>
          <Textarea id="feedback-comment" value={comment} onChange={(e) => setComment(e.target.value)} maxLength={1000} rows={3} />
          <Button type="submit" disabled={send.isPending} className="sm:self-end">
            {send.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
            Отправить оценку
          </Button>
        </form>
      )}
    </section>
  );
}
