import type { components } from '@/api/notifications';
import { plural } from '@/shared/lib/format';

export type FeedType = components['schemas']['FeedItemType'];

export const feedTypeLabels: Record<FeedType, string> = {
  news: 'Новость',
  announcement: 'Объявление',
  schedule_change: 'Расписание',
  application_status: 'Статус заявки',
  application_message: 'Ответ по заявке',
};

/** «сегодня», «завтра», «через 5 дней» */
export function deadlineLabel(days: number) {
  if (days === 0) return 'сегодня';
  if (days === 1) return 'завтра';
  return `через ${days} ${plural(days, ['день', 'дня', 'дней'])}`;
}
