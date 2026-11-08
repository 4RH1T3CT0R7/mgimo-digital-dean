import { http, HttpResponse } from 'msw';
import { faculties, profile, weekSchedule } from '../fixtures/academic';
import { list } from '../scenario';

// Владелец — T09/T14: дописывайте обработчики здесь (параметры from/to, /staff/*)
export const academicHandlers = [
  http.get('/api/academic/faculties', () => HttpResponse.json(list(faculties))),
  http.get('/api/academic/me/profile', () => HttpResponse.json(profile)),
  http.get('/api/academic/me/schedule', () => HttpResponse.json({ ...weekSchedule, lessons: list(weekSchedule.lessons) })),
];
