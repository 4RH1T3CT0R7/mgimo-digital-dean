import type { components } from '@/api/requests';

// Заявки student.mo — docs/contracts/seed.md. Владелец дальнейших правок — T10/T12.
type ApplicationSummary = components['schemas']['ApplicationSummary'];

/** Сначала новые (по updated_at), как отдаёт API */
export const myApplications: ApplicationSummary[] = [
  {
    id: '60000000-0000-4000-8000-000000000002',
    number: '000102',
    service_type: { id: 'military-certificate', title: 'Справка в военкомат', kind: 'document' },
    status: 'in_progress',
    created_at: '2026-11-12T10:05:00+03:00',
    updated_at: '2026-11-13T09:30:00+03:00',
    due_at: '2026-11-17T18:00:00+03:00',
    overdue: false,
    last_message_at: '2026-11-13T09:30:00+03:00',
    last_message_from: 'staff',
  },
  {
    id: '60000000-0000-4000-8000-000000000001',
    number: '000101',
    service_type: { id: 'study-certificate', title: 'Справка с места учёбы', kind: 'instant_certificate' },
    status: 'ready',
    created_at: '2026-11-11T14:12:00+03:00',
    updated_at: '2026-11-11T14:12:00+03:00',
    due_at: null,
    overdue: false,
    last_message_at: null,
    last_message_from: null,
  },
  {
    id: '60000000-0000-4000-8000-000000000003',
    number: '000099',
    service_type: { id: 'dean-question', title: 'Вопрос в деканат', kind: 'question' },
    status: 'ready',
    created_at: '2026-11-09T18:40:00+03:00',
    updated_at: '2026-11-10T11:15:00+03:00',
    due_at: null,
    overdue: false,
    last_message_at: '2026-11-10T11:15:00+03:00',
    last_message_from: 'staff',
  },
];
