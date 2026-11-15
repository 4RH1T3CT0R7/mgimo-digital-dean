import { delay, http, HttpResponse } from 'msw';
import { answers, MAX_QUESTIONS_PER_HOUR, notFound } from '../fixtures/assistant';
import { scenario } from '../scenario';
import { mockUser } from './auth';

const hour = 3_600_000;
// Время вопросов по пользователям — лимит 20 в час, как в services/assistant (21-й вопрос → 429)
const asked = new Map<string, number[]>();

function error(status: number, code: string, message: string, init?: ResponseInit) {
  return HttpResponse.json({ code, message }, { status, ...init });
}

export const assistantHandlers = [
  http.post('/api/assistant/ask', async ({ request }) => {
    const user = mockUser();
    if (!user) return error(401, 'unauthenticated', 'Войдите в систему');
    if (user.role !== 'student') return error(403, 'forbidden', 'Этот раздел вам недоступен');

    const { question = '' } = (await request.json()) as { question?: string };
    const text = question.trim();
    const length = [...text].length;
    if (length < 3 || length > 500) {
      return HttpResponse.json(
        { code: 'validation_failed', message: 'Проверьте поля формы', details: { fields: { question: 'Вопрос — от 3 до 500 символов' } } },
        { status: 400 },
      );
    }

    const now = Date.now();
    const recent = (asked.get(user.id) ?? []).filter((t) => now - t < hour);
    if (recent.length >= MAX_QUESTIONS_PER_HOUR) {
      const wait = Math.ceil((hour - (now - recent[0])) / 1000);
      return error(429, 'too_many_attempts', 'Слишком много вопросов', { headers: { 'Retry-After': String(wait) } });
    }
    asked.set(user.id, [...recent, now]);

    // ?scenario=empty — справочник ничего не нашёл
    const lower = text.toLowerCase();
    const found = scenario() === 'empty' ? undefined : answers.find(({ words }) => words.some((w) => lower.includes(w)));
    await delay();
    return HttpResponse.json(found?.answer ?? notFound(text));
  }),
];
