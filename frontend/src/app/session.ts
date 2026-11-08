// Сессия на клиенте. Сама сессия — cookie `sid` (HttpOnly), JS её не видит.
import type { components } from '@/api/auth';

export type Me = components['schemas']['Me'];
export type Role = components['schemas']['Role'];

/** Ключ кэша текущего пользователя (`useMe`). `null` в кэше — «не вошёл». */
export const meQueryKey = ['auth', 'me'] as const;

/** Главная страница роли: студент — «Сегодня», сотрудник и администратор — кабинет сотрудника. */
export function homePath(role: Role): string {
  return role === 'student' ? '/' : '/staff';
}

const listeners = new Set<() => void>();

/**
 * Подписка на выход: и на кнопку «Выйти», и на истечение сессии (401 от API).
 * Каркас по этому событию забывает пользователя и чистит кэш TanStack Query;
 * PWA (T16) подписывается, чтобы очистить кэши браузера. Возвращает функцию отписки.
 */
export function onLogout(callback: () => void): () => void {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
}

/** Завершить сессию на клиенте: вызвать всех подписчиков `onLogout`. */
export function endSession(): void {
  listeners.forEach((callback) => callback());
}
