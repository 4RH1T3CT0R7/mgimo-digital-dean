import type { components } from '@/api/academic';

type S = components['schemas'];

export const lessonKindLabels: Record<S['LessonKind'], string> = {
    lecture: 'Лекция',
    seminar: 'Семинар',
    language: 'Иностранный язык',
    consultation: 'Консультация',
    credit: 'Зачёт',
    exam: 'Экзамен',
};

export const parityLabels: Record<S['WeekInfo']['parity'], string> = {
    odd: 'нечётная',
    even: 'чётная',
};
