// Даты и время — всегда по Москве (contracts/README.md), подписи — по-русски.
const TZ = 'Europe/Moscow';

type DateInput = string | Date;

// 'YYYY-MM-DD' без времени — это дата по Москве, а не полночь UTC
function toDate(value: DateInput): Date {
  if (value instanceof Date) return value;
  return new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T00:00:00+03:00` : value);
}

const fmt = (options: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('ru-RU', { timeZone: TZ, ...options });
const dayMonth = fmt({ day: 'numeric', month: 'long' });
const dayMonthYear = fmt({ day: 'numeric', month: 'long', year: 'numeric' });
const time = fmt({ hour: '2-digit', minute: '2-digit' });
const isoDate = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** «18 ноября»; с `withYear` — «18 ноября 2026 г.» */
export function formatDate(value: DateInput, { withYear = false } = {}): string {
  return (withYear ? dayMonthYear : dayMonth).format(toDate(value));
}

/** «09:05» */
export function formatTime(value: DateInput): string {
  return time.format(toDate(value));
}

/** «18 ноября, 10:15» */
export function formatDateTime(value: DateInput): string {
  return `${formatDate(value)}, ${formatTime(value)}`;
}

/** Дата по Москве в формате API: «2026-11-18» */
export function toApiDate(value: DateInput = new Date()): string {
  return isoDate.format(toDate(value));
}

const pluralRules = new Intl.PluralRules('ru-RU');

/** Склонение: plural(5, ['день', 'дня', 'дней']) → «дней» */
export function plural(n: number, [one, few, many]: [string, string, string]): string {
  switch (pluralRules.select(n)) {
    case 'one':
      return one;
    case 'many':
      return many;
    default:
      return few; // few и дробные (other): «1,5 дня»
  }
}
