import { delay, http, HttpResponse } from 'msw';
import type { components } from '@/api/assistant';
import { answers, notFound } from '../fixtures/assistant';
import { knowledgeDocuments } from '../fixtures/knowledge';
import { list } from '../scenario';
import { mockUser } from './auth';

// База знаний помощника (services/assistant, D66): список, добавление, включение, удаление, проверка ответа.
type Answer = components['schemas']['Answer'];

const MAX_FILE = 5 * 1024 * 1024;
const MAX_CHARS = 300_000;
const api = '/api/assistant/staff';

let documents = structuredClone(knowledgeDocuments);

export function resetKnowledgeState() {
  documents = structuredClone(knowledgeDocuments);
}

function error(status: number, code: string, message: string, fields?: Record<string, string>) {
  return HttpResponse.json({ code, message, ...(fields && { details: { fields } }) }, { status });
}

const invalid = (fields: Record<string, string>) => error(400, 'validation_failed', 'Проверьте введённые данные', fields);

/** Как RequireStaffOrAdmin: без входа — 401, студенту — 403. */
function staffOnly() {
  const user = mockUser();
  if (!user) return { denied: error(401, 'unauthenticated', 'Войдите в систему') };
  if (user.role === 'student') return { denied: error(403, 'forbidden', 'Недостаточно прав') };
  return { user };
}

const chars = (text: string) => [...text.trim()].length;
const view = ({ text: _text, ...doc }: (typeof documents)[number]) => doc;

/** Грубые основы слов вопроса — как faq.Search в сервисе (первые 5 букв). */
function stems(text: string) {
  return (text.toLowerCase().match(/\p{L}{4,}/gu) ?? []).map((w) => w.slice(0, 5));
}

export const knowledgeHandlers = [
  http.get(`${api}/knowledge`, async () => {
    const { denied } = staffOnly();
    if (denied) return denied;
    await delay();
    return HttpResponse.json(list(documents.map(view)));
  }),

  http.post(`${api}/knowledge`, async ({ request }) => {
    const { denied, user } = staffOnly();
    if (denied) return denied;
    const form = await request.formData();
    const title = String(form.get('title') ?? '').trim();
    // instanceof File не годится: в тестах File из undici, а глобальный — из jsdom
    const entry = form.get('file');
    const file = typeof entry === 'string' ? null : entry;
    const pasted = String(form.get('text') ?? '').trim();
    const fields: Record<string, string> = {};
    if (chars(title) < 3 || chars(title) > 200) fields.title = 'Название — от 3 до 200 символов';
    if (file && pasted) fields.file = 'Загрузите файл или вставьте текст — что-то одно';
    if (!file && !pasted) fields.text = 'Загрузите файл или вставьте текст документа';
    if (Object.keys(fields).length > 0) return invalid(fields);

    let text = pasted;
    if (file) {
      if (file.size > MAX_FILE) return error(413, 'file_too_large', 'Файл больше 5 МБ');
      const ext = file.name.toLowerCase().split('.').pop();
      if (ext === 'pdf') {
        return error(415, 'unsupported_file_type', 'PDF не поддерживается: русский текст из него извлекается с ошибками. Сохраните документ как .docx или .txt');
      }
      if (ext !== 'txt' && ext !== 'md' && ext !== 'docx') return error(415, 'unsupported_file_type', 'Можно загрузить файл .txt, .md или .docx');
      // .docx мок не разбирает: объём — по размеру файла
      text = ext === 'docx' ? 'текст '.repeat(Math.max(1, Math.round(file.size / 12))) : await file.text();
    }
    const field = file ? 'file' : 'text';
    if (chars(text) === 0) return invalid({ [field]: 'В документе нет текста' });
    if (chars(text) > MAX_CHARS) return invalid({ [field]: 'Текст длиннее 300 000 символов — разделите документ на части' });

    const doc = {
      id: crypto.randomUUID(),
      title,
      source_name: file ? file.name : null,
      chars: chars(text),
      chunks: Math.max(1, Math.ceil(chars(text) / 1050)),
      author_label: user.role === 'admin' ? 'Администрация' : 'Деканат',
      created_at: new Date().toISOString(),
      active: true,
      text: text.trim(),
    };
    documents = [doc, ...documents];
    await delay();
    return HttpResponse.json(view(doc), { status: 201 });
  }),

  http.patch(`${api}/knowledge/:id`, async ({ params, request }) => {
    const { denied } = staffOnly();
    if (denied) return denied;
    const { active } = (await request.json()) as { active?: boolean };
    const doc = documents.find((d) => d.id === params.id);
    if (!doc) return error(404, 'not_found', 'Не найдено');
    doc.active = !!active;
    await delay();
    return HttpResponse.json(view(doc));
  }),

  http.delete(`${api}/knowledge/:id`, async ({ params }) => {
    const { denied } = staffOnly();
    if (denied) return denied;
    if (!documents.some((d) => d.id === params.id)) return error(404, 'not_found', 'Не найдено');
    documents = documents.filter((d) => d.id !== params.id);
    await delay();
    return new HttpResponse(null, { status: 204 });
  }),

  http.post(`${api}/ask`, async ({ request }) => {
    const { denied } = staffOnly();
    if (denied) return denied;
    const { question = '' } = (await request.json()) as { question?: string };
    const text = question.trim();
    if (chars(text) < 3 || chars(text) > 500) return invalid({ question: 'Вопрос — от 3 до 500 символов' });

    const words = stems(text);
    const found = documents.filter((d) => d.active && words.some((w) => d.text.toLowerCase().includes(w)));
    let answer: Answer;
    if (found.length > 0) {
      // Как ответ модели по фрагментам документов: со ссылкой [1] и источниками-документами
      answer = {
        provider: 'llm',
        answer: `${found[0].text.split('. ')[0]} [1].`,
        sources: found.slice(0, 3).map((d) => ({ faq_id: d.id, title: d.title, kind: 'document' as const })),
        suggested_action: null,
      };
    } else {
      const lower = text.toLowerCase();
      const faq = answers.find(({ words }) => words.some((w) => lower.includes(w)))?.answer ?? notFound(text);
      answer = { ...faq, sources: faq.sources.map((s) => ({ ...s, kind: 'faq' as const })) };
    }
    await delay();
    return HttpResponse.json(answer);
  }),
];
