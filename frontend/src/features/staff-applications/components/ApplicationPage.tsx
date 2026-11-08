import { ArrowLeftIcon, FileIcon } from 'lucide-react';
import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useLocation, useParams } from 'react-router';
import type { components } from '@/api/requests';
import { ApiError, apiErrorMessage, fieldErrors } from '@/shared/lib/errors';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/shared/ui/card';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { AUTHOR_ROLE, statusLabel, statusTone, type Status } from '../labels';
import { useChangeStatus, useSendMessage, useStaffApplication, useUploadResult } from '../queries';

type Application = components['schemas']['StaffApplication'];

export function ApplicationPage() {
  const { id = '' } = useParams();
  const back = (useLocation().state as { back?: string } | null)?.back ?? '/staff';
  const application = useStaffApplication(id);
  return (
    <>
      <Link
        to={back}
        className="mb-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium text-primary hover:underline focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        Все заявки
      </Link>
      <QueryView query={application}>{(a) => <ApplicationDetails a={a} />}</QueryView>
    </>
  );
}

function ApplicationDetails({ a }: { a: Application }) {
  // Писать и прикладывать файлы нельзя только в rejected и cancelled (requests.yaml)
  const open = a.status !== 'rejected' && a.status !== 'cancelled';
  const s = a.student;
  return (
    <>
      <PageHeader title={`Заявка № ${a.number}`} subtitle={a.service_type.title} />
      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <StatusBadge tone={statusTone(a.status)}>{statusLabel(a.status, a.service_type.kind)}</StatusBadge>
        {a.overdue && <StatusBadge tone="danger">Просрочено</StatusBadge>}
        <span>Подана {formatDateTime(a.created_at)}</span>
        {a.due_at && <span>Срок — {formatDate(a.due_at)}</span>}
      </div>

      <div className="flex flex-col gap-4">
        <StatusActions a={a} />
        <div className="grid gap-4 md:grid-cols-2">
          <Section title="Студент">
            <InfoList
              items={[
                ['ФИО', s.full_name],
                ['Факультет', s.faculty_short],
                ['Курс и группа', `${s.course} курс, ${s.group_name}`],
                ['№ студенческого билета', s.student_card_no],
              ]}
            />
          </Section>
          <Section title="Данные заявки">
            {a.fields.length === 0 && !a.comment ? (
              <p className="text-sm text-muted-foreground">Студент не заполнял полей.</p>
            ) : (
              <InfoList items={[...a.fields.map((f): [string, string] => [f.label, f.value]), ...(a.comment ? [['Комментарий студента', a.comment] as [string, string]] : [])]} />
            )}
          </Section>
        </div>
        <Messages a={a} open={open} />
        <Attachments a={a} open={open} />
        <Section title="История статусов">
          <ol className="flex flex-col gap-3">
            {a.status_history.map((h, i) => (
              <li key={i} className="border-l-2 border-border pl-3">
                <p className="font-medium">{statusLabel(h.status, a.service_type.kind)}</p>
                <p className="text-sm text-muted-foreground">
                  {formatDateTime(h.at)} · {AUTHOR_ROLE[h.by_role]}
                </p>
                {h.comment && <p className="mt-1 text-sm break-words whitespace-pre-wrap">{h.comment}</p>}
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card className="min-w-0">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function InfoList({ items }: { items: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-3 text-sm">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-muted-foreground">{label}</dt>
          <dd className="font-medium break-words whitespace-pre-wrap">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Смена статуса: кнопки только из allowed_transitions ----------

type DialogStatus = 'needs_info' | 'ready' | 'rejected';

const DIALOGS: Record<DialogStatus, { title: string; description: string; submit: string; required: boolean }> = {
  needs_info: {
    title: 'Запросить уточнения',
    description: 'Студент увидит комментарий и сможет ответить в переписке.',
    submit: 'Запросить',
    required: true,
  },
  ready: {
    title: 'Завершить заявку',
    description: 'Студент получит уведомление. Изменить статус после этого будет нельзя.',
    submit: 'Завершить',
    required: false,
  },
  rejected: {
    title: 'Отклонить заявку',
    description: 'Напишите причину — студент её увидит. Отменить отклонение нельзя.',
    submit: 'Отклонить',
    required: true,
  },
};

function actionLabel(to: Status, a: Application): string {
  if (to === 'in_progress') return a.status === 'submitted' ? 'Взять в работу' : 'Вернуть в работу';
  if (to === 'needs_info') return 'Запросить уточнения';
  if (to === 'ready') return a.service_type.kind === 'question' ? 'Ответ дан' : 'Готово';
  if (to === 'rejected') return 'Отклонить';
  return statusLabel(to);
}

function StatusActions({ a }: { a: Application }) {
  const change = useChangeStatus(a.id);
  const [dialog, setDialog] = useState<DialogStatus | null>(null);

  function onClick(to: Status) {
    if (to in DIALOGS) return setDialog(to as DialogStatus);
    change.mutate(
      { status: to },
      {
        onSuccess: () => toast.success(`Статус заявки: «${statusLabel(to, a.service_type.kind)}»`),
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  }

  return (
    <Section title="Статус">
      {a.allowed_transitions.length === 0 ? (
        <p className="text-sm text-muted-foreground">Заявка завершена — статус больше не меняется.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {a.allowed_transitions.map((to) => (
            <Button
              key={to}
              variant={to === 'rejected' ? 'destructive' : to === 'needs_info' ? 'outline' : 'default'}
              disabled={change.isPending}
              onClick={() => onClick(to)}
            >
              {actionLabel(to, a)}
            </Button>
          ))}
        </div>
      )}
      {dialog && <StatusDialog a={a} to={dialog} onClose={() => setDialog(null)} />}
    </Section>
  );
}

function StatusDialog({ a, to, onClose }: { a: Application; to: DialogStatus; onClose: () => void }) {
  const change = useChangeStatus(a.id);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const cfg = DIALOGS[to];

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const text = comment.trim();
    if (cfg.required && !text) return setError('Напишите комментарий для студента');
    change.mutate(
      { status: to, comment: text || null },
      {
        onSuccess: () => {
          toast.success(`Статус заявки: «${statusLabel(to, a.service_type.kind)}»`);
          onClose();
        },
        onError: (err) => {
          const field = fieldErrors(err).comment;
          if (field) return setError(field);
          toast.error(apiErrorMessage(err));
          if (err instanceof ApiError && err.status === 409) onClose(); // статус уже другой — данные обновятся
        },
      },
    );
  }

  return (
    <Dialog open onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent>
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{cfg.title}</DialogTitle>
            <DialogDescription>{cfg.description}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="status-comment">
              Комментарий для студента{!cfg.required && <span className="font-normal text-muted-foreground"> (необязательно)</span>}
            </Label>
            <Textarea
              id="status-comment"
              value={comment}
              maxLength={2000}
              aria-required={cfg.required}
              aria-invalid={!!error}
              aria-describedby={error ? 'status-comment-error' : undefined}
              onChange={(e) => {
                setComment(e.target.value);
                setError(null);
              }}
            />
            {error && (
              <p id="status-comment-error" className="text-sm text-destructive">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                Отмена
              </Button>
            </DialogClose>
            <Button type="submit" variant={to === 'rejected' ? 'destructive' : 'default'} disabled={change.isPending}>
              {cfg.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ---------- Переписка ----------

function Messages({ a, open }: { a: Application; open: boolean }) {
  const send = useSendMessage(a.id);
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    const value = text.trim();
    if (!value) return setError('Напишите сообщение');
    send.mutate(value, {
      onSuccess: () => {
        setText('');
        toast.success('Ответ отправлен студенту');
      },
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  }

  return (
    <Section title="Переписка">
      {a.messages.length === 0 ? (
        <p className="text-sm text-muted-foreground">Сообщений пока нет.</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {a.messages.map((m) => (
            <li
              key={m.id}
              className={cn(
                'flex max-w-[85%] flex-col gap-1 rounded-xl px-4 py-3',
                m.author_role === 'staff' ? 'self-end bg-accent' : 'self-start bg-muted',
              )}
            >
              <p className="text-xs text-muted-foreground">
                {m.author_label} · {formatDateTime(m.created_at)}
              </p>
              <p className="text-sm break-words whitespace-pre-wrap">{m.text}</p>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-2">
          <Label htmlFor="reply">Ответ студенту</Label>
          <Textarea
            id="reply"
            value={text}
            maxLength={4000}
            placeholder="Студент увидит ответ от имени деканата"
            aria-invalid={!!error}
            aria-describedby={error ? 'reply-error' : undefined}
            onChange={(e) => {
              setText(e.target.value);
              setError(null);
            }}
          />
          {error && (
            <p id="reply-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" className="self-start" disabled={send.isPending}>
            Отправить
          </Button>
        </form>
      ) : (
        <p className="mt-4 text-sm text-muted-foreground">Заявка закрыта — отвечать в ней нельзя.</p>
      )}
    </Section>
  );
}

// ---------- Вложения и результат ----------

const MAX_FILE = 5 * 1024 * 1024;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} КБ` : `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}

function Attachments({ a, open }: { a: Application; open: boolean }) {
  const upload = useUploadResult(a.id);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);

  function onChange(f: File | null) {
    setFile(f);
    if (f && !FILE_TYPES.includes(f.type)) setError('Такой тип файла не подходит: можно PDF, JPG или PNG.');
    else if (f && f.size > MAX_FILE) setError('Файл слишком большой: можно до 5 МБ.');
    else setError(null);
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    if (!file) return setError('Выберите файл');
    if (error) return;
    upload.mutate(file, {
      onSuccess: () => {
        toast.success('Документ загружен — студент его увидит');
        form.reset();
        setFile(null);
      },
      onError: (err) => toast.error(apiErrorMessage(err)),
    });
  }

  return (
    <Section title="Документы">
      {a.attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Документов нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {a.attachments.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-lg border px-3 py-2">
              <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <a
                  href={`/api/requests/staff/applications/${a.id}/attachments/${f.id}`}
                  download={f.file_name}
                  className="text-sm font-medium break-all text-primary underline-offset-4 hover:underline"
                >
                  {f.file_name}
                </a>
                <span className="text-xs text-muted-foreground">
                  {fileSize(f.size)} · {f.uploaded_by_role === 'staff' ? 'от деканата' : 'от студента'} · {formatDateTime(f.created_at)}
                </span>
              </div>
              {f.is_result && <StatusBadge tone="success">Результат</StatusBadge>}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <form onSubmit={onSubmit} noValidate className="mt-4 flex flex-col gap-2">
          <Label htmlFor="result-file">Загрузить результат (PDF, JPG или PNG, до 5 МБ)</Label>
          <input
            id="result-file"
            type="file"
            accept={FILE_TYPES.join(',')}
            aria-invalid={!!error}
            aria-describedby={error ? 'result-file-error' : undefined}
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
            className="w-full min-w-0 text-sm file:mr-3 file:h-10 file:rounded-md file:border file:border-input file:bg-card file:px-4 file:font-medium file:text-foreground hover:file:bg-accent focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
          />
          {error && (
            <p id="result-file-error" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <Button type="submit" variant="outline" className="self-start" disabled={upload.isPending}>
            Загрузить
          </Button>
        </form>
      )}
    </Section>
  );
}
