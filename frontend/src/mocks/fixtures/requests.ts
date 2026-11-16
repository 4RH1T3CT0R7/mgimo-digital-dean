import type { components } from '@/api/requests';
import { toApiDate } from '@/shared/lib/format';

// Каталог и заявки — docs/contracts/seed.md и services/requests/seed (номера 000001–000005),
// плюс 000006–000009, чтобы в моках были все статусы, вложение-результат и просрочка. Владелец — T10/T12.
type S = components['schemas'];
export type MockApplication = S['Application'] & { student: S['StudentSnapshot'] };

export const serviceTypes: S['ServiceType'][] = [
  {
    id: 'study-certificate',
    title: 'Справка с места учёбы',
    description: 'PDF с кодом проверки: получатель может убедиться в подлинности справки на сайте.',
    category: 'certificates',
    kind: 'instant_certificate',
    sla_days: 0,
    fields: [
      {
        key: 'purpose',
        label: 'Для чего нужна справка',
        type: 'select',
        required: true,
        options: ['По месту требования', 'Для органов соцзащиты', 'Для работодателя', 'Для налоговой', 'Другое'],
      },
      { key: 'destination', label: 'Куда нужна справка', type: 'text', required: false, placeholder: 'Например, по месту работы родителей', max_length: 200 },
    ],
    attachments: { allowed: false, required: false, hint: null },
  },
  {
    id: 'military-certificate',
    title: 'Справка в военкомат',
    description: 'Готовит деканат. Укажите военкомат и как удобнее получить: в деканате или электронной копией.',
    category: 'certificates',
    kind: 'document',
    sla_days: 5,
    fields: [
      { key: 'commissariat', label: 'Военный комиссариат', type: 'text', required: true, placeholder: 'Название военного комиссариата', max_length: 300 },
      { key: 'delivery', label: 'Как получить', type: 'select', required: true, options: ['Забрать в деканате', 'Электронная копия'] },
    ],
    attachments: { allowed: false, required: false, hint: null },
  },
  {
    id: 'transcript',
    title: 'Выписка оценок / транскрипт',
    description: 'Все оценки за выбранный период, на русском или английском языке.',
    category: 'certificates',
    kind: 'document',
    sla_days: 10,
    fields: [
      { key: 'language', label: 'Язык', type: 'select', required: false, options: ['Русский', 'Английский'] },
      { key: 'period', label: 'Период', type: 'select', required: false, options: ['Весь период обучения', 'Последний семестр'] },
    ],
    attachments: { allowed: false, required: false, hint: null },
  },
  {
    id: 'financial-aid',
    title: 'Материальная помощь',
    description: 'Для студентов в трудной ситуации. Понадобятся подтверждающие документы, например справка о составе семьи.',
    category: 'finance',
    kind: 'document',
    sla_days: 14,
    fields: [
      { key: 'reason', label: 'Основание', type: 'select', required: false, options: ['Сложная жизненная ситуация', 'Рождение ребёнка', 'Лечение', 'Другое'] },
      { key: 'details', label: 'Опишите ситуацию', type: 'textarea', required: true, max_length: 2000 },
    ],
    attachments: { allowed: true, required: true, hint: 'Документы, подтверждающие основание' },
  },
  {
    id: 'academic-leave',
    title: 'Академический отпуск',
    description: 'Укажите дату начала и основание. Документы можно приложить сразу или позже — деканат напишет, если они понадобятся.',
    category: 'deanery',
    kind: 'document',
    sla_days: 10,
    fields: [
      {
        key: 'reason',
        label: 'Основание',
        type: 'select',
        required: false,
        options: ['По медицинским показаниям', 'По семейным обстоятельствам', 'Призыв на военную службу', 'Другое'],
      },
      { key: 'start_date', label: 'С какой даты', type: 'date', required: true },
      { key: 'details', label: 'Комментарий', type: 'textarea', required: false, max_length: 2000 },
    ],
    attachments: { allowed: true, required: false, hint: null },
  },
  {
    id: 'student-card-reissue',
    title: 'Повторная выдача студенческого билета',
    description: 'Если билет утерян, повреждён или сменилась фамилия.',
    category: 'deanery',
    kind: 'document',
    sla_days: 7,
    fields: [{ key: 'reason', label: 'Причина', type: 'select', required: false, options: ['Утерян', 'Повреждён', 'Смена фамилии'] }],
    attachments: { allowed: false, required: false, hint: null },
  },
  {
    id: 'dean-question',
    title: 'Вопрос в деканат',
    description: 'Задайте вопрос — ответ придёт в переписке по заявке.',
    category: 'deanery',
    kind: 'question',
    sla_days: 3,
    fields: [
      { key: 'topic', label: 'Тема', type: 'select', required: false, options: ['Учебный процесс', 'Расписание', 'Документы', 'Стипендия', 'Другое'] },
      { key: 'question', label: 'Ваш вопрос', type: 'textarea', required: true, max_length: 2000 },
    ],
    attachments: { allowed: true, required: false, hint: null },
  },
];

