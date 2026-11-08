import type { components } from '@/api/academic';

export const changeLabels: Record<components['schemas']['LessonChangeType'], string> = {
    moved: 'Перенести', cancelled: 'Отменить', room_changed: 'Сменить аудиторию',
};
