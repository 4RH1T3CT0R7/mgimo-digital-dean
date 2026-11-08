import type { components } from '@/api/requests';
import { toApiDate } from '@/shared/lib/format';

// Заявки для кабинета сотрудника (T12): seed.md (000001–000005) + несколько вымышленных для фильтров и просрочки.
type StaffApplication = components['schemas']['StaffApplication'];
type ServiceType = components['schemas']['ServiceType'];
type Snapshot = components['schemas']['StudentSnapshot'];
type Status = components['schemas']['ApplicationStatus'];

/** Как хранит сервис: overdue и allowed_transitions обработчик считает сам */
export type StoredApplication = Omit<StaffApplication, 'overdue' | 'allowed_transitions'>;

/** Факультет заявки — по слепку студента (seed.md, «Общие ID») */
export const FACULTY_ID: Record<string, string> = {
  ФМО: '10000000-0000-4000-8000-000000000001',
  МЭО: '10000000-0000-4000-8000-000000000002',
};

// Каталог без полей формы — только для фильтра «Услуга». Полный каталог — в моках студента (T10), он стоит раньше.
const service = (id: string, title: string, kind: ServiceType['kind'], category: ServiceType['category'], sla_days: number): ServiceType => ({
  id,
  title,
  description: '',
  category,
  kind,
  sla_days,
  fields: [],
  attachments: { allowed: false, required: false },
});

export const staffServiceTypes: ServiceType[] = [
  service('study-certificate', 'Справка с места учёбы', 'instant_certificate', 'certificates', 0),
  service('military-certificate', 'Справка в военкомат', 'document', 'certificates', 5),
  service('transcript', 'Выписка оценок / транскрипт', 'document', 'certificates', 10),
  service('financial-aid', 'Материальная помощь', 'document', 'finance', 14),
  service('academic-leave', 'Академический отпуск', 'document', 'deanery', 10),
  service('student-card-reissue', 'Повторная выдача студенческого билета', 'document', 'deanery', 7),
  service('dean-question', 'Вопрос в деканат', 'question', 'deanery', 3),
];

const lebedeva: Snapshot = {
  id: '30000000-0000-4000-8000-000000000001',
  full_name: 'Лебедева Анна Викторовна',
  short_name: 'Лебедева А. В.',
  faculty_short: 'ФМО',
  course: 2,
  group_name: 'МО-24-03',
  student_card_no: '2401317',
};
const sokolov: Snapshot = {
  id: '30000000-0000-4000-8000-000000000002',
  full_name: 'Соколов Максим Олегович',
  short_name: 'Соколов М. О.',
  faculty_short: 'МЭО',
  course: 3,
  group_name: 'МЭО-23-02',
  student_card_no: '2302214',
};
const orlova: Snapshot = { ...lebedeva, id: '31000000-0000-4000-8000-000000000001', full_name: 'Орлова Дарья Игоревна', short_name: 'Орлова Д. И.', student_card_no: '2401322' };
const kovalev: Snapshot = { ...lebedeva, id: '31000000-0000-4000-8000-000000000002', full_name: 'Ковалёв Илья Андреевич', short_name: 'Ковалёв И. А.', student_card_no: '2401305' };

// Даты — относительно «сейчас»: просроченные заявки просрочены в любой день показа
const at = (days: number) => new Date(Date.now() + days * 864e5).toISOString();
const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

