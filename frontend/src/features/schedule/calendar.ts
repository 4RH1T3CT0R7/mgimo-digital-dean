import { formatDate, toApiDate } from '@/shared/lib/format';

const DAY = 86_400_000;

export function addDays(date: string, count: number): string
{
    return toApiDate(new Date(Date.parse(`${date}T12:00:00+03:00`) + count * DAY));
}

export function monday(date: string): string
{
    const weekday = new Date(`${date}T12:00:00+03:00`).getUTCDay();

    return addDays(date, -((weekday + 6) % 7));
}

export function validDate(value: string | null): value is string
{
    return value !== null && /^\d{4}-\d{2}-\d{2}$/.test(value)
        && Number.isFinite(Date.parse(`${value}T12:00:00+03:00`))
        && toApiDate(`${value}T12:00:00+03:00`) === value;
}

export function rangeLabel(from: string, to: string): string
{
    return from.slice(0, 7) === to.slice(0, 7)
        ? `${Number(from.slice(8))}–${formatDate(to)}`
        : `${formatDate(from)} — ${formatDate(to)}`;
}

export function weekdayLabel(date: string): string
{
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', timeZone: 'Europe/Moscow' })
        .format(new Date(`${date}T12:00:00+03:00`));
}

export function dayHeading(date: string): string
{
    const label = `${weekdayLabel(date)}, ${formatDate(date)}`;

    return label[0].toUpperCase() + label.slice(1);
}

export function shortDate(date: string): string
{
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', timeZone: 'Europe/Moscow' })
        .format(new Date(`${date}T12:00:00+03:00`));
}
