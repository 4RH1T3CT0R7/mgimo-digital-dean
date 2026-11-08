import { http, HttpResponse } from 'msw';
import { myApplications } from '../fixtures/requests';
import { page } from '../scenario';

// Владелец — T10/T12 (T15 добавляет только /public/certificates/*)
export const requestsHandlers = [
  http.get('/api/requests/me/applications', ({ request }) => HttpResponse.json(page(myApplications, request))),
];
