import { InfoIcon, LoaderCircleIcon } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { FieldError } from '@/features/staff-announcements/AudienceField';
import { fieldState, length, useFormErrors } from '@/features/staff-announcements/fields';
import { FormDialog } from '@/features/staff-announcements/FormDialog';
import { FormLayout } from '@/features/staff-announcements/forms';
import { apiErrorMessage } from '@/shared/lib/errors';
import { formatDate, plural } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/shared/ui/dialog';
import { EmptyState } from '@/shared/ui/empty-state';
import { Input } from '@/shared/ui/input';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { QueryView } from '@/shared/ui/query-view';
import { Section } from '@/shared/ui/section';
import { StatusBadge } from '@/shared/ui/status-badge';
import { Textarea } from '@/shared/ui/textarea';
import { toast } from '@/shared/ui/toast';
import { useKnowledge, useKnowledgeActions, useStaffAsk, type Answer, type KnowledgeDocument } from './queries';

// Ограничения — docs/contracts/assistant.yaml
const MAX_FILE = 5 * 1024 * 1024;
const MAX_CHARS = 300_000;
const number = (n: number) => n.toLocaleString('ru-RU');

export function KnowledgePage() {
  const query = useKnowledge();
  const [open, setOpen] = useState(false);
  return (
    <>
      <PageHeader
        title="База знаний помощника"
        subtitle="Помощник отвечает студентам по этим документам и по справочнику кабинета. Новый документ работает сразу после добавления, выключенный в ответах не участвует."
        actions={
          <FormDialog
            title="Добавить документ"
            description="Один документ — одна тема: порядок пересдач, памятка о стипендиях. Без персональных данных студентов и сотрудников."
            open={open}
            onOpenChange={setOpen}
          >
            {open && <AddForm done={() => setOpen(false)} />}
          </FormDialog>
        }
      />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] lg:items-start">
        <QueryView
          query={query}
          isEmpty={(items) => items.length === 0}
          empty={
            <EmptyState
              title="Документов пока нет"
              description="Добавьте порядок пересдач, памятку о стипендиях или другие правила. Пока документов нет, помощник отвечает по справочнику кабинета."
            />
          }
        >
          {(items) => (
            <ul className="divide-y rounded-xl border bg-card">
              {items.map((doc) => (
                <DocumentRow key={doc.id} doc={doc} />
              ))}
            </ul>
          )}
        </QueryView>
        <AskCheck />
      </div>
    </>
  );
}

function DocumentRow({ doc }: { doc: KnowledgeDocument }) {
  const { setActive } = useKnowledgeActions();
  function toggle() {
    setActive.mutate(
      { id: doc.id, active: !doc.active },
      {
        onSuccess: (d) => toast.success(d.active ? 'Документ включён' : 'Документ выключен — помощник его не использует'),
        onError: (error) => toast.error(apiErrorMessage(error)),
      },
    );
  }
  return (
    <li className="flex min-w-0 flex-col items-start gap-3 px-4 py-4 md:px-5">
      <div className="min-w-0 space-y-2 wrap-anywhere">
        <StatusBadge tone={doc.active ? 'success' : 'neutral'}>{doc.active ? 'Включён' : 'Выключен'}</StatusBadge>
        <h2 className="font-semibold">{doc.title}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span>{doc.source_name ?? 'Текст вставлен вручную'}</span>
          <span>
            {number(doc.chars)} {plural(doc.chars, ['символ', 'символа', 'символов'])}
          </span>
          <span>
            {doc.author_label}, <time dateTime={doc.created_at}>{formatDate(doc.created_at)}</time>
          </span>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="outline"
          aria-label={`${doc.active ? 'Выключить' : 'Включить'}: ${doc.title}`}
          disabled={setActive.isPending}
          onClick={toggle}
        >
          {doc.active ? 'Выключить' : 'Включить'}
        </Button>
        <DeleteDocument doc={doc} />
      </div>
    </li>
  );
}

