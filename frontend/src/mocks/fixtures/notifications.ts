import type { components } from '@/api/notifications';
import { toApiDate } from '@/shared/lib/format';
import { faculties, profile, staffGroups, weekSchedule } from './academic';
import { users } from './auth';

// Данные — docs/contracts/seed.md.
type S = components['schemas'];

export type MockDeadline = Omit<S['StaffDeadline'], 'days_left'>;
/** event (сколько идёт и иду ли я) считает обработчик из отметок «Пойду» */
export type MockFeedItem = Omit<S['FeedItem'], 'event'> & {
  audience: S['Audience'];
  event_starts_at?: string;
  event_place?: string;
};
/** status и dismissed_count считает обработчик */
export type MockBanner = Omit<S['AdminBanner'], 'status' | 'dismissed_count'>;
export const fmo = faculties[0].id;
export const meo = faculties[1].id;
const groupMO = profile.group.id;
const groupMEO = staffGroups.find((group) => group.name === 'МЭО-23-02')!.id;
const faculty = (id: string): S['Audience'] => ({ kind: 'faculty', faculty_id: id });
const group = (id: string, facultyId: string): S['Audience'] => ({ kind: 'group', group_id: id, faculty_id: facultyId });
const everyone = { kind: 'all' } as const;
const student = (id: string): S['Audience'] => ({ kind: 'user', user_id: id });
const anna = users['student.mo'].id;
const maxim = users['student.meo'].id;
const createdAt = '2026-11-12T09:00:00+03:00';

export const recipients = [
  { id: anna, short_name: users['student.mo'].display_name, group_name: profile.group.name, faculty: fmo, course: 2,
    groups: [groupMO, ...profile.language_groups.map(({ id }) => id)] },
  { id: maxim, short_name: users['student.meo'].display_name, group_name: 'МЭО-23-02', faculty: meo, course: 3,
    groups: [groupMEO, '20000000-0000-4000-8000-000000000005', '20000000-0000-4000-8000-000000000006'] },
  ...['Орлова Д. И.', 'Ковалёв И. А.'].map((short_name, i) => ({
    id: `31000000-0000-4000-8000-00000000000${i + 1}`, short_name, group_name: profile.group.name, faculty: fmo,
    course: 2, groups: [groupMO, ...profile.language_groups.map(({ id }) => id)],
  })),
];

export function matchesAudience(audience: S['Audience'], recipient: typeof recipients[number]) {
  switch (audience.kind) {
    case 'all': return true;
    case 'faculty': return audience.faculty_id === recipient.faculty;
    case 'course': return audience.faculty_id === recipient.faculty && audience.course === recipient.course;
    case 'group': return !!audience.group_id && recipient.groups.includes(audience.group_id);
    case 'user': return audience.user_id === recipient.id;
  }
}

/** Без days_left: его считает обработчик от текущего времени */
export const deadlines: MockDeadline[] = [
  {
    id: '70000000-0000-4000-8000-000000000001',
    audience: everyone,
    created_at: createdAt,
    title: 'Приём заявлений на материальную помощь',
    description: 'Подайте заявление онлайн и приложите к нему документы.',
    kind: 'application',
    due_at: '2026-11-30T23:59:00+03:00',
    service_type_id: 'financial-aid',
  },
  {
    id: '70000000-0000-4000-8000-000000000002',
    audience: group(groupMO, fmo),
    created_at: createdAt,
    title: 'Зачёт: Международное публичное право',
    description: null,
    kind: 'credit',
    due_at: '2026-12-18T10:30:00+03:00',
    service_type_id: null,
  },
  {
    id: '70000000-0000-4000-8000-000000000003',
    audience: group(groupMO, fmo),
    created_at: createdAt,
    title: 'Зачёт: Английский язык',
    description: null,
    kind: 'credit',
    due_at: '2026-12-22T12:00:00+03:00',
    service_type_id: null,
  },
  {
    id: '70000000-0000-4000-8000-000000000004',
    audience: group(groupMO, fmo),
    created_at: createdAt,
    title: 'Экзамен: Теория международных отношений',
    description: 'Первый экзамен зимней сессии.',
    kind: 'exam',
    due_at: '2027-01-12T09:00:00+03:00',
    service_type_id: null,
  },
  {
    id: '70000000-0000-4000-8000-000000000005',
    audience: group(groupMEO, meo),
    created_at: createdAt,
    title: 'Сдача курсовой работы',
    description: 'Уточните у преподавателя, как передать работу.',
    kind: 'coursework',
    due_at: '2026-12-05T23:59:00+03:00',
    service_type_id: null,
  },
  // Срок — завтра от момента загрузки: на главной есть блок «Ждёт вашего действия» (W1)
  {
    id: '70000000-0000-4000-8000-000000000006',
    audience: group(groupMO, fmo),
    created_at: createdAt,
    title: 'Эссе: Теория международных отношений',
    description: 'Сдайте эссе преподавателю на семинаре.',
    kind: 'coursework',
    due_at: `${toApiDate(new Date(Date.now() + 86_400_000))}T18:00:00+03:00`,
    service_type_id: null,
  },
];

