import { http, HttpResponse } from 'msw';
import type { components } from '@/api/notifications';
import { dayMs, deadlines, deadlineDays, matchesAudience, recipients, seedFeed } from '../fixtures/notifications';
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
];
