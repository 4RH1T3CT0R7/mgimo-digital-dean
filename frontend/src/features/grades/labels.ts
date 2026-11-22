import type { components } from '@/api/academic';
import type { Tone } from '@/shared/ui/status-badge';

type S = components['schemas'];

export const controlFormLabels: Record<S['ControlForm'], string> = {
    exam: 'Экзамен', credit: 'Зачёт', graded_credit: 'Зачёт с оценкой',
};
export const gradeLabels: Record<S['Grade5'], string> = {
    excellent: 'Отлично', good: 'Хорошо', satisfactory: 'Удовлетворительно', unsatisfactory: 'Неудовлетворительно',
};
export const trafficLabels: Record<S['Traffic'], string> = {
    green: 'В порядке', yellow: 'На грани', red: 'Требует внимания',
};
export const trafficTones: Record<S['Traffic'], Tone> = {
    green: 'success', yellow: 'warning', red: 'danger',
};
export const termLabels = { autumn: 'Осенний семестр', spring: 'Весенний семестр' };

export function decimal(value: number | null | undefined, digits = 1): string
{
    return value == null ? 'Пока нет данных' : value.toLocaleString('ru-RU', { maximumFractionDigits: digits });
}
