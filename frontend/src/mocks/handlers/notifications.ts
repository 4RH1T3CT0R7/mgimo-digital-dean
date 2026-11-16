import { http, HttpResponse } from 'msw';
import type { components } from '@/api/notifications';
import { faculties, staffGroups } from '../fixtures/academic';
import {
  banners, dayMs, deadlines, deadlineDays, deadlineResponse, matchesAudience, recipients, seedFeed, seedGoing,
  type MockBanner, type MockFeedItem,
} from '../fixtures/notifications';
import { serviceTypes } from '../fixtures/requests';
import { list, page, scenario } from '../scenario';
import { mockUser } from './auth';

type S = components['schemas'];
const api = '/api/notifications';
const unreadSeed = new Set([
  '71000000-0000-4000-8000-000000000005',
  '73000000-0000-4000-8000-000000000004',
  seedFeed.find((item) => item.type === 'schedule_change' && item.title.startsWith('Перенос:'))?.id,
]);
const initialReads = seedFeed.filter((item) => !unreadSeed.has(item.id))
  .map((item) => [readKey(recipients[0].id, item.id), { read_at: item.created_at }] as const);
const reads = new Map<string, { read_at: string; acked_at?: string }>(initialReads);
const feed = [...seedFeed];
const deadlineItems = [...deadlines];
/** Отметки «Пойду»: ключи readKey */
const going = new Set(seedGoing.map(([student, item]) => readKey(student, item)));
const bannerItems = [...banners];
/** Скрытые баннеры: ключи readKey */
const dismissed = new Set<string>();

export function resetNotificationsState() {
  reads.clear();
  for (const [key, receipt] of initialReads) reads.set(key, { ...receipt });
  feed.splice(0, feed.length, ...seedFeed);
  deadlineItems.splice(0, deadlineItems.length, ...deadlines);
  going.clear();
  for (const [student, item] of seedGoing) going.add(readKey(student, item));
  bannerItems.splice(0, bannerItems.length, ...banners.map((item) => ({ ...item })));
  dismissed.clear();
}

/** student — только студент; staff — сотрудник или администратор; admin — только администратор (/admin/*) */
function access(mode: 'student' | 'staff' | 'admin') {
  const user = mockUser();
  if (!user) return error(401, 'unauthenticated', 'Войдите в систему');
  const allowed = mode === 'admin' ? user.role === 'admin' : (user.role === 'student') === (mode === 'student');
  if (!allowed) return error(403, 'forbidden', 'Этот раздел вам недоступен');
  return user;
}

function goingCount(itemId: string) {
  return [...going].filter((key) => key.endsWith(`/${itemId}`)).length;
}

function bannerStatus(item: MockBanner, now = Date.now()): S['BannerStatus'] {
  if (now < Date.parse(item.starts_at)) return 'scheduled';
  return now < Date.parse(item.ends_at) ? 'active' : 'ended';
}

function adminBanner(item: MockBanner): S['AdminBanner'] {
  return { ...item, status: bannerStatus(item), dismissed_count: [...dismissed].filter((key) => key.endsWith(`/${item.id}`)).length };
}

/** Как на сервере: внутренний путь или https с хостом и без логина в адресе */
function validLink(value: string) {
  if (/^\/[a-z0-9][a-z0-9/_-]*$/.test(value)) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !!url.hostname && !url.username && !url.password && value.startsWith('https://');
  } catch {
    return false;
  }
}

function myBanners(studentId: string) {
  const recipient = recipients.find(({ id }) => id === studentId);
  if (!recipient) return [];
  return bannerItems.filter((item) => bannerStatus(item) === 'active' && matchesAudience(item.audience, recipient));
}

function error(status: number, code: string, message: string) {
  return HttpResponse.json({ code, message }, { status });
}

function notFound() {
  return error(404, 'not_found', 'Запись не найдена');
}

function readKey(studentId: string, itemId: string) {
  return `${studentId}/${itemId}`;
}