/** Факультет заявки — по слепку студента (seed.md, «Общие ID»): нужен мокам кабинета сотрудника */
export const FACULTY_ID: Record<string, string> = {
  ФМО: '10000000-0000-4000-8000-000000000001',
  МЭО: '10000000-0000-4000-8000-000000000002',
};

/** Слепки студентов по логину (seed.md, «Данные тестовых студентов») */
export const students: Record<string, S['StudentSnapshot']> = {
  'student.mo': {
    id: '30000000-0000-4000-8000-000000000001',
    full_name: 'Лебедева Анна Викторовна',
    short_name: 'Лебедева А. В.',
    faculty_short: 'ФМО',
    course: 2,
    group_name: 'МО-24-03',
    student_card_no: '2401317',
  },
  'student.meo': {
    id: '30000000-0000-4000-8000-000000000002',
    full_name: 'Соколов Максим Олегович',
    short_name: 'Соколов М. О.',
    faculty_short: 'МЭО',
    course: 3,
    group_name: 'МЭО-23-02',
    student_card_no: '2302214',
  },
};

/** Студенты группы МО-24-03 без логина: у деканата ФМО есть новые и просроченные заявки */
const orlova: S['StudentSnapshot'] = { ...students['student.mo'], id: '31000000-0000-4000-8000-000000000001', full_name: 'Орлова Дарья Игоревна', short_name: 'Орлова Д. И.', student_card_no: '2401322' };
const kovalev: S['StudentSnapshot'] = { ...students['student.mo'], id: '31000000-0000-4000-8000-000000000002', full_name: 'Ковалёв Илья Андреевич', short_name: 'Ковалёв И. А.', student_card_no: '2401305' };

const HOUR = 3_600_000;
const iso = (ms: number) => new Date(ms).toISOString();
const uuid = (prefix: string, n: number) => `${prefix}-0000-4000-8000-${String(n).padStart(12, '0')}`;
const FINAL: S['ApplicationStatus'][] = ['ready', 'rejected', 'cancelled'];
let seq = 0;

/** Время событий заявки — в часах назад от момента загрузки, чтобы сроки были свежими (как в seed бэкенда). */
export type ApplicationDraft = {
  number: number;
  student: S['StudentSnapshot'];
  serviceTypeId: string;
  fields: Record<string, string>;
  comment?: string | null;
  createdHoursAgo: number;
  history: [status: S['ApplicationStatus'], hoursAgo: number, by: S['StatusHistoryEntry']['by_role'], comment?: string][];
  messages?: [role: S['Message']['author_role'], hoursAgo: number, text: string][];
  attachments?: { file_name: string; size: number; by: S['Attachment']['uploaded_by_role']; is_result: boolean; hoursAgo: number }[];
  certificateCode?: string;
};

