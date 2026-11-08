import { plural } from './format';

type ErrorBody = { code?: string; message?: string; details?: Record<string, unknown> };

/** Ошибка API в едином формате contracts/README.md («Ошибки»). */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly serverMessage: string | null;
  readonly details: Record<string, unknown> | null;
  /** Секунды из заголовка Retry-After (429) */
  readonly retryAfter: number | null;

  constructor(response: Response, body: unknown) {
    const b: ErrorBody = typeof body === 'object' && body !== null ? body : {};
    super(b.message ?? `HTTP ${response.status}`);
    this.name = 'ApiError';
    this.status = response.status;
    this.code = b.code ?? 'unknown';
    this.serverMessage = b.message ?? null;
    this.details = b.details ?? null;
    const retry = Number(response.headers.get('Retry-After'));
    this.retryAfter = retry > 0 ? retry : null;
  }
}

const DEFAULT_MESSAGE = 'Запрос не выполнен. Обновите страницу.';

const BY_STATUS: Record<number, string> = {
  401: 'Сессия завершена. Войдите снова.',
  403: 'Этот раздел вам недоступен.',
  404: 'Ничего не найдено.',
  409: 'Данные уже изменились. Обновите страницу, чтобы увидеть текущее состояние.',
  413: 'Файл слишком большой: можно до 5 МБ.',
  415: 'Такой тип файла не подходит: можно PDF, JPG или PNG.',
  429: 'Слишком много попыток. Попробуйте позже.',
};

function waitText(seconds: number): string {
  if (seconds < 60) return `${seconds} ${plural(seconds, ['секунду', 'секунды', 'секунд'])}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} ${plural(minutes, ['минуту', 'минуты', 'минут'])}`;
}

/** Понятный пользователю текст любой ошибки запроса. */
export function apiErrorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    if (err.status === 429 && err.retryAfter) return `Слишком много попыток. Попробуйте через ${waitText(err.retryAfter)}.`;
    if (err.status >= 500) return 'Сервис временно недоступен. Попробуйте чуть позже.';
    return err.serverMessage ?? BY_STATUS[err.status] ?? DEFAULT_MESSAGE;
  }
  // fetch не дошёл до сервера: Chrome «Failed to fetch», Safari «Load failed», Firefox «NetworkError…»
  if (err instanceof TypeError && /fetch|network|load failed/i.test(err.message)) {
    return 'Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.';
  }
  return DEFAULT_MESSAGE;
}

/** Ошибки по полям формы из `details.fields` (400 validation_failed). */
export function fieldErrors(err: unknown): Record<string, string> {
  if (!(err instanceof ApiError)) return {};
  const fields = err.details?.fields;
  return typeof fields === 'object' && fields !== null ? (fields as Record<string, string>) : {};
}
