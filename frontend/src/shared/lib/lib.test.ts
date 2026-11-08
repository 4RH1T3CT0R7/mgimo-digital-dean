import { describe, expect, it } from 'vitest';
import { apiErrorMessage, ApiError, fieldErrors } from './errors';
import { formatDate, formatDateTime, plural, toApiDate } from './format';

const apiError = (status: number, body: unknown, headers?: HeadersInit) => new ApiError(new Response(null, { status, headers }), body);

describe('format', () => {
  it('время — по Москве', () => {
    expect(formatDateTime('2026-11-18T07:15:00Z')).toBe('18 ноября, 10:15');
    expect(toApiDate(new Date('2026-11-18T22:30:00Z'))).toBe('2026-11-19');
  });

  it('дата без времени не сдвигается', () => {
    expect(formatDate('2026-11-01')).toBe('1 ноября');
    expect(formatDate('2026-11-01', { withYear: true })).toBe('1 ноября 2026 г.');
  });

  it('plural', () => {
    const forms: [string, string, string] = ['день', 'дня', 'дней'];
    expect([1, 2, 5, 11, 12, 21, 22, 25, 111].map((n) => plural(n, forms))).toEqual([
      'день',
      'дня',
      'дней',
      'дней',
      'дней',
      'день',
      'дня',
      'дней',
      'дней',
    ]);
  });
});

describe('errors', () => {
  it('сообщение сервера для 4xx, своё — для 5xx и сети', () => {
    expect(apiErrorMessage(apiError(409, { code: 'conflict', message: 'Заявка уже отозвана' }))).toBe('Заявка уже отозвана');
    expect(apiErrorMessage(apiError(404, 'Not Found'))).toBe('Ничего не найдено.');
    expect(apiErrorMessage(apiError(502, '502 Bad Gateway'))).toBe('Сервис временно недоступен. Попробуйте чуть позже.');
    expect(apiErrorMessage(new TypeError('Failed to fetch'))).toMatch(/Нет связи с сервером/);
  });

  it('429 с Retry-After', () => {
    expect(apiErrorMessage(apiError(429, {}, { 'Retry-After': '30' }))).toBe('Слишком много попыток. Попробуйте через 30 секунд.');
  });

  it('fieldErrors из details.fields', () => {
    const err = apiError(400, { code: 'validation_failed', message: 'Проверьте поля формы', details: { fields: { reason: 'Обязательное поле' } } });
    expect(fieldErrors(err)).toEqual({ reason: 'Обязательное поле' });
    expect(fieldErrors(new Error('x'))).toEqual({});
  });
});