function DeleteDocument({ doc }: { doc: KnowledgeDocument }) {
  const [open, setOpen] = useState(false);
  const { remove } = useKnowledgeActions();

  async function confirm() {
    try {
      await remove.mutateAsync(doc.id);
      setOpen(false);
      toast.success('Документ удалён');
    } catch {
      // Ошибка остаётся в диалоге, можно повторить.
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(value) => {
        remove.reset();
        setOpen(value);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" aria-label={`Удалить: ${doc.title}`}>
          Удалить
        </Button>
      </DialogTrigger>
      <DialogContent className="[&>button]:size-11">
        <DialogHeader>
          <DialogTitle>Удалить документ?</DialogTitle>
          <DialogDescription className="wrap-anywhere">
            Помощник перестанет отвечать по документу «{doc.title}». Вернуть его можно, только добавив заново. Если документ нужен позже, лучше выключите его.
          </DialogDescription>
        </DialogHeader>
        {remove.isError && (
          <p role="alert" className="text-sm text-danger-strong">
            {apiErrorMessage(remove.error)}
          </p>
        )}
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline" disabled={remove.isPending}>
              Не удалять
            </Button>
          </DialogClose>
          <Button variant="destructive" disabled={remove.isPending} onClick={() => void confirm()}>
            {remove.isPending ? 'Удаляем…' : 'Удалить документ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Почему файл не подойдёт; undefined — подойдёт. Сервер проверяет то же самое. */
function fileError(file?: File) {
  if (!file) return 'Выберите файл.';
  const ext = file.name.toLowerCase().split('.').pop();
  if (ext === 'pdf') return 'PDF не подойдёт: сохраните документ как .docx или .txt.';
  if (ext !== 'docx' && ext !== 'txt' && ext !== 'md') return 'Подойдёт файл .docx, .txt или .md.';
  if (file.size > MAX_FILE) return 'Файл больше 5 МБ — разделите документ на части.';
}

function AddForm({ done }: { done: () => void }) {
  const [title, setTitle] = useState('');
  const [mode, setMode] = useState<'file' | 'text'>('file');
  const [file, setFile] = useState<File>();
  const [text, setText] = useState('');
  const { add } = useKnowledgeActions();
  const errors = useFormErrors();
  // Ошибка источника текста — под тем полем, что сейчас на экране (сервер может назвать и file, и text)
  const sourceError = errors.fields.file ?? errors.fields.text;

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const n = length(title.trim());
    const valid = errors.validate({
      title: n < 3 || n > 200 ? 'Введите от 3 до 200 символов.' : undefined,
      file: mode === 'file' ? fileError(file) : undefined,
      text: mode === 'text' && !text.trim() ? 'Вставьте текст документа.' : mode === 'text' && length(text) > MAX_CHARS ? 'Не больше 300 000 символов.' : undefined,
    });
    if (add.isPending || !valid) return;
    add.mutate(
      { title: title.trim(), ...(mode === 'file' ? { file } : { text }) },
      {
        onSuccess: () => {
          toast.success('Документ добавлен — помощник уже отвечает по нему');
          done();
        },
        onError: errors.fail,
      },
    );
  }

  return (
    <FormLayout submit={submit} label="Добавить документ" pendingLabel="Добавляем…" pending={add.isPending} message={errors.message}>
      <div className="grid gap-2">
        <Label htmlFor="knowledge-title">Название</Label>
        <Input
          id="knowledge-title"
          value={title}
          maxLength={200}
          required
          {...fieldState('title', errors.fields.title)}
          onChange={(event) => setTitle(event.target.value)}
        />
        <FieldError name="title" message={errors.fields.title} />
      </div>
      <fieldset className="min-w-0">
        <legend className="mb-1 text-sm font-medium">Откуда взять текст</legend>
        <div className="flex flex-wrap gap-x-4">
          {(
            [
              ['file', 'Загрузить файл'],
              ['text', 'Вставить текст'],
            ] as const
          ).map(([value, label]) => (
            <Label key={value} className="flex min-h-11 cursor-pointer items-center gap-2">
              <input type="radio" name="knowledge-source" className="size-5 accent-primary" checked={mode === value} onChange={() => setMode(value)} />
              {label}
            </Label>
          ))}
        </div>
      </fieldset>
      {mode === 'file' ? (
        <div className="grid gap-2">
          <Label htmlFor="knowledge-file">Файл</Label>
          <input
            id="knowledge-file"
            type="file"
            accept=".docx,.txt,.md"
            className="block w-full min-w-0 text-sm text-muted-foreground file:mr-3 file:h-11 file:cursor-pointer file:rounded-lg file:border file:border-input file:bg-card file:px-4 file:text-base file:font-medium file:text-foreground hover:file:bg-muted focus-visible:outline-none focus-visible:file:ring-[3px] focus-visible:file:ring-ring/50"
            aria-invalid={!!sourceError}
            aria-describedby={sourceError ? 'knowledge-file-hint file-error' : 'knowledge-file-hint'}
            onChange={(event) => setFile(event.target.files?.[0])}
          />
          <p id="knowledge-file-hint" className="text-sm text-muted-foreground">
            .docx, .txt или .md до 5 МБ. PDF не подойдёт: русский текст из него читается с ошибками.
          </p>
          <FieldError name="file" message={sourceError} />
        </div>
      ) : (
        <div className="grid gap-2">
          <Label htmlFor="knowledge-text">Текст документа</Label>
          <Textarea
            id="knowledge-text"
            rows={8}
            value={text}
            aria-invalid={!!sourceError}
            aria-describedby={sourceError ? 'knowledge-text-count text-error' : 'knowledge-text-count'}
            onChange={(event) => setText(event.target.value)}
          />
          <p id="knowledge-text-count" className="text-sm text-muted-foreground">
            {number(length(text))} из {number(MAX_CHARS)}
          </p>
          <FieldError name="text" message={sourceError} />
        </div>
      )}
    </FormLayout>
  );
}

/** Подпись под ответом: модель это или найденный текст и откуда он. */
function answerNote(answer: Answer) {
  const fromDocuments = answer.sources.some((s) => s.kind === 'document');
  if (answer.provider === 'llm') {
    return answer.sources.length > 0
      ? 'Ответ ИИ по найденным документам и справочнику. Может содержать ошибки.'
      : 'Ответ ИИ из общих знаний: в документах и справочнике ничего не нашлось.';
  }
  if (fromDocuments) return 'Без ИИ: фрагмент документа как есть.';
  if (answer.sources.length > 0) return 'Без ИИ: ответ из справочника кабинета.';
  return 'Ничего не нашлось. Студенту предложат задать вопрос деканату.';
}

function AskCheck() {
  const ask = useStaffAsk();
  const [question, setQuestion] = useState('');
  const count = length(question.trim());

  function submit(event: FormEvent) {
    event.preventDefault();
    if (count >= 3 && !ask.isPending) ask.mutate(question.trim());
  }

  return (
    <Section title="Проверить, как ответит помощник">
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Label htmlFor="check-question">Вопрос, как его задал бы студент</Label>
        <Textarea id="check-question" rows={3} maxLength={500} value={question} onChange={(event) => setQuestion(event.target.value)} />
        <Button type="submit" disabled={count < 3 || ask.isPending} className="sm:self-start">
          {ask.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
          {ask.isPending ? 'Ищу ответ…' : 'Спросить'}
        </Button>
      </form>
      <div aria-live="polite" className="flex flex-col gap-3 empty:hidden">
        {ask.isError && (
          <p role="alert" className="text-sm text-danger-strong">
            {apiErrorMessage(ask.error)}
          </p>
        )}
        {ask.data && !ask.isPending && (
          <>
            <p className="flex items-start gap-2 text-sm text-muted-foreground">
              <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
              {answerNote(ask.data)}
            </p>
            <p className="whitespace-pre-line wrap-anywhere">{ask.data.answer}</p>
            {ask.data.sources.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <h3 className="text-sm font-semibold">Источники</h3>
                <ul className="flex flex-col gap-1.5 text-sm">
                  {ask.data.sources.map((s) => (
                    <li key={s.faq_id} className="wrap-anywhere">
                      {s.title}
                      <span className="block text-[0.8125rem] text-muted-foreground">{s.kind === 'document' ? 'Документ базы знаний' : 'Справочник кабинета'}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </Section>
  );
}
