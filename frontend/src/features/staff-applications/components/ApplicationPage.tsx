import { FileIcon, ThumbsDownIcon, ThumbsUpIcon } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useParams } from 'react-router';
import type { components } from '@/api/requests';
import { FileDrop } from '@/features/requests/components/FileDrop';
import { StatusHistory } from '@/features/requests/components/StatusHistory';
import { applicationSteps, feedbackQuestion, formatSize } from '@/features/requests/labels';
import { ApiError, apiErrorMessage, fieldErrors } from '@/shared/lib/errors';
import { formatDate, formatDateTime } from '@/shared/lib/format';
import { cn } from '@/shared/lib/utils';
import { BackLink } from '@/shared/ui/back-link';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { StatusBadge } from '@/shared/ui/status-badge';
import { StatusSteps } from '@/shared/ui/status-steps';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { REPLY_TEMPLATES, statusLabel, statusTone, type Status } from '../labels';
import { useChangeStatus, useSendMessage, useStaffApplication, useUploadResult } from '../queries';

type Application = components['schemas']['StaffApplication'];

export function ApplicationPage() {
  const { id = '' } = useParams();
  const back = (useLocation().state as { back?: string } | null)?.back ?? '/staff';
  const application = useStaffApplication(id);
  return (
    <>
      <BackLink to={back}>Все заявки</BackLink>
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
      <PageHeader title={`Заявка № ${a.number}`} subtitle={a.service_type.title} actions={<StatusActions a={a} />} />
      <div className="-mt-2 mb-6 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-muted-foreground">
        <StatusBadge tone={statusTone(a.status)}>
          <span className="sr-only">Статус: </span>
          {statusLabel(a.status, a.service_type.kind)}
        </StatusBadge>
        {a.overdue && a.due_at && <StatusBadge tone="danger">Просрочено: срок был {formatDate(a.due_at)}</StatusBadge>}
        {a.service_type.kind === 'instant_certificate' && <span>Выдана {formatDateTime(a.created_at)}</span>}
      </div>
      {a.service_type.kind !== 'instant_certificate' && (
        <section aria-label="Ход заявки" className="mb-6 rounded-xl border bg-card px-4 pt-5 pb-4 md:px-6">
          <StatusSteps label="Ход заявки" steps={applicationSteps(a, 'staff')} />
        </section>
      )}

      {/* Компьютер: слева работа с заявкой, справа сведения; телефон — одной колонкой в том же порядке */}
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <div className="flex min-w-0 flex-col gap-6">
          <Messages a={a} open={open} />
          <Attachments a={a} open={open} />
        </div>
        <div className="flex min-w-0 flex-col gap-6">
          {a.feedback && (
            <Section title="Оценка студента">
              <div>
                <p className="text-sm text-muted-foreground">{feedbackQuestion(a.service_type.kind)}</p>
                <p className="mt-1 flex items-center gap-2 font-medium">
                  {a.feedback.helpful ? (
                    <ThumbsUpIcon className="size-5 text-success-strong" aria-hidden />
                  ) : (
                    <ThumbsDownIcon className="size-5 text-danger-strong" aria-hidden />
                  )}
                  {a.feedback.helpful ? 'Да' : 'Нет'}
                </p>
                <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(a.feedback.at)}</p>
              </div>
              {a.feedback.comment && <p className="text-sm break-words whitespace-pre-wrap">«{a.feedback.comment}»</p>}
            </Section>
          )}
          <Section title="Сведения">
            <InfoList
              items={[
                ['Студент', s.full_name],
                ['Факультет, курс и группа', `${s.faculty_short}, ${s.course} курс, ${s.group_name}`],
                ['№ студенческого билета', s.student_card_no],
                ...a.fields.map((f): [string, string] => [f.label, f.value]),
                ...(a.comment ? [['Комментарий студента', a.comment] as [string, string]] : []),
              ]}
            />
          </Section>
          <StatusHistory application={a} viewer="staff" />
        </div>
      </div>
    </>
  );
}

function InfoList({ items }: { items: [string, string][] }) {
  return (
    <dl className="flex flex-col gap-3">
      {items.map(([label, value]) => (
        <div key={label}>
          <dt className="text-sm text-muted-foreground">{label}</dt>
          <dd className="break-words whitespace-pre-wrap">{/^\d{4}-\d{2}-\d{2}$/.test(value) ? formatDate(value, { withYear: true }) : value}</dd>
        </div>
      ))}
    </dl>
  );
}

// ---------- Смена статуса: кнопки только из allowed_transitions ----------

type DialogStatus = 'needs_info' | 'ready' | 'rejected';

// Одно действие — одно слово на кнопке, в диалоге и в уведомлении (docs/design.md, «Тексты»)
const DIALOGS: Record<DialogStatus, { title: string; description: string; submit: string; cancel: string; required: boolean }> = {
  needs_info: {
    title: 'Запросить уточнения',
    description: 'Студент увидит комментарий и сможет ответить в переписке.',
    submit: 'Запросить',
    cancel: 'Не запрашивать',
    required: true,
  },
  ready: {
    title: 'Завершить заявку',
    description: 'Студент получит уведомление. Изменить статус после этого будет нельзя.',
    submit: 'Завершить',
    cancel: 'Не завершать',
    required: false,
  },
  rejected: {
    title: 'Отклонить заявку',
    description: 'Напишите причину — студент её увидит. Отменить отклонение нельзя.',
    submit: 'Отклонить',
    cancel: 'Не отклонять',
    required: true,
  },
};

function actionLabel(to: Status, a: Application): string {
  if (to === 'in_progress') return a.status === 'submitted' ? 'Взять в работу' : 'Вернуть в работу';
  if (to === 'needs_info') return 'Запросить уточнения';
  if (to === 'ready') return 'Завершить заявку';
  if (to === 'rejected') return 'Отклонить';
  return statusLabel(to);
}

