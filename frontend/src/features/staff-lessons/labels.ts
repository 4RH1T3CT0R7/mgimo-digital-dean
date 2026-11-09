import type { components } from '@/api/academic';

export const changeLabels: Record<components['schemas']['LessonChangeType'], string> = {
    moved: 'Перенести', cancelled: 'Отменить', room_changed: 'Сменить аудиторию',
};

export const changeActions: Record<components['schemas']['LessonChangeType'], { action: string; success: string; pending: string }> = {
    moved: { action: 'Перенести занятие', success: 'Занятие перенесено', pending: 'Переносим…' },
    cancelled: { action: 'Отменить занятие', success: 'Занятие отменено', pending: 'Отменяем…' },
    room_changed: { action: 'Сменить аудиторию', success: 'Аудитория изменена', pending: 'Меняем аудиторию…' },
};