function mark(studentId: string, itemId: string, ack = false) {
  const key = readKey(studentId, itemId);
  const now = new Date().toISOString();
  const receipt = reads.get(key) ?? { read_at: now };
  if (ack) receipt.acked_at ??= now;
  reads.set(key, receipt);
}

function myFeed(studentId: string): S['FeedItem'][] {
  const recipient = recipients.find(({ id }) => id === studentId);
  if (!recipient) return [];
  return feed.filter(({ audience }) => matchesAudience(audience, recipient))
    .map(({ audience: _, event_starts_at, event_place, ...item }) => ({
      ...item,
      ...reads.get(readKey(studentId, item.id)),
      ...(event_starts_at && event_place && {
        event: { starts_at: event_starts_at, place: event_place, going_count: goingCount(item.id), going: going.has(readKey(studentId, item.id)) },
      }),
    }));
}

/** Лента «Уведомлений» без новостей (D61) */
function myNotifications(studentId: string) {
  return myFeed(studentId).filter((item) => item.type !== 'news');
}

function myDeadlines(studentId: string, days: number) {
  const recipient = recipients.find(({ id }) => id === studentId);
  if (!recipient) return [];
  const now = Date.now();
  return deadlineItems.filter(({ audience, due_at }) => matchesAudience(audience, recipient)
    && Date.parse(due_at) >= now && Date.parse(due_at) <= now + days * dayMs)
    .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
}

function markItem(itemId: string, ack: boolean) {
  const user = access('student');
  if (user instanceof HttpResponse) return user;
  const item = myFeed(user.id).find(({ id }) => id === itemId);
  if (!item) return notFound();
  if (ack && !item.requires_ack) return error(409, 'conflict', 'Это уведомление не требует подтверждения');
  mark(user.id, itemId, ack);
  return new HttpResponse(null, { status: 204 });
}

function staffCanSee(user: NonNullable<ReturnType<typeof mockUser>>, audience: S['Audience']) {
  return user.role === 'admin' || (!!user.faculty_id && audience.faculty_id === user.faculty_id);
}

function normalizeAudience(value: S['Audience'] | undefined, user: NonNullable<ReturnType<typeof mockUser>>) {
  if (!value || !['all', 'faculty', 'course', 'group'].includes(value.kind)) return null;
  if (value.kind === 'all') return user.role === 'admin' ? { kind: 'all' } as const : null;
  if (user.role === 'staff' && value.faculty_id && value.faculty_id !== user.faculty_id) return null;

  const group = value.kind === 'group' ? staffGroups.find(({ id }) => id === value.group_id) : undefined;
  const groupFaculty = group && faculties.find(({ short_name }) => short_name === group.faculty_short)?.id;
  const facultyId = user.role === 'staff' ? user.faculty_id : value.faculty_id ?? groupFaculty;
  if (!facultyId || !faculties.some(({ id }) => id === facultyId)) return null;

  if (value.kind === 'group') {
    if (!group || groupFaculty !== facultyId) return null;
    return { kind: 'group', faculty_id: facultyId, group_id: group.id } as const;
  }
  if (value.kind === 'course') {
    if (value.course === undefined || !Number.isInteger(value.course) || value.course < 1 || value.course > 6) return null;
    return { kind: 'course', faculty_id: facultyId, course: value.course } as const;
  }
  return { kind: 'faculty', faculty_id: facultyId } as const;
}

function validation(fields: Record<string, string>) {
  return HttpResponse.json({
    code: 'validation_failed', message: 'Проверьте поля формы', details: { fields },
  }, { status: 400 });
}

function validText(value: unknown, min: number, max: number): value is string {
  if (typeof value !== 'string') return false;
  const length = [...value.trim()].length;
  return length >= min && length <= max;
}

function announcementItem(item: MockFeedItem): S['StaffAnnouncement'] | null {
  if (item.type !== 'announcement' && item.type !== 'news') return null;
  const audienceReceipts = recipients.filter((recipient) => matchesAudience(item.audience, recipient))
    .map(({ id }) => reads.get(readKey(id, item.id)));
  return {
    id: item.id, type: item.type, title: item.title, body: item.body, important: item.important,
    requires_ack: item.requires_ack, audience: item.audience, created_at: item.created_at,
    read_count: audienceReceipts.filter((receipt) => receipt?.read_at).length,
    acked_count: item.requires_ack ? audienceReceipts.filter((receipt) => receipt?.acked_at).length : null,
    event_starts_at: item.event_starts_at ?? null, event_place: item.event_place ?? null,
    going_count: item.event_starts_at ? goingCount(item.id) : null,
  };
}

