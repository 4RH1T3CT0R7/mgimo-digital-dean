import { http, HttpResponse } from 'msw';
import type { components } from '@/api/notifications';
import { faculties, staffGroups } from '../fixtures/academic';
import { dayMs, deadlines, deadlineDays, deadlineResponse, matchesAudience, recipients, seedFeed, type MockFeedItem } from '../fixtures/notifications';
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

export function resetNotificationsState() {
  reads.clear();
  for (const [key, receipt] of initialReads) reads.set(key, { ...receipt });
  feed.splice(0, feed.length, ...seedFeed);
  deadlineItems.splice(0, deadlineItems.length, ...deadlines);
}

function access(mode: 'student' | 'staff') {
  const user = mockUser();
  if (!user) return error(401, 'unauthenticated', 'Войдите в систему');
  if ((user.role === 'student') !== (mode === 'student')) return error(403, 'forbidden', 'Этот раздел вам недоступен');
  return user;
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
    .map(({ audience: _, ...item }) => ({ ...item, ...reads.get(readKey(studentId, item.id)) }));
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
  };
}

export const notificationsHandlers = [
  http.get(`${api}/me/feed`, ({ request }) => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const params = new URL(request.url).searchParams;
    const types = params.get('type')?.split(',');
    const unread = params.get('unread_only') === 'true';
    const priority = (item: S['FeedItem']) => Number(item.important && !item.read_at);
    const items = myFeed(user.id).filter((item) => (!types || types.includes(item.type)) && (!unread || !item.read_at))
      .sort((a, b) => priority(b) - priority(a) || Date.parse(b.created_at) - Date.parse(a.created_at));
    return HttpResponse.json(page(items, request));
  }),
  http.get(`${api}/me/feed/counters`, () => {
    const user = access('student');
    if (user instanceof HttpResponse) return user;
    const items = list(myFeed(user.id));
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
    if (scenario() !== 'empty') for (const item of myFeed(user.id)) mark(user.id, item.id);
    return new HttpResponse(null, { status: 204 });
  }),
  http.post(`${api}/me/feed/:id/read`, ({ params }) => markItem(String(params.id), false)),
  http.post(`${api}/me/feed/:id/ack`, ({ params }) => markItem(String(params.id), true)),
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
    if (!audience || Object.keys(fields).length) return validation(fields);

    const item: MockFeedItem = {
      id: crypto.randomUUID(), type: body.type, title: body.title.trim(), body: body.body.trim(), audience,
      author_label: user.role === 'admin' ? 'Администрация' : user.display_name, important: body.important,
      requires_ack: body.requires_ack, link: { kind: 'none' }, created_at: new Date().toISOString(),
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