/** Полная заявка из краткого описания: подписи полей, срок, последнее сообщение, справка. */
export function buildApplication(d: ApplicationDraft): MockApplication {
  const now = Date.now();
  const service = serviceTypes.find((s) => s.id === d.serviceTypeId)!;
  const status = d.history.at(-1)![0];
  const created = now - d.createdHoursAgo * HOUR;
  const messages = (d.messages ?? []).map(([role, h, text]) => ({
    id: uuid('51000000', ++seq),
    author_role: role,
    author_label: role === 'staff' ? `Деканат ${d.student.faculty_short}` : d.student.short_name,
    text,
    created_at: iso(now - h * HOUR),
  }));
  const last = messages.at(-1);
  const events = [...d.history.map(([, h]) => now - h * HOUR), ...messages.map((m) => Date.parse(m.created_at))];
  return {
    id: uuid('50000000', d.number),
    number: String(d.number).padStart(6, '0'),
    service_type: { id: service.id, title: service.title, kind: service.kind },
    status,
    created_at: iso(created),
    updated_at: iso(Math.max(...events)),
    due_at: FINAL.includes(status) ? null : iso(created + service.sla_days * 24 * HOUR),
    overdue: false, // считает обработчик
    last_message_at: last?.created_at ?? null,
    last_message_from: last?.author_role ?? null,
    fields: service.fields.filter((f) => d.fields[f.key]).map((f) => ({ key: f.key, label: f.label, value: d.fields[f.key] })),
    comment: d.comment ?? null,
    status_history: d.history.map(([s, h, by, comment]) => ({ status: s, at: iso(now - h * HOUR), by_role: by, comment: comment ?? null })),
    messages,
    attachments: (d.attachments ?? []).map((f) => ({
      id: uuid('52000000', ++seq),
      file_name: f.file_name,
      content_type: 'application/pdf',
      size: f.size,
      uploaded_by_role: f.by,
      is_result: f.is_result,
      created_at: iso(now - f.hoursAgo * HOUR),
    })),
    certificate: d.certificateCode
      ? { code: d.certificateCode, issued_at: iso(created), valid_until: toApiDate(new Date(created + 30 * 24 * HOUR)), verify_url: `/verify/${d.certificateCode}` }
      : null,
    student: d.student,
  };
}

const mo = students['student.mo'];
const meo = students['student.meo'];