function publication(n: number, title: string, body: string, audience: S['Audience'], author: string, requiresAck = false): MockFeedItem {
  return { id: `71000000-0000-4000-8000-${String(n).padStart(12, '0')}`, title, body, audience,
    type: requiresAck ? 'announcement' : 'news', author_label: author, important: requiresAck,
    requires_ack: requiresAck, link: { kind: 'none' }, created_at: `2026-11-${11 + n}T09:00:00+03:00` };
}

export const publications = [
  publication(1, 'Справку с места учёбы можно скачать сразу', 'Выберите справку в разделе «Заявки». Готовый файл появится в карточке заявки.', everyone, 'Администрация'),
  publication(2, 'Расписание можно добавить в календарь', 'Скачайте файл в разделе «Расписание» и импортируйте его в свой календарь.', everyone, 'Администрация'),
  publication(3, 'Проверьте изменения в расписании ФМО', 'Обратите внимание на метки переноса и смены аудитории.', faculty(fmo), 'Деканат ФМО'),
  publication(4, 'Приём заявлений на материальную помощь', 'Подайте заявление до 30 ноября и приложите подтверждающие документы.', faculty(meo), 'Деканат МЭО'),
  publication(5, 'Проверьте время декабрьских зачётов', 'Уточните даты зачётов для своей группы.\nКогда прочитаете, нажмите «Ознакомлен(а)».', faculty(fmo), 'Деканат ФМО', true),
  publication(6, 'Срок сдачи курсовой работы', 'Группа МЭО-23-02 сдаёт курсовую 5 декабря. Уточните формат работы у преподавателя.', faculty(meo), 'Деканат МЭО', true),
];

const shortDate = (date: string) => toApiDate(date).slice(5).split('-').reverse().join('.');
const lessonChanges: MockFeedItem[] = weekSchedule.lessons.flatMap((lesson, i) => {
  if (!lesson.change || lesson.status === 'moved_away') return [];
  const { previous, changed_at, reason } = lesson.change;
  const [title, body] = lesson.status === 'moved'
    ? ['Перенос', `Занятие ${shortDate(previous?.date ?? lesson.date)} в ${previous?.start_time ?? lesson.start_time} перенесено на ${shortDate(lesson.date)} в ${lesson.start_time}, аудитория ${lesson.room?.number}.`]
    : lesson.status === 'cancelled'
      ? ['Отмена', `Занятие ${shortDate(lesson.date)} в ${lesson.start_time} отменено.`]
      : ['Другая аудитория', `Занятие ${shortDate(lesson.date)} в ${lesson.start_time} пройдёт в аудитории ${lesson.room?.number}.`];
  return [{ id: `72000000-0000-4000-8000-${String(i).padStart(12, '0')}`, title: `${title}: ${lesson.discipline.name}`,
    body: reason ? `${body} ${reason}` : body, type: 'schedule_change', created_at: changed_at,
    important: lesson.status !== 'changed', requires_ack: false, author_label: 'Деканат ФМО',
    audience: group(lesson.groups[0].id, fmo), link: { kind: 'lesson', id: lesson.id, date: lesson.date } }];
});

// Номера — из fixtures/requests.ts: ссылки должны открывать карточки текущего мока.
function applicationUpdate(n: number, owner: string, title: string, body: string, author: string, type: S['FeedItemType'], important: boolean): MockFeedItem {
  const suffix = String(n).padStart(12, '0');
  return { id: `73000000-0000-4000-8000-${suffix}`, title, body, author_label: author, type, important, requires_ack: false,
    audience: student(owner), created_at: '2026-11-17T12:00:00+03:00',
    link: { kind: 'application', id: `50000000-0000-4000-8000-${suffix}` } };
}

