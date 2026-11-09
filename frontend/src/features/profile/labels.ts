import type { components } from '@/api/academic';

type Profile = components['schemas']['Profile'];

export const studyFormLabels: Record<Profile['study_form'], string> = {
    full_time: 'Очная', part_time: 'Очно-заочная', extramural: 'Заочная',
};
export const fundingLabels: Record<Profile['funding'], string> = {
    budget: 'Бюджет', contract: 'Договор',
};
export const studyLevelLabels: Record<Profile['study_level'], string> = {
    bachelor: 'Бакалавриат', specialist: 'Специалитет', master: 'Магистратура',
};
export const studentStatusLabels: Record<Profile['status'], string> = {
    studying: 'Обучается', academic_leave: 'Академический отпуск',
};