function setGoing(itemId: string, value: boolean) {
  const user = access('student');
  if (user instanceof HttpResponse) return user;
  const item = myFeed(user.id).find(({ id }) => id === itemId);
  if (!item) return notFound();
  if (!item.event || Date.parse(item.event.starts_at) <= Date.now()) {
    return error(409, 'conflict', 'Это не мероприятие или оно уже прошло');
  }
  mark(user.id, itemId);
  if (value) going.add(readKey(user.id, itemId));
  else going.delete(readKey(user.id, itemId));
  return new HttpResponse(null, { status: 204 });
}

export const notificationsHandlers = [
  http.get(`${api}/me/feed`, ({ request }) => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const params = new URL(request.url).searchParams;
    const types = params.get('type')?.split(',');
    const unread = params.get('unread_only') === 'true';
    const priority = (item: S['FeedItem']) => Number(item.important && !item.read_at);
    const items = (types ? myFeed(user.id) : myNotifications(user.id))
      .filter((item) => (!types || types.includes(item.type)) && (!unread || !item.read_at))
      .sort((a, b) => priority(b) - priority(a) || Date.parse(b.created_at) - Date.parse(a.created_at));
    return HttpResponse.json(page(items, request));
  }),
  http.get(`${api}/me/feed/counters`, () => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const items = list(myNotifications(user.id));
    return HttpResponse.json({
      unread: items.filter((item) => !item.read_at).length,
      important_unacked: items.filter((item) => item.requires_ack && !item.acked_at).length,
      deadlines_soon: list(myDeadlines(user.id, 3)).length,
    });
  }),
  http.get(`${api}/me/deadlines`, ({ request }) => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const days = Number(new URL(request.url).searchParams.get('days') ?? 14);
    return HttpResponse.json(list(myDeadlines(user.id, days)).map(({ audience: _, created_at: __, ...item }) => ({
      ...item, days_left: deadlineDays(item.due_at),
    })));
  }),
  http.post(`${api}/me/feed/read-all`, () => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    if (scenario() !== 'empty') for (const item of myNotifications(user.id)) mark(user.id, item.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${api}/me/feed/:id/read`, ({ params }) => markItem(String(params.id), false)),
  http.post(`${api}/me/feed/:id/ack`, ({ params }) => markItem(String(params.id), true)),
  http.post(`${api}/me/feed/:id/going`, ({ params }) => setGoing(String(params.id), true)),
  http.delete(`${api}/me/feed/:id/going`, ({ params }) => setGoing(String(params.id), false)),
  http.get(`${api}/me/banners`, () => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const items = myBanners(user.id)
      .filter((item) => item.priority === 'urgent' || !dismissed.has(readKey(user.id, item.id)))
      .sort((a, b) => Number(b.priority === 'urgent') - Number(a.priority === 'urgent')
        || Date.parse(b.starts_at) - Date.parse(a.starts_at) || Date.parse(b.created_at) - Date.parse(a.created_at))
      .slice(0, 3)
      .map(({ audience: _, created_at: __, ...item }) => item);
    return HttpResponse.json(list(items));
  }),
  http.post(`${api}/me/banners/:id/dismiss`, ({ params }) => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const item = myBanners(user.id).find(({ id }) => id === params.id);
    if (!item) return notFound();
    if (item.priority === 'urgent') return error(409, 'conflict', 'Срочное объявление скрыть нельзя');
    dismissed.add(readKey(user.id, item.id));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${api}/admin/banners`, () => {
    const user = access('admin');
    if (user instanceof HttpResponse) return user;
    const items = [...bannerItems].sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at)).map(adminBanner);
    return HttpResponse.json(list(items));
  }),
  http.post(`${api}/admin/banners`, async ({ request }) => {
    const user = access('admin');
    if (user instanceof HttpResponse) return user;
    const body = await request.json() as S['CreateBannerRequest'];
    const fields: Record<string, string> = {};
    const audience = normalizeAudience(body.audience, user);
    const link = body.link_url?.trim() || null;
    const label = body.link_label?.trim() || null;
    if (!audience) fields.audience = 'Выберите адресата.';
    if (!validText(body.title, 3, 80)) fields.title = 'Введите от 3 до 80 символов.';
    if (body.body != null && !validText(body.body, 0, 200)) fields.body = 'Не больше 200 символов.';
    if (body.priority !== 'normal' && body.priority !== 'urgent') fields.priority = 'Выберите важность.';
    if (link && !validLink(link)) fields.link_url = 'Ссылка — адрес https:// или раздел кабинета, например /news';
    else if (link && !label) fields.link_label = 'Укажите подпись ссылки';
    else if (!link && label) fields.link_url = 'Укажите ссылку или уберите подпись';
    if (label && !validText(label, 1, 30)) fields.link_label = 'Не больше 30 символов';
    if (!(Date.parse(body.ends_at) > Date.parse(body.starts_at))) fields.ends_at = 'Окончание должно быть позже начала';
    else if (!(Date.parse(body.ends_at) > Date.now())) fields.ends_at = 'Окончание должно быть в будущем';
    if (!audience || Object.keys(fields).length) return validation(fields);

    const item: MockBanner = {
      id: crypto.randomUUID(), title: body.title.trim(), body: body.body?.trim() || null, priority: body.priority,
      link_url: link, link_label: label, audience, starts_at: body.starts_at, ends_at: body.ends_at,
      created_at: new Date().toISOString(),
    };
    bannerItems.unshift(item);
    return HttpResponse.json(adminBanner(item), { status: 201 });
  }),
  http.post(`${api}/admin/banners/:id/end`, ({ params }) => {
    const user = access('admin');
    if (user instanceof HttpResponse) return user;
    const item = bannerItems.find(({ id }) => id === params.id);
    if (!item) return notFound();
    if (bannerStatus(item) === 'ended') return error(409, 'conflict', 'Баннер уже снят');
    const now = new Date().toISOString();
    item.ends_at = now;
    if (Date.parse(item.starts_at) > Date.parse(now)) item.starts_at = now;
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(`${api}/staff/announcements`, ({ request }) => {
    const user = access('staff');
    if (user instanceof HttpResponse) return user;
    const items = feed.filter(({ audience }) => staffCanSee(user, audience)).map(announcementItem)
      .filter((item) => item !== null).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    return HttpResponse.json(page(items, request));
  }),
  http.post(`${api}/staff/announcements`, async ({ request }) => {
    const user = access('staff');
    if (user instanceof HttpResponse) return user;
    const body = await request.json() as S['CreateAnnouncementRequest'];
    const fields: Record<string, string> = {};
    const audience = normalizeAudience(body.audience, user);
    if (!audience) fields.audience = 'Выберите адресата, доступного для вашей роли.';
    if (!validText(body.title, 3, 120)) fields.title = 'Введите от 3 до 120 символов.';
    if (!validText(body.body, 1, 4000)) fields.body = 'Введите от 1 до 4000 символов.';
    if (body.type !== 'announcement' && body.type !== 'news') fields.type = 'Выберите тип публикации.';
    if (typeof body.important !== 'boolean') fields.important = 'Укажите важность.';
    if (typeof body.requires_ack !== 'boolean' || (body.type !== 'announcement' && body.requires_ack)) {
      fields.requires_ack = 'Подтверждение доступно только для объявлений.';
    }
    const place = body.event_place?.trim() || null;
    if (body.event_starts_at || place) {
      if (body.type !== 'news') fields.event_starts_at = 'Мероприятием может быть только новость';
      else if (!body.event_starts_at) fields.event_starts_at = 'Укажите дату и время мероприятия';
      else if (!place || !validText(place, 1, 120)) fields.event_place = 'Укажите место: до 120 символов';
      else if (!(Date.parse(body.event_starts_at) > Date.now())) fields.event_starts_at = 'Мероприятие должно быть в будущем';
    }
    if (!audience || Object.keys(fields).length) return validation(fields);

    const item: MockFeedItem = {
      id: crypto.randomUUID(), type: body.type, title: body.title.trim(), body: body.body.trim(), audience,
      author_label: user.role === 'admin' ? 'Администрация' : user.display_name, important: body.important,
      requires_ack: body.requires_ack, link: { kind: 'none' }, created_at: new Date().toISOString(),
      ...(body.event_starts_at && place && { event_starts_at: body.event_starts_at, event_place: place }),
    };
    feed.unshift(item);
    return HttpResponse.json(announcementItem(item), { status: 201 });
  }),
  http.get(`${api}/staff/announcements/:id/acks`, ({ params }) => {
    const user = access('staff');
    if (user instanceof HttpResponse) return user;
    const item = feed.find((entry) => entry.id === params.id && staffCanSee(user, entry.audience)
      && (entry.type === 'news' || entry.type === 'announcement'));
    if (!item) return notFound();

    const students = list(recipients.filter((recipient) => matchesAudience(item.audience, recipient)))
      .map(({ id, short_name, group_name }) => ({ id, short_name, group_name, acked_at: reads.get(readKey(id, item.id))?.acked_at ?? null }))
      .sort((a, b) => a.short_name.localeCompare(b.short_name, 'ru'));
    return HttpResponse.json({
      total: students.length, acked: students.filter(({ acked_at }) => acked_at),
      not_acked: students.filter(({ acked_at }) => !acked_at),
    } satisfies S['AckReport']);
  }),
  http.get(`${api}/staff/deadlines`, () => {
    const user = access('staff');
    if (user instanceof HttpResponse) return user;
    const items = deadlineItems.filter(({ audience }) => staffCanSee(user, audience))
      .sort((a, b) => Date.parse(a.due_at) - Date.parse(b.due_at));
    return HttpResponse.json(list(items).map(deadlineResponse));
  }),
  http.post(`${api}/staff/deadlines`, async ({ request }) => {
    const user = access('staff');
    if (user instanceof HttpResponse) return user;
    const body = await request.json() as S['CreateDeadlineRequest'];
    const fields: Record<string, string> = {};
    const audience = normalizeAudience(body.audience, user);
    if (!audience) fields.audience = 'Выберите адресата, доступного для вашей роли.';
    if (!validText(body.title, 3, 120)) fields.title = 'Введите от 3 до 120 символов.';
    if (body.description != null && !validText(body.description, 0, 1000)) fields.description = 'Не больше 1000 символов.';
    if (!['application', 'exam', 'credit', 'coursework', 'other'].includes(body.kind)) fields.kind = 'Выберите тип дедлайна.';
    if (typeof body.due_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(body.due_at)
      || !(Date.parse(body.due_at) > Date.now())) fields.due_at = 'Укажите срок в будущем.';
    if (body.service_type_id != null && (body.kind !== 'application' || !serviceTypes.some(({ id }) => id === body.service_type_id))) {
      fields.service_type_id = 'Выберите доступную услугу для подачи заявлений.';
    }
    if (!audience || Object.keys(fields).length) return validation(fields);

    const item = { ...body, title: body.title.trim(), description: body.description?.trim() || null,
      id: crypto.randomUUID(), audience, created_at: new Date().toISOString() };
    deadlineItems.push(item);
    return HttpResponse.json(deadlineResponse(item), { status: 201 });
  }),
  http.delete(`${api}/staff/deadlines/:id`, ({ params }) => {
    const user = access('staff');
    if (user instanceof HttpResponse) return user;
    const index = deadlineItems.findIndex((item) => item.id === params.id && staffCanSee(user, item.audience));
    if (index < 0) return notFound();
    deadlineItems.splice(index, 1);
    return new HttpResponse(null, { status: 204 });
  }),
];