const updates = [
  applicationUpdate(4, anna, 'Готово: заявка №000004', 'Справка готова, её можно скачать.', 'Деканат ФМО', 'application_status', true),
  applicationUpdate(3, anna, 'Заявка №000003 в работе', 'Справка в военкомат: деканат взял заявку в работу.', 'Деканат ФМО', 'application_status', false),
  applicationUpdate(1, anna, 'Ответ по заявке №000001', 'Деканат ФМО ответил по заявке «Вопрос в деканат».', 'Деканат ФМО', 'application_message', false),
  applicationUpdate(2, maxim, 'Нужны уточнения по заявке №000002', 'Материальная помощь: приложите справку о составе семьи.', 'Деканат МЭО', 'application_status', true),
];

// Мероприятия и баннеры — как в services/notifications/seed/03_news_banners.sql (вымышленные).
function event(n: number, title: string, body: string, audience: S['Audience'], author: string, created: string, starts: string, place: string): MockFeedItem {
  return { id: `74000000-0000-4000-8000-${String(n).padStart(12, '0')}`, type: 'news', title, body, audience,
    author_label: author, important: false, requires_ack: false, link: { kind: 'none' }, created_at: created,
    event_starts_at: starts, event_place: place };
}

export const events = [
  event(1, 'Клуб дебатов: открытая тренировка', 'Разберём формат британских парламентских дебатов и проведём две пробные игры. Опыт не нужен, достаточно прийти за десять минут до начала.',
    everyone, 'Администрация', '2026-11-09T09:00:00+03:00', '2026-11-13T18:30:00+03:00', 'Корпус Б, аудитория 1051'),
  event(2, 'ФМО: встреча с выпускниками о стажировках', 'Выпускники факультета расскажут, как искали первую стажировку и что спрашивали на собеседованиях. Вопросы можно задать после встречи.',
    faculty(fmo), 'Деканат ФМО', '2026-11-12T10:00:00+03:00', '2026-11-20T17:00:00+03:00', 'Новый корпус, аудитория 212'),
  event(3, 'Открытая лекция «Как читать международный договор»', 'На примерах учебных договоров разберём структуру текста, оговорки и порядок вступления в силу. Лекция подойдёт студентам любого курса.',
    everyone, 'Администрация', '2026-11-14T10:00:00+03:00', '2026-11-26T16:00:00+03:00', 'Корпус Г, аудитория 2115'),
  event(4, 'Мастер-класс: резюме для стажировки', 'Покажем, как описать учёбу, проекты и языки на одной странице. Возьмите с собой черновик резюме, если он уже есть.',
    everyone, 'Администрация', '2026-11-16T09:00:00+03:00', '2026-12-03T15:00:00+03:00', 'Корпус Г, аудитория 3124'),
];

/** Кто из вымышленных одногруппников уже отметил «Пойду» */
export const seedGoing: [studentId: string, itemId: string][] = [
  [recipients[2].id, events[1].id],
  [recipients[2].id, events[2].id],
  [recipients[3].id, events[2].id],
];

export const banners: MockBanner[] = [
  {
    id: '75000000-0000-4000-8000-000000000001', priority: 'normal', audience: everyone, created_at: '2026-11-14T09:00:00+03:00',
    title: 'Новости и мероприятия — в отдельном разделе',
    body: 'Новости деканата больше не смешиваются с уведомлениями. Отмечайте «Пойду» и добавляйте мероприятия в свой календарь.',
    link_url: '/news', link_label: 'Открыть раздел', starts_at: '2026-11-14T09:00:00+03:00', ends_at: '2026-11-28T23:59:00+03:00',
  },
  {
    id: '75000000-0000-4000-8000-000000000002', priority: 'urgent', audience: everyone, created_at: '2026-11-14T09:00:00+03:00',
    title: 'Плановые работы в ночь на 28 ноября',
    body: 'С 01:00 до 03:00 кабинет может быть недоступен. Поданные заявки и загруженные файлы сохранятся.',
    link_url: null, link_label: null, starts_at: '2026-11-14T09:00:00+03:00', ends_at: '2026-11-28T03:00:00+03:00',
  },
];

export const seedFeed = [...publications, ...events, ...lessonChanges, ...updates];
export const dayMs = 86_400_000;

export function deadlineDays(value: string, now = new Date()) {
  return (Date.parse(toApiDate(value)) - Date.parse(toApiDate(now))) / dayMs;
}

export function deadlineResponse(item: MockDeadline): S['StaffDeadline'] {
  return { ...item, days_left: deadlineDays(item.due_at) };
}
