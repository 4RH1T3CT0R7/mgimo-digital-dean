import type { Application } from './queries';

/** Форма «Вопрос в деканат» с темой и текстом (предзаполнение через адрес, как у помощника). */
export function askDeanPath(question: string, topic = 'Учебный процесс'): string {
  const params = new URLSearchParams({ topic });
  if (question) params.set('question', question);
  return `/requests/new/dean-question?${params}`;
}

/** Форма той же услуги с полями и комментарием отклонённой заявки. Файлы не переносятся. */
export function resubmitPath(a: Pick<Application, 'service_type' | 'fields' | 'comment'>): string {
  const params = new URLSearchParams(a.fields.map((f) => [f.key, f.value]));
  if (a.comment) params.set('comment', a.comment);
  return `/requests/new/${encodeURIComponent(a.service_type.id)}?${params}`;
}
