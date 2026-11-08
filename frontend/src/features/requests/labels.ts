import type { components } from '@/api/requests';
import { formatDate, plural } from '@/shared/lib/format';
import type { Tone } from '@/shared/ui/status-badge';
import type { Step } from '@/shared/ui/status-steps';

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
  submitted: 'neutral',
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

type StepsSource = Pick<S['Application'], 'status' | 'status_history' | 'service_type' | 'due_at'>;

/**
 * Шаги заявки для шкалы статуса: Подана → В работе → Готово (data-model.md, Б5).
 * Уточнение, отказ и отзыв показываются на том шаге, где процесс остановился.
 */
export function applicationSteps(a: StepsSource, viewer: 'student' | 'staff' = 'student'): Step[] {
  const at = (status: ApplicationStatus) => {
    const h = a.status_history.findLast((e) => e.status === status);
    return h ? formatDate(h.at) : undefined;
  };
  const ready = statusLabel('ready', a.service_type.kind);
  const wasInWork = a.status_history.some((h) => h.status === 'in_progress');
  const submitted: Step = { label: 'Подана', state: 'done', hint: at('submitted') };
  const due = a.due_at ? `ожидается до ${formatDate(a.due_at)}` : undefined;

  switch (a.status) {
    case 'submitted':
      return [{ ...submitted, state: 'current' }, { label: 'В работе', state: 'upcoming' }, { label: ready, state: 'upcoming', hint: due }];
    case 'in_progress':
      return [submitted, { label: 'В работе', state: 'current', hint: at('in_progress') }, { label: ready, state: 'upcoming', hint: due }];
    case 'needs_info':
      return [
        submitted,
        { label: viewer === 'staff' ? 'Ждёт студента' : 'Нужны уточнения', state: 'attention', hint: at('needs_info') },
        { label: ready, state: 'upcoming', hint: due },
      ];
    case 'ready':
      return [submitted, { label: 'В работе', state: 'done', hint: at('in_progress') }, { label: ready, state: 'done', hint: at('ready') }];
    case 'rejected':
      return [
        submitted,
        { label: 'В работе', state: wasInWork ? 'done' : 'upcoming', hint: at('in_progress') },
        { label: 'Отклонена', state: 'failed', hint: at('rejected') },
      ];
    case 'cancelled':
      return [submitted, { label: 'Отозвана', state: 'stopped', hint: at('cancelled') }];
  }
}

/** Вопрос оценки (D50) — один и тот же у студента и у сотрудника. Оценивается только выполненная заявка. */
export function feedbackQuestion(kind: S['ServiceKind']): string {
  return kind === 'question' ? 'Ответ помог?' : 'Заявку выполнили так, как вам было нужно?';
}