/** Свежая копия данных (обработчики меняют её в памяти) */
export function staffFixtures(): StoredApplication[] {
  function app(n: number, student: Snapshot, serviceId: string, status: Status, created: number, extra: Partial<StoredApplication> = {}): StoredApplication {
    const s = staffServiceTypes.find((t) => t.id === serviceId)!;
    const terminal = status === 'ready' || status === 'rejected' || status === 'cancelled';
    return {
      id: id(n),
      number: String(n).padStart(6, '0'),
      student,
      service_type: { id: s.id, title: s.title, kind: s.kind },
      status,
      created_at: at(created),
      updated_at: at(created),
      due_at: terminal ? null : at(created + s.sla_days),
      last_message_at: null,
      last_message_from: null,
      fields: [],
      comment: null,
      status_history: [{ status: 'submitted', at: at(created), by_role: 'student', comment: null }],
      messages: [],
      attachments: [],
      certificate: null,
      ...extra,
    };
  }
  const staffMessage = (n: number, days: number, text: string) => ({
    id: `51000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
    author_role: 'staff' as const,
    author_label: 'Деканат ФМО',
    text,
    created_at: at(days),
  });

  return [
    app(1, lebedeva, 'study-certificate', 'ready', -5, {
      fields: [{ key: 'purpose', label: 'Для чего нужна справка', value: 'По месту требования' }],
      status_history: [{ status: 'ready', at: at(-5), by_role: 'system', comment: null }],
      certificate: { code: 'K7M2QX4PWA', issued_at: at(-5), valid_until: toApiDate(at(25)), verify_url: '/verify/K7M2QX4PWA' },
    }),
    app(2, lebedeva, 'military-certificate', 'in_progress', -3, {
      fields: [
        { key: 'commissariat', label: 'Военный комиссариат', value: 'Военный комиссариат Гагаринского района г. Москвы' },
        { key: 'delivery', label: 'Как получить', value: 'Забрать в деканате' },
      ],
      status_history: [
        { status: 'submitted', at: at(-3), by_role: 'student', comment: null },
        { status: 'in_progress', at: at(-2), by_role: 'staff', comment: null },
      ],
      messages: [staffMessage(1, -2, 'Справку подготовим к пятнице. Забрать можно в деканате с 10:00 до 17:00.')],
      updated_at: at(-2),
      last_message_at: at(-2),
      last_message_from: 'staff',
    }),
    app(3, lebedeva, 'dean-question', 'ready', -6, {
      fields: [
        { key: 'topic', label: 'Тема', value: 'Учебный процесс' },
        { key: 'question', label: 'Вопрос', value: 'Можно ли перейти в другую языковую группу по французскому языку?' },
      ],
      status_history: [
        { status: 'submitted', at: at(-6), by_role: 'student', comment: null },
        { status: 'in_progress', at: at(-5.8), by_role: 'staff', comment: null },
        { status: 'ready', at: at(-5.5), by_role: 'staff', comment: null },
      ],
      messages: [staffMessage(2, -5.5, 'Да, до конца сентября. Напишите заявление на имя заместителя декана и принесите его в деканат.')],
      updated_at: at(-5.5),
      last_message_at: at(-5.5),
      last_message_from: 'staff',
    }),
    app(4, sokolov, 'financial-aid', 'needs_info', -4, {
      fields: [
        { key: 'reason', label: 'Основание', value: 'Сложная жизненная ситуация' },
        { key: 'details', label: 'Подробности', value: 'Прошу оказать материальную помощь в связи с тяжёлым материальным положением семьи.' },
      ],
      status_history: [
        { status: 'submitted', at: at(-4), by_role: 'student', comment: null },
        { status: 'in_progress', at: at(-3), by_role: 'staff', comment: null },
        { status: 'needs_info', at: at(-2), by_role: 'staff', comment: 'Приложите справку о составе семьи' },
      ],
      attachments: [
        { id: '52000000-0000-4000-8000-000000000001', file_name: 'zayavlenie.pdf', content_type: 'application/pdf', size: 184_320, uploaded_by_role: 'student', is_result: false, created_at: at(-4) },
      ],
      updated_at: at(-2),
    }),
    app(5, sokolov, 'transcript', 'submitted', -1, {
      fields: [
        { key: 'language', label: 'Язык', value: 'Английский' },
        { key: 'period', label: 'Период', value: 'Весь период обучения' },
      ],
    }),
    app(6, orlova, 'academic-leave', 'submitted', -12, {
      fields: [
        { key: 'reason', label: 'Основание', value: 'По семейным обстоятельствам' },
        { key: 'start_date', label: 'С какой даты', value: '2027-02-01' },
      ],
      comment: 'Справку из МФЦ приложила.',
      attachments: [
        { id: '52000000-0000-4000-8000-000000000002', file_name: 'spravka-mfc.pdf', content_type: 'application/pdf', size: 96_256, uploaded_by_role: 'student', is_result: false, created_at: at(-12) },
      ],
    }),
    app(7, kovalev, 'student-card-reissue', 'in_progress', -9, {
      fields: [{ key: 'reason', label: 'Причина', value: 'Утерян' }],
      status_history: [
        { status: 'submitted', at: at(-9), by_role: 'student', comment: null },
        { status: 'in_progress', at: at(-8), by_role: 'staff', comment: null },
      ],
      updated_at: at(-8),
    }),
    app(8, lebedeva, 'dean-question', 'submitted', -0.1, {
      fields: [
        { key: 'topic', label: 'Тема', value: 'Стипендия' },
        { key: 'question', label: 'Вопрос', value: 'Когда начислят повышенную стипендию за осенний семестр?' },
      ],
    }),
  ];
}
