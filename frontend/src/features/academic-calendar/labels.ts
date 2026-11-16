import type { components } from '@/api/academic';
import type { Tone } from '@/shared/ui/status-badge';

type S = components['schemas'];

export const periodLabels: Record<S['TermPeriodKind'], string> = {
    study: 'Учёба', credit_week: 'Зачётная неделя', holidays: 'Праздники', session: 'Сессия', vacation: 'Каникулы',
};

// Только токены темы: пары soft/strong проходят проверку контраста в theme.test.ts
export const periodColors: Record<S['TermPeriodKind'], string> = {
    study: 'bg-info-soft text-info-strong',
    credit_week: 'bg-warning-soft text-warning-strong',
    holidays: 'bg-muted text-muted-foreground',
    session: 'bg-danger-soft text-danger-strong',
    vacation: 'bg-success-soft text-success-strong',
};

export const eventLabels: Record<S['AcademicEventKind'], string> = {
    control_point: 'Контрольная точка', consultation: 'Консультация', credit: 'Зачёт', exam: 'Экзамен',
};

export const eventTones: Record<S['AcademicEventKind'], Tone> = {
    control_point: 'neutral', consultation: 'info', credit: 'warning', exam: 'danger',
};
