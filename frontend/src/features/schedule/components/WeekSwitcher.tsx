import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';
import { Button } from '@/shared/ui/button';
import { rangeLabel } from '../calendar';
import { parityLabels } from '../labels';
import type { components } from '@/api/academic';

export function WeekSwitcher({ from, to, week, onPrevious, onNext, onToday }: {
    from: string;
    to: string;
    week?: components['schemas']['WeekInfo'];
    onPrevious: () => void;
    onNext: () => void;
    onToday: () => void;
})
{
    return (
        <nav aria-label="Выбор недели" className="mb-6 flex min-w-0 flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2">
                <Button variant="outline" size="icon" aria-label="Предыдущая неделя" onClick={onPrevious}><ChevronLeftIcon aria-hidden /></Button>
                <div className="min-w-0 flex-1 text-center" aria-live="polite">
                    <p className="font-semibold">{rangeLabel(from, to)}</p>
                    <p className="text-sm text-muted-foreground">{week ? `${week.number}-я неделя (${parityLabels[week.parity]})` : ' '}</p>
                </div>
                <Button variant="outline" size="icon" aria-label="Следующая неделя" onClick={onNext}><ChevronRightIcon aria-hidden /></Button>
            </div>
            <Button variant="outline" onClick={onToday}>Сегодня</Button>
        </nav>
    );
}