function doneMessage(to: Status, a: Application): string {
  const n = `Заявка № ${a.number}`;
  if (to === 'in_progress') return a.status === 'submitted' ? `${n} взята в работу` : `${n} возвращена в работу`;
  if (to === 'needs_info') return 'Запрос уточнений отправлен студенту';
  if (to === 'ready') return `${n} завершена`;
  if (to === 'rejected') return `${n} отклонена`;
  return `${n}: ${statusLabel(to)}`;
}

function StatusActions({ a }: { a: Application }) {
  const change = useChangeStatus(a.id);
  // Окно остаётся смонтированным после закрытия: Radix доигрывает анимацию и возвращает фокус на кнопку.
  // n — новый экземпляр на каждое открытие, чтобы комментарий не переносился.
  const [dialog, setDialog] = useState<{ to: DialogStatus; n: number } | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const opener = useRef<HTMLElement | null>(null); // у окна нет DialogTrigger — фокус после закрытия возвращаем сами
  if (a.allowed_transitions.length === 0) return null; // завершённая заявка: итог виден на шкале

  function onClick(to: Status) {
    if (to in DIALOGS) {
      setDialog((d) => ({ to: to as DialogStatus, n: (d?.n ?? 0) + 1 }));
      return setDialogOpen(true);
    }
    change.mutate(
      { status: to },
      {
        onSuccess: () => toast.success(doneMessage(to, a)),
        onError: (err) => toast.error(apiErrorMessage(err)),
      },
    );
  }

  return (
    <div role="group" aria-label="Действия с заявкой" className="flex flex-wrap gap-2">
      {a.allowed_transitions.map((to) => (
        <Button
          key={to}
          variant={to === 'rejected' ? 'destructive' : to === 'needs_info' ? 'outline' : 'default'}
          disabled={change.isPending}
          onClick={(e) => {
            opener.current = e.currentTarget;
            onClick(to);
          }}
        >
          {actionLabel(to, a)}
        </Button>
      ))}
      {dialog && <StatusDialog key={dialog.n} a={a} to={dialog.to} open={dialogOpen} onClose={() => setDialogOpen(false)} returnFocus={() => opener.current?.focus()} />}
    </div>
  );
}

function StatusDialog({ a, to, open, onClose, returnFocus }: {
  a: Application;
  to: DialogStatus;
  open: boolean;
  onClose: () => void;
  returnFocus: () => void;
}) {
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
          toast.success(doneMessage(to, a));
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
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus();
        }}
      >
        <form onSubmit={onSubmit} noValidate className="grid gap-4">
          <DialogHeader>
            <DialogTitle>
              {cfg.title} № {a.number}?
            </DialogTitle>
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
              <p id="status-comment-error" className="text-sm text-danger-strong">
                {error}
              </p>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {cfg.cancel}
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
    <Section title="Переписка со студентом">
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
              <p className="text-[0.8125rem] text-muted-foreground">
                {m.author_label}, {formatDateTime(m.created_at)}
              </p>
              <p className="break-words whitespace-pre-wrap">{m.text}</p>
            </li>
          ))}
        </ol>
      )}
      {open ? (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-2 border-t pt-4">
          <Label htmlFor="reply">Ответ студенту</Label>
          <div role="group" aria-label="Шаблоны ответов" className="flex flex-wrap gap-2">
            {REPLY_TEMPLATES.map((t) => (
              <Button
                key={t.title}
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  setText((cur) => (cur.trim() ? `${cur.trimEnd()}
${t.text}` : t.text));
                  setError(null);
                }}
              >
                {t.title}
              </Button>
            ))}
          </div>
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
            <p id="reply-error" className="text-sm text-danger-strong">
              {error}
            </p>
          )}
          <Button type="submit" className="self-start" disabled={send.isPending}>
            Отправить
          </Button>
        </form>
      ) : (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">Заявка закрыта — отвечать в ней нельзя.</p>
      )}
    </Section>
  );
}

// ---------- Файлы и результат ----------

function Attachments({ a, open }: { a: Application; open: boolean }) {
  const upload = useUploadResult(a.id);

  // Файл загружается сразу после выбора — как у студента; размер и тип проверяет FileDrop
  async function onAdd(files: File[]) {
    for (const file of files) {
      try {
        await upload.mutateAsync(file);
        toast.success(`Документ «${file.name}» загружен — студент его увидит`);
      } catch (err) {
        toast.error(apiErrorMessage(err));
        return;
      }
    }
  }

  return (
    <Section title="Файлы">
      {a.attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground">Файлов нет.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {a.attachments.map((f) => (
            <li key={f.id} className="flex items-start gap-3 rounded-lg border px-3 py-2.5">
              <FileIcon className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                <a
                  href={`/api/requests/staff/applications/${a.id}/attachments/${f.id}`}
                  download={f.file_name}
                  className="font-medium break-all text-primary underline-offset-4 hover:underline"
                >
                  {f.file_name}
                </a>
                <span className="text-sm text-muted-foreground">
                  {formatSize(f.size)}, {f.uploaded_by_role === 'staff' ? 'от деканата' : 'от студента'}, {formatDateTime(f.created_at)}
                </span>
              </div>
              {f.is_result && <StatusBadge tone="success">Документ для студента</StatusBadge>}
            </li>
          ))}
        </ul>
      )}
      {open && (
        <div className={cn('flex flex-col gap-2', a.attachments.length > 0 && 'border-t pt-4')}>
          <Label htmlFor="result-file">Документ для студента</Label>
          <FileDrop id="result-file" disabled={upload.isPending} onAdd={(files) => void onAdd(files)} />
        </div>
      )}
    </Section>
  );
}
