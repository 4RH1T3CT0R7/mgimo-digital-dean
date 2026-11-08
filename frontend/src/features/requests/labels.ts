import type { components } from '@/api/requests';
import { plural } from '@/shared/lib/format';
import type { Tone } from '@/shared/ui/status-badge';

type S = components['schemas'];
export type ApplicationStatus = S['ApplicationStatus'];

const statusLabels: Record<ApplicationStatus, string> = {
  submitted: 'Подана',
  in_progress: 'В работе',
  needs_info: 'Нужны уточнения',
  ready: 'Готово',
  rejected: 'Отклонена',
  cancelled: 'Отозвана',
};

export const statusTones: Record<ApplicationStatus, Tone> = {
  submitted: 'info',
  in_progress: 'info',
  needs_info: 'warning',
  ready: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

/** Подпись статуса; для вопроса в деканат ready — «Ответ дан». */
export function statusLabel(status: ApplicationStatus, kind?: S['ServiceKind']): string {
  return status === 'ready' && kind === 'question' ? 'Ответ дан' : statusLabels[status];
}

export const categoryLabels: Record<S['ServiceType']['category'], string> = {
  certificates: 'Справки',
  deanery: 'Деканат',
  finance: 'Финансы',
  other: 'Прочее',
};

/** «Сразу», «до 5 дней», «до 1 дня» */
export function slaLabel(days: number): string {
  return days === 0 ? 'Сразу' : `до ${days} ${plural(days, ['дня', 'дней', 'дней'])}`;
}

export const roleLabels: Record<S['StatusHistoryEntry']['by_role'], string> = {
  student: 'Вы',
  staff: 'Деканат',
  system: 'Автоматически',
};

/** «120 КБ», «1,4 МБ» */
export function formatSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} МБ`;
}