function initialApplications(): MockApplication[] {
  return [
    buildApplication({
      number: 1,
      student: mo,
      serviceTypeId: 'dean-question',
      fields: { topic: 'Стипендия', question: 'Когда начислят повышенную академическую стипендию за осенний семестр?' },
      createdHoursAgo: 144,
      history: [
        ['submitted', 144, 'student'],
        ['in_progress', 124, 'staff'],
        ['ready', 119, 'staff'],
      ],
      messages: [
        ['staff', 120, 'Здравствуйте! Приказ о назначении повышенной стипендии подписан, выплата придёт вместе с основной стипендией в ноябре.'],
        ['student', 119.5, 'Спасибо! Нужно ли писать отдельное заявление?'],
        ['staff', 119, 'Нет, заявление не нужно: стипендию начислят автоматически.'],
      ],
    }),
    buildApplication({
      number: 2,
      student: meo,
      serviceTypeId: 'financial-aid',
      fields: { reason: 'Сложная жизненная ситуация', details: 'Прошу оказать материальную помощь: один из родителей временно потерял работу.' },
      createdHoursAgo: 72,
      history: [
        ['submitted', 72, 'student'],
        ['in_progress', 48, 'staff'],
        ['needs_info', 47, 'staff', 'Приложите справку о составе семьи'],
      ],
      attachments: [{ file_name: 'spravka-s-raboty.pdf', size: 184_320, by: 'student', is_result: false, hoursAgo: 72 }],
    }),
    buildApplication({
      number: 3,
      student: mo,
      serviceTypeId: 'military-certificate',
      fields: { commissariat: 'Военный комиссариат по месту регистрации', delivery: 'Забрать в деканате' },
      createdHoursAgo: 48,
      history: [
        ['submitted', 48, 'student'],
        ['in_progress', 45, 'staff'],
      ],
      messages: [['staff', 44.9, 'Справку готовим. Забрать её можно в деканате с 10:00 до 17:00, возьмите с собой паспорт.']],
    }),
    buildApplication({
      number: 4,
      student: mo,
      serviceTypeId: 'study-certificate',
      fields: { purpose: 'По месту требования' },
      createdHoursAgo: 24,
      history: [['ready', 24, 'system']],
      certificateCode: 'K7M2QX4PWA',
    }),
    buildApplication({
      number: 5,
      student: meo,
      serviceTypeId: 'transcript',
      fields: { language: 'Английский', period: 'Весь период обучения' },
      comment: 'Нужна для программы обмена.',
      createdHoursAgo: 20,
      history: [['submitted', 20, 'student']],
    }),
    buildApplication({
      number: 6,
      student: mo,
      serviceTypeId: 'transcript',
      fields: { language: 'Русский', period: 'Последний семестр' },
      createdHoursAgo: 400,
      history: [
        ['submitted', 400, 'student'],
        ['in_progress', 380, 'staff'],
        ['ready', 300, 'staff', 'Выписка готова, электронная копия — во вложении.'],
      ],
      attachments: [{ file_name: 'vypiska-ocenok.pdf', size: 96_256, by: 'staff', is_result: true, hoursAgo: 300 }],
    }),
    buildApplication({
      number: 7,
      student: mo,
      serviceTypeId: 'student-card-reissue',
      fields: { reason: 'Смена фамилии' },
      createdHoursAgo: 600,
      history: [
        ['submitted', 600, 'student'],
        ['rejected', 590, 'staff', 'Фамилия в документах не менялась. Если билет повреждён, подайте заявку с причиной «Повреждён».'],
      ],
    }),
    buildApplication({
      number: 8,
      student: meo,
      serviceTypeId: 'academic-leave',
      fields: { reason: 'По семейным обстоятельствам', start_date: '2027-02-01' },
      createdHoursAgo: 12 * 24,
      history: [['submitted', 12 * 24, 'student']],
    }),
    buildApplication({
      number: 9,
      student: meo,
      serviceTypeId: 'student-card-reissue',
      fields: { reason: 'Утерян' },
      createdHoursAgo: 200,
      history: [
        ['submitted', 200, 'student'],
        ['cancelled', 199, 'student'],
      ],
    }),
    // Для кабинета сотрудника ФМО: просроченные (академ — срок 10 дней, студбилет — 7) и свежий вопрос
    buildApplication({
      number: 10,
      student: orlova,
      serviceTypeId: 'academic-leave',
      fields: { reason: 'По семейным обстоятельствам', start_date: '2027-02-01' },
      createdHoursAgo: 12 * 24,
      history: [['submitted', 12 * 24, 'student']],
    }),
    buildApplication({
      number: 11,
      student: kovalev,
      serviceTypeId: 'student-card-reissue',
      fields: { reason: 'Утерян' },
      createdHoursAgo: 9 * 24,
      history: [
        ['submitted', 9 * 24, 'student'],
        ['in_progress', 8 * 24, 'staff'],
      ],
    }),
    buildApplication({
      number: 12,
      student: orlova,
      serviceTypeId: 'dean-question',
      fields: { topic: 'Стипендия', question: 'Когда начислят стипендию за ноябрь?' },
      createdHoursAgo: 2,
      history: [['submitted', 2, 'student']],
    }),
    // У Анны деканат просит уточнить — блок «Ждёт вашего действия» на главной (W1)
    buildApplication({
      number: 13,
      student: mo,
      serviceTypeId: 'transcript',
      fields: { language: 'Английский', period: 'Весь период обучения' },
      createdHoursAgo: 30,
      history: [
        ['submitted', 30, 'student'],
        ['in_progress', 26, 'staff'],
        ['needs_info', 5, 'staff', 'Напишите, для какой организации нужна выписка: от этого зависит форма документа'],
      ],
    }),
  ];
}

/** Заявки в памяти: обработчики меняют этот массив (подача, сообщения, отзыв, файлы). */
export const applications: MockApplication[] = [];

/** Вернуть заявки к исходным (тесты — в beforeEach). */
export function resetApplications() {
  applications.splice(0, applications.length, ...initialApplications());
}
resetApplications();
