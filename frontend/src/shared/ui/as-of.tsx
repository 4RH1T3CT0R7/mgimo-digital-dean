import { formatDateTime } from '@/shared/lib/format';

/** «Данные актуальны на 18 ноября, 10:15» — для полей `as_of` из API */
export function AsOf({ date }: { date: string }) {
  return (
    <p className="text-[0.8125rem] text-muted-foreground">
      Данные актуальны на <time dateTime={date}>{formatDateTime(date)}</time>
    </p>
  );
}
