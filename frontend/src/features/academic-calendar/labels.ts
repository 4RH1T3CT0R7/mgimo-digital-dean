import type { components } from '@/api/academic';
import type { Tone } from '@/shared/ui/status-badge';

type S = components['schemas'];

export const periodLabels: Record<S['TermPeriodKind'], string> = {
    study: 'Учёба', credit_week: 'Зачётная неделя', holidays: 'Праздники', session: 'Сессия', vacation: 'Каникулы',
};

// Только токены темы. Учёба нейтральная: синий у нас только у того, что нажимается (docs/design.md)
export const periodTiles: Record<S['TermPeriodKind'], string> = {
    study: 'border-border bg-muted text-foreground',
    credit_week: 'border-transparent bg-warning-soft text-warning-strong',
    holidays: 'border-dashed border-input text-muted-foreground',
    session: 'border-transparent bg-danger-soft text-danger-strong',
    vacation: 'border-transparent bg-success-soft text-success-strong',
};

export const periodText: Record<S['TermPeriodKind'], string> = {
    study: 'text-foreground', credit_week: 'text-warning-strong', holidays: 'text-muted-foreground',
    session: 'text-danger-strong', vacation: 'text-success-strong',
};

export const eventLabels: Record<S['AcademicEventKind'], string> = {
    control_point: 'Контрольная точка', consultation: 'Консультация', credit: 'Зачёт', exam: 'Экзамен',
};

export const eventTones: Record<S['AcademicEventKind'], Tone> = {
    control_point: 'neutral', consultation: 'info', credit: 'warning', exam: 'danger',
};
