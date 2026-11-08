import type { components } from '@/api/requests';
import type { Tone } from '@/shared/ui/status-badge';

export type Status = components['schemas']['ApplicationStatus'];
type Kind = components['schemas']['ServiceKind'];

// Подписи — как у студента (T10), чтобы обе стороны видели одни и те же слова
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  submitted: { label: 'Подана', tone: 'info' },
  in_progress: { label: 'В работе', tone: 'info' },
  needs_info: { label: 'Нужны уточнения', tone: 'warning' },
  ready: { label: 'Готово', tone: 'success' },
  rejected: { label: 'Отклонена', tone: 'danger' },
  cancelled: { label: 'Отозвана', tone: 'neutral' },
};

export function statusLabel(status: Status, kind?: Kind): string {
  return status === 'ready' && kind === 'question' ? 'Ответ дан' : STATUS[status].label;
}

export function statusTone(status: Status): Tone {
  return STATUS[status].tone;
}

/** Фильтр списка: статус API или «просрочены» (в API это submitted + in_progress с прошедшим сроком, Б5) */
export type ListFilter = Status | 'overdue';

export const LIST_FILTERS: { value: ListFilter; label: string }[] = [
  { value: 'submitted', label: 'Новые' },
  { value: 'in_progress', label: 'В работе' },
  { value: 'needs_info', label: 'Ждут студента' },
  { value: 'overdue', label: 'Просрочены' },
  { value: 'ready', label: 'Готово' },
  { value: 'rejected', label: 'Отклонены' },
  { value: 'cancelled', label: 'Отозваны' },
];

export const AUTHOR_ROLE: Record<'student' | 'staff' | 'system', string> = {
  student: 'Студент',
  staff: 'Деканат',
  system: 'Система',
};

/** Частые ответы деканата: вставляются в поле ответа одним нажатием, текст можно поправить перед отправкой. */
export const REPLY_TEMPLATES: { title: string; text: string }[] = [
  { title: 'Приняли в работу', text: 'Заявку приняли в работу. Сообщим, как только всё будет готово.' },
  { title: 'Документ готов', text: 'Документ готов: его можно скачать в заявке или забрать в деканате в часы приёма.' },
  { title: 'Нужен документ', text: 'Пожалуйста, приложите к заявке скан документа, подтверждающего основание.' },
  { title: 'Спасибо', text: 'Спасибо, информацию получили — продолжаем работу по заявке.' },
];
