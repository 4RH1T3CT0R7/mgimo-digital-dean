import { http, HttpResponse } from 'msw';
import { deadlines, feedCounters } from '../fixtures/notifications';
import { list, scenario } from '../scenario';

const DAY = 24 * 60 * 60 * 1000;

// Владелец — T11/T13: дописывайте обработчики здесь (лента, read/ack, /staff/*)
export const notificationsHandlers = [
  http.get('/api/notifications/me/feed/counters', () =>
    HttpResponse.json(scenario() === 'empty' ? { unread: 0, important_unacked: 0, deadlines_soon: 0 } : feedCounters),
  ),
  http.get('/api/notifications/me/deadlines', () =>
    HttpResponse.json(
      list(deadlines).map((d) => ({ ...d, days_left: Math.max(0, Math.floor((Date.parse(d.due_at) - Date.now()) / DAY)) })),
    ),
  ),
];
