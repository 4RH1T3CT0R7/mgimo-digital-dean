import { http, HttpResponse } from 'msw';
import type { components } from '@/api/requests';
import { toApiDate } from '@/shared/lib/format';
import { FACULTY_ID, staffFixtures, staffServiceTypes, type StoredApplication } from '../fixtures/requests-staff';
import { list, page } from '../scenario';
import { mockUser } from './auth';

// Кабинет сотрудника (T12): /staff/* сервиса requests. Данные живут в памяти до перезагрузки страницы.
type Status = components['schemas']['ApplicationStatus'];

// Переходы сотрудника — data-model.md Б5
const TRANSITIONS: Partial<Record<Status, Status[]>> = {
  submitted: ['in_progress', 'rejected'],
  in_progress: ['needs_info', 'ready', 'rejected'],
  needs_info: ['in_progress', 'rejected'],
};
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

let store = staffFixtures();

/** Вернуть данные к исходным (тесты) */
export function resetStaffApplications() {
  store = staffFixtures();
}

function view(a: StoredApplication) {
  const overdue = (a.status === 'submitted' || a.status === 'in_progress') && !!a.due_at && a.due_at < new Date().toISOString();
  return { ...a, overdue, allowed_transitions: TRANSITIONS[a.status] ?? [] };
}

/** staff — свой факультет, admin — все (или faculty_id из запроса) */
function scoped(facultyId?: string | null) {
  const me = mockUser();
  const faculty = me?.role === 'staff' ? me.faculty_id : facultyId;
  return store.filter((a) => !faculty || FACULTY_ID[a.student.faculty_short] === faculty);
}

const find = (id: unknown) => scoped().find((a) => a.id === id);
const error = (status: number, code: string, message: string, details?: object) => HttpResponse.json({ code, message, details }, { status });
const notFound = () => error(404, 'not_found', 'Заявка не найдена');
const conflict = () => error(409, 'invalid_transition', 'Это действие недоступно в текущем статусе заявки');
const closed = (a: StoredApplication) => a.status === 'rejected' || a.status === 'cancelled';

export const requestsStaffHandlers = [
  // Запасной каталог для фильтра «Услуга»: моки студента (T10) подключены раньше и, если отвечают, побеждают
  http.get('/api/requests/service-types', () => HttpResponse.json(staffServiceTypes)),

  http.get('/api/requests/staff/stats', () => {
    const items = list(scoped()).map(view);
    const count = (f: (a: (typeof items)[number]) => boolean) => items.filter(f).length;
    const today = toApiDate();
    return HttpResponse.json({
      submitted: count((a) => a.status === 'submitted'),
      in_progress: count((a) => a.status === 'in_progress'),
      needs_info: count((a) => a.status === 'needs_info'),
      overdue: count((a) => a.overdue),
      ready_today: count((a) => a.status === 'ready' && toApiDate(a.updated_at) === today),
    });
  }),

  http.get('/api/requests/staff/applications', ({ request }) => {
    const p = new URL(request.url).searchParams;
    const statuses = p.get('status')?.split(',');
    const service = p.get('service_type_id');
    const q = p.get('q')?.toLowerCase();
    const items = scoped(p.get('faculty_id'))
      .filter(
        (a) =>
          (!statuses || statuses.includes(a.status)) &&
          (!service || a.service_type.id === service) &&
          (!q || a.number.includes(q) || a.student.full_name.toLowerCase().includes(q)),
      )
      .map(view)
      // Сначала просроченные, затем по сроку (без срока — в конце), затем по дате подачи
      .sort(
        (x, y) =>
          Number(y.overdue) - Number(x.overdue) ||
          (x.due_at ?? '9999').localeCompare(y.due_at ?? '9999') ||
          x.created_at.localeCompare(y.created_at),
      )
      .map(({ id, number, service_type, status, created_at, updated_at, due_at, overdue, last_message_at, last_message_from, student }) => ({
        id,
        number,
        service_type,
        status,
        created_at,
        updated_at,
        due_at,
        overdue,
        last_message_at,
        last_message_from,
        student,
      }));
    return HttpResponse.json(page(items, request));
  }),

  http.get('/api/requests/staff/applications/:id', ({ params }) => {
    const a = find(params.id);
    return a ? HttpResponse.json(view(a)) : notFound();
  }),

  http.post('/api/requests/staff/applications/:id/status', async ({ params, request }) => {
    const a = find(params.id);
    if (!a) return notFound();
    const { status, comment } = (await request.json()) as components['schemas']['StatusChangeRequest'];
    if (!TRANSITIONS[a.status]?.includes(status)) return conflict();
    const text = comment?.trim() || null;
    if (!text && (status === 'needs_info' || status === 'rejected')) {
      return error(400, 'validation_failed', 'Проверьте данные', { fields: { comment: 'Напишите комментарий для студента' } });
    }
    const now = new Date().toISOString();
    a.status = status;
    a.updated_at = now;
    if (status === 'ready' || status === 'rejected') a.due_at = null;
    a.status_history.push({ status, at: now, by_role: 'staff', comment: text });
    return HttpResponse.json(view(a));
  }),

  http.post('/api/requests/staff/applications/:id/messages', async ({ params, request }) => {
    const a = find(params.id);
    if (!a) return notFound();
    if (closed(a)) return conflict();
    const text = ((await request.json()) as components['schemas']['MessageRequest']).text.trim();
    if (!text) return error(400, 'validation_failed', 'Проверьте данные', { fields: { text: 'Напишите сообщение' } });
    const now = new Date().toISOString();
    const message = {
      id: crypto.randomUUID(),
      author_role: 'staff' as const,
      author_label: mockUser()?.role === 'admin' ? 'Администрация' : `Деканат ${a.student.faculty_short}`, // Б9
      text,
      created_at: now,
    };
    a.messages.push(message);
    Object.assign(a, { updated_at: now, last_message_at: now, last_message_from: 'staff' });
    return HttpResponse.json(message, { status: 201 });
  }),

  http.post('/api/requests/staff/applications/:id/attachments', async ({ params, request }) => {
    const a = find(params.id);
    if (!a) return notFound();
    if (closed(a)) return conflict();
    const form = await request.formData();
    const file = form.get('file');
    if (!(file instanceof File)) return error(400, 'validation_failed', 'Проверьте данные', { fields: { file: 'Выберите файл' } });
    if (file.size > 5 * 1024 * 1024) return error(413, 'file_too_large', 'Файл больше 5 МБ');
    if (!FILE_TYPES.includes(file.type)) return error(415, 'unsupported_file_type', 'Можно PDF, JPG или PNG');
    const attachment = {
      id: crypto.randomUUID(),
      file_name: file.name,
      content_type: file.type as 'application/pdf',
      size: file.size,
      uploaded_by_role: 'staff' as const,
      is_result: form.get('is_result') === 'true',
      created_at: new Date().toISOString(),
    };
    a.attachments.push(attachment);
    a.updated_at = attachment.created_at;
    return HttpResponse.json(attachment, { status: 201 });
  }),
];
