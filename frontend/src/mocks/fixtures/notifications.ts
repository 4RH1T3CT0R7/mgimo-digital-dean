import type { components } from '@/api/notifications';

// Данные — docs/contracts/seed.md (student.mo). Владелец дальнейших правок — T11/T13.
type S = components['schemas'];

export const feedCounters: S['FeedCounters'] = { unread: 3, important_unacked: 1, deadlines_soon: 1 };

/** Без days_left: его считает обработчик от текущего времени */
export const deadlines: Omit<S['Deadline'], 'days_left'>[] = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    title: 'Приём заявлений на материальную помощь',
    description: 'Заявление подаётся онлайн, документы прикладываются к заявке.',
    kind: 'application',
    due_at: '2026-11-30T23:59:00+03:00',
    service_type_id: 'financial-aid',
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    title: 'Зачёт: Международное публичное право',
    description: null,
    kind: 'credit',
    due_at: '2026-12-18T10:30:00+03:00',
    service_type_id: null,
  },
  {
    id: '70000000-0000-4000-8000-000000000003',
    title: 'Зачёт: Английский язык',
    description: null,
    kind: 'credit',
    due_at: '2026-12-22T12:00:00+03:00',
    service_type_id: null,
  },
  {
    id: '70000000-0000-4000-8000-000000000004',
    title: 'Экзамен: Теория международных отношений',
    description: 'Первый экзамен зимней сессии.',
    kind: 'exam',
    due_at: '2027-01-12T09:00:00+03:00',
    service_type_id: null,
  },
];
