import { ChevronDownIcon, CircleAlertIcon, InfoIcon, LoaderCircleIcon, RotateCwIcon, ShieldAlertIcon } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link } from 'react-router';
import { useServiceTypes, type ServiceType } from '@/features/requests/queries';
import { ApiError, apiErrorMessage } from '@/shared/lib/errors';
import { plural } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { Label } from '@/shared/ui/label';
import { PageHeader } from '@/shared/ui/page-header';
import { Textarea } from '@/shared/ui/textarea';
import { useAsk, type Answer } from './queries';

const MIN = 3;
const MAX = 500;
const HISTORY = 5;
const examples = ['Как получить справку для военкомата?', 'Как оформить академический отпуск?', 'Что делать, если потерял студенческий?'];
const providerNotes: Record<Answer['provider'], string> = {
  llm: 'Ответ сгенерирован ИИ и может содержать ошибки. Проверьте в деканате.',
  faq: 'Ответ из справочника',
};

type Entry = { id: number; question: string; answer: Answer };

const length = (text: string) => [...text.trim()].length;

export function AssistantPage() {
  const [question, setQuestion] = useState('');
  // Последние ответы — только в памяти страницы: после перезагрузки история пуста, в storage ничего не пишем
  const [history, setHistory] = useState<Entry[]>([]);
  const ask = useAsk();
  // Каталог — сразу, чтобы в кнопке ответа было название услуги без подмены текста
  const services = useServiceTypes().data;
  const count = length(question);
  const [latest, ...older] = history;
  const result = useRef<HTMLDivElement>(null);

  // На телефоне ответ ниже первого экрана — показываем его (или ошибку), как только он пришёл
  useEffect(() => {
    if (ask.isSuccess || ask.isError) result.current?.scrollIntoView({ block: 'nearest' });
  }, [ask.isSuccess, ask.isError]);

  function submit(text: string) {
    const q = text.trim();
    if (length(q) < MIN || length(q) > MAX || ask.isPending) return;
    ask.mutate(q, {
      onSuccess: (answer) => {
        setHistory((h) => [{ id: Date.now(), question: q, answer }, ...h].slice(0, HISTORY));
        setQuestion((current) => (current.trim() === q ? '' : current));
      },
    });
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit(question);
  }

  // Enter — отправить, Shift+Enter — новая строка
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== 'Enter' || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    submit(question);
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="ИИ-помощник" subtitle="Отвечает на вопросы о правилах и заявлениях по справочнику деканата" />
      <form onSubmit={onSubmit} className="flex flex-col gap-5 rounded-xl border bg-card p-5 md:p-6">
        <p id="question-warning" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning-strong">
          <ShieldAlertIcon className="mt-px size-4 shrink-0" aria-hidden />
          Не вводите персональные данные — помощник отвечает только о правилах
        </p>
        <div className="flex flex-col gap-2">
          <Label htmlFor="question">Ваш вопрос</Label>
          <Textarea
            id="question"
            rows={3}
            maxLength={MAX}
            enterKeyHint="send"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            aria-describedby="question-warning question-count"
          />
          <div className="flex justify-between gap-3 text-[0.8125rem] text-muted-foreground">
            <span>{count > 0 && count < MIN ? `Не короче ${MIN} символов` : <span className="hidden md:inline">Enter — отправить, Shift+Enter — новая строка</span>}</span>
            <span id="question-count" className="shrink-0">
              {count} из {MAX}
            </span>
          </div>
        </div>
        <Button type="submit" disabled={count < MIN || ask.isPending} className="sm:self-start">
          {ask.isPending && <LoaderCircleIcon className="animate-spin" aria-hidden />}
          {ask.isPending ? 'Ищу ответ…' : 'Спросить'}
        </Button>
        <div className="flex flex-col gap-2">
          <p id="examples" className="text-sm text-muted-foreground">
            Например:
          </p>
          <div role="group" aria-labelledby="examples" className="flex flex-wrap gap-2">
            {examples.map((example) => (
              <Button
                key={example}
                type="button"
                variant="outline"
                size="sm"
                disabled={ask.isPending}
                className="h-auto min-h-9 py-2 text-left whitespace-normal"
                onClick={() => {
                  setQuestion(example);
                  submit(example);
                }}
              >
                {example}
              </Button>
            ))}
          </div>
        </div>
      </form>

      <div ref={result} aria-live="polite" className="mt-6 flex scroll-my-20 flex-col gap-4 empty:hidden lg:scroll-mb-6">
        {ask.isPending && <p className="sr-only">Ищу ответ…</p>}
        {ask.isError && <AskError error={ask.error} onRetry={() => submit(ask.variables ?? '')} />}
        {latest && (
          <article className="flex flex-col gap-4 rounded-xl border bg-card p-5 md:p-6">
            <h2 className="text-lg leading-snug font-semibold break-words">{latest.question}</h2>
            <AnswerView answer={latest.answer} services={services} />
          </article>
        )}
      </div>

      {older.length > 0 && (
        <section aria-labelledby="history" className="mt-10">
          <h2 id="history" className="text-xl font-semibold">
            Предыдущие вопросы
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">Видны, пока вы не обновите страницу</p>
          <ul className="mt-4 divide-y rounded-xl border bg-card">
            {older.map((entry) => (
              <li key={entry.id}>
                <details className="group px-4 py-3 md:px-5">
                  <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 font-medium break-words [&::-webkit-details-marker]:hidden">
                    <span className="min-w-0">{entry.question}</span>
                    <ChevronDownIcon className="size-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
                  </summary>
                  <div className="flex flex-col gap-4 pt-2 pb-2">
                    <AnswerView answer={entry.answer} services={services} />
                  </div>
                </details>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function AnswerView({ answer, services }: { answer: Answer; services?: ServiceType[] }) {
  const action = answer.suggested_action;
  const service = action && services?.find((s) => s.id === action.service_type_id);
  return (
    <>
      <p className="whitespace-pre-line">{answer.answer}</p>
      <p className="flex items-start gap-2 text-sm text-muted-foreground">
        <InfoIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
        {providerNotes[answer.provider]}
      </p>
      {answer.sources.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <h3 className="text-sm font-semibold">Источники</h3>
          <ul className="list-disc pl-5 text-sm text-muted-foreground">
            {answer.sources.map((s) => (
              <li key={s.faq_id}>{s.title}</li>
            ))}
          </ul>
        </div>
      )}
      {action && (
        <Button asChild className="h-auto min-h-11 self-start py-2.5 text-left whitespace-normal">
          <Link to={`/requests/new/${encodeURIComponent(action.service_type_id)}?${new URLSearchParams(action.prefill)}`}>
            {service ? `Заполнить заявление: ${service.title}` : 'Заполнить заявление'}
          </Link>
        </Button>
      )}
    </>
  );
}

function minutes(seconds: number) {
  const m = Math.max(1, Math.ceil(seconds / 60));
  return `${m} ${plural(m, ['минуту', 'минуты', 'минут'])}`;
}

function AskError({ error, onRetry }: { error: Error; onRetry: () => void }) {
  if (error instanceof ApiError && error.status === 429) {
    return (
      <p role="alert" className="flex items-start gap-2 rounded-xl border border-danger-strong/20 bg-danger-soft p-4 font-medium text-danger-strong">
        <CircleAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        Вы задали много вопросов, попробуйте {error.retryAfter ? `через ${minutes(error.retryAfter)}` : 'позже'}.
      </p>
    );
  }
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-xl border border-danger-strong/20 bg-danger-soft p-4">
      <p className="flex items-start gap-2 font-medium text-danger-strong">
        <CircleAlertIcon className="mt-0.5 size-5 shrink-0" aria-hidden />
        Не удалось получить ответ
      </p>
      <p className="text-sm text-muted-foreground">{apiErrorMessage(error)}</p>
      <Button variant="outline" onClick={onRetry}>
        <RotateCwIcon aria-hidden />
        Спросить ещё раз
      </Button>
    </div>
  );
}
