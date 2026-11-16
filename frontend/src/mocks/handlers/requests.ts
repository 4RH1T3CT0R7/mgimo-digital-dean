import { http, HttpResponse } from 'msw';
import type { components } from '@/api/requests';
import { academicYearEnd, applications, buildApplication, serviceTypes, studentCards, students, type MockApplication } from '../fixtures/requests';
import { studentCardQr } from '../fixtures/student-card-qr';
import { list, page } from '../scenario';
import { mockUser } from './auth';

// Владелец — T10/T12 (T15 добавляет только /public/certificates/*). Правила — docs/contracts/data-model.md Б5, Б6.
type S = components['schemas'];

const MAX_SIZE = 5 * 1024 * 1024;
const FILE_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

const error = (status: number, code: string, message: string, details?: object) => HttpResponse.json({ code, message, details }, { status });
const notFound = () => error(404, 'not_found', 'Заявка не найдена');
const invalid = (fields: Record<string, string>) => error(400, 'validation_failed', 'Проверьте поля формы', { fields });

function withOverdue(a: MockApplication): MockApplication {
  const overdue = !!a.due_at && Date.parse(a.due_at) < Date.now() && (a.status === 'submitted' || a.status === 'in_progress');
  return { ...a, overdue };
}

/** Заявка текущего студента; чужая — как несуществующая (AGENTS.md, правило 10) */
function own(id: unknown) {
  const user = mockUser();
  return applications.find((a) => a.id === id && a.student.id === user?.id);
}

/** Ответ студенту — без слепка студента (он есть только в /staff/*) */
const forStudent = (a: MockApplication): S['Application'] => ({ ...withOverdue(a), student: undefined }) as S['Application'];

function summary(a: MockApplication): S['ApplicationSummary'] {
  const { id, number, service_type, status, created_at, updated_at, due_at, overdue, last_message_at, last_message_from } = withOverdue(a);
  return { id, number, service_type, status, created_at, updated_at, due_at, overdue, last_message_at, last_message_from };
}

function touch(a: MockApplication, at = new Date().toISOString()) {
  a.updated_at = at;
}

function setStatus(a: MockApplication, status: S['ApplicationStatus'], by: S['StatusHistoryEntry']['by_role']) {
  const at = new Date().toISOString();
  a.status = status;
  a.status_history.push({ status, at, by_role: by, comment: null });
  if (status === 'ready' || status === 'rejected' || status === 'cancelled') a.due_at = null;
  touch(a, at);
}

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const certificateCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => BASE32[b % 32]).join('');

// Файлы, загруженные в моке; у файлов из fixtures — заглушка
const blobs = new Map<string, Blob>();

/** Минимальный PDF (латиница): настоящую справку рисует сервис requests, здесь — только чтобы файл открывался. */
function mockPdf(line: string): Blob {
  const stream = `BT /F1 16 Tf 56 760 Td (${line}) Tj 0 -28 Td (KONCEPT. NE YAVLYAETSYA DOKUMENTOM) Tj ET`;
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = objects.map((body, i) => {
    const at = pdf.length;
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
    return at;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([pdf], { type: 'application/pdf' });
}

const fileResponse = (blob: Blob, name: string) =>
  new HttpResponse(blob, { headers: { 'Content-Type': blob.type || 'application/octet-stream', 'Content-Disposition': `attachment; filename="${encodeURIComponent(name)}"` } });

export const requestsHandlers = [
  http.get('/api/requests/public/certificates/:code', ({ params }) =>
  {
    const mode = new URLSearchParams(globalThis.location?.search).get('scenario');
    const application = applications.find((item) => item.status === 'ready' && item.certificate?.code === params.code);

    if (mode === 'network')
    {
      return HttpResponse.error();
    }
    if (mode === 'rate-limit')
    {
      return HttpResponse.json({ code: 'rate_limited', message: 'Слишком много проверок' }, { status: 429, headers: { 'Retry-After': '30' } });
    }
    const expired = mode === 'expired';
    const valid = (until: string) => Date.now() < Date.parse(`${until}T00:00:00+03:00`) + 86_400_000;
    // Код студенческого (D60) проверяется по тому же адресу, что и справка
    const card = Object.entries(studentCards).find(([, c]) => c.code === params.code);
    if (card && list([card]).length > 0)
    {
      const [login, { course }] = card;
      const validUntil = expired ? '2026-08-31' : academicYearEnd();
      const data: S['CertificateVerification'] = {
        kind: 'student_card',
        valid: valid(validUntil),
        title: 'Электронный студенческий билет',
        holder: students[login].short_name,
        faculty_short: students[login].faculty_short,
        course,
        issued_at: '2026-09-01T09:00:00+03:00',
        valid_until: validUntil,
      };

      return HttpResponse.json(data);
    }
    if (!application?.certificate || list([application]).length === 0)
    {
      return HttpResponse.json({ code: 'not_found', message: 'Справка не найдена' }, { status: 404 });
    }
    const certificate = application.certificate;
    const validUntil = expired ? '2026-10-01' : certificate.valid_until;
    const data: S['CertificateVerification'] = {
      kind: 'certificate',
      valid: valid(validUntil),
      title: application.service_type.title,
      holder: application.student.short_name,
      faculty_short: application.student.faculty_short,
      course: null,
      issued_at: expired ? '2026-09-01T09:00:00+03:00' : certificate.issued_at,
      valid_until: validUntil,
    };

    return HttpResponse.json(data);
  }),

  http.get('/api/requests/me/student-card', () => {
    const card = studentCards[mockUser()?.login ?? ''];
    if (!card) return error(403, 'forbidden', 'Доступно только студенту');
    const data: S['StudentCard'] = { ...card, valid_until: academicYearEnd(), verify_url: `/verify/${card.code}` };
    return HttpResponse.json(data);
  }),

  http.get('/api/requests/me/student-card/qr.png', () => {
    const card = studentCards[mockUser()?.login ?? ''];
    if (!card) return error(404, 'not_found', 'Код ещё не выдан');
    const png = Uint8Array.from(atob(studentCardQr[card.code]), (c) => c.charCodeAt(0));
    return new HttpResponse(png, { headers: { 'Content-Type': 'image/png' } });
  }),

  http.get('/api/requests/service-types', () => HttpResponse.json(list(serviceTypes))),

  http.get('/api/requests/me/applications', ({ request }) => {
    const user = mockUser();
    const params = new URL(request.url).searchParams;
    const statuses = params.get('status')?.split(',');
    const answered = params.get('answered') === 'true';
    const items = applications
      .filter((a) => a.student.id === user?.id)
      .filter((a) => !statuses || statuses.includes(a.status))
      .filter((a) => !answered || ['ready', 'needs_info', 'rejected'].includes(a.status) || a.last_message_from === 'staff')
      .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
      .map(summary);
    return HttpResponse.json(page(items, request));
  }),

  http.post('/api/requests/me/applications', async ({ request }) => {
    const body = (await request.json()) as S['CreateApplicationRequest'];
    const service = serviceTypes.find((s) => s.id === body.service_type_id);
    if (!service) return invalid({ service_type_id: 'Такой услуги нет' });

    const errors: Record<string, string> = {};
    const fields: Record<string, string> = {};
    for (const f of service.fields) {
      const value = body.fields?.[f.key]?.trim() ?? '';
      if (!value) {
        if (f.required) errors[f.key] = 'Обязательное поле';
        continue;
      }
      if (f.type === 'select' && !f.options?.includes(value)) errors[f.key] = 'Выберите вариант из списка';
      else if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) errors[f.key] = 'Укажите дату';
      else if (f.max_length && value.length > f.max_length) errors[f.key] = `Не длиннее ${f.max_length} символов`;
      fields[f.key] = value;
    }
    if ((body.comment?.length ?? 0) > 2000) errors.comment = 'Не длиннее 2000 символов';
    if (Object.keys(errors).length > 0) return invalid(errors);

    const instant = service.kind === 'instant_certificate';
    const application = buildApplication({
      number: Math.max(0, ...applications.map((a) => Number(a.number))) + 1,
      student: students[mockUser()?.login ?? ''] ?? students['student.mo'],
      serviceTypeId: service.id,
      fields,
      comment: body.comment?.trim() || null,
      createdHoursAgo: 0,
      history: [instant ? ['ready', 0, 'system'] : ['submitted', 0, 'student']],
      certificateCode: instant ? certificateCode() : undefined,
    });
    applications.push(application);
    return HttpResponse.json(forStudent(application), { status: 201 });
  }),

  http.get('/api/requests/me/applications/:id', ({ params }) => {
    const a = own(params.id);
    return a ? HttpResponse.json(forStudent(a)) : notFound();
  }),

  http.post('/api/requests/me/applications/:id/cancel', ({ params }) => {
    const a = own(params.id);
    if (!a) return notFound();
    if (a.status !== 'submitted') return error(409, 'invalid_transition', 'Отозвать можно только заявку, которую ещё не взяли в работу.');
    setStatus(a, 'cancelled', 'student');
    return HttpResponse.json(forStudent(a));
  }),

  http.put('/api/requests/me/applications/:id/feedback', async ({ params, request }) => {
    const a = own(params.id);
    if (!a) return notFound();
    const body = (await request.json()) as S['FeedbackRequest'];
    const comment = body.comment?.trim() || null;
    if (comment && comment.length > 1000) return invalid({ comment: 'Не больше 1000 символов' });
    if (!(a.status === 'ready' || a.status === 'rejected') || a.service_type.kind === 'instant_certificate') {
      return error(409, 'invalid_transition', 'Оценить можно только завершённую заявку');
    }
    a.feedback = { helpful: body.helpful, comment, at: new Date().toISOString() };
    return HttpResponse.json(forStudent(a));
  }),

  http.post('/api/requests/me/applications/:id/messages', async ({ params, request }) => {
    const a = own(params.id);
    if (!a) return notFound();
    const text = ((await request.json()) as S['MessageRequest']).text?.trim() ?? '';
    if (!text || text.length > 4000) return invalid({ text: 'Напишите сообщение до 4000 символов' });
    if (a.status === 'rejected' || a.status === 'cancelled') return error(409, 'invalid_transition', 'Заявка закрыта — писать по ней нельзя.');
    const message: S['Message'] = {
      id: crypto.randomUUID(),
      author_role: 'student',
      author_label: a.student.short_name,
      text,
      created_at: new Date().toISOString(),
    };
    a.messages.push(message);
    a.last_message_at = message.created_at;
    a.last_message_from = 'student';
    // Б5: ответ студента в needs_info возвращает заявку в работу
    if (a.status === 'needs_info') setStatus(a, 'in_progress', 'student');
    else touch(a, message.created_at);
    return HttpResponse.json(message, { status: 201 });
  }),

  http.post('/api/requests/me/applications/:id/attachments', async ({ params, request }) => {
    const a = own(params.id);
    if (!a) return notFound();
    const allowed = serviceTypes.find((s) => s.id === a.service_type.id)?.attachments.allowed;
    if (!allowed || (a.status !== 'submitted' && a.status !== 'needs_info')) {
      return error(409, 'invalid_transition', 'К этой заявке сейчас нельзя приложить файл.');
    }
    const file = (await request.formData()).get('file');
    if (!(file instanceof File)) return invalid({ file: 'Выберите файл' });
    if (file.size > MAX_SIZE) return error(413, 'file_too_large', 'Файл больше 5 МБ.');
    if (!FILE_TYPES.includes(file.type)) return error(415, 'unsupported_file_type', 'Можно приложить PDF, JPG или PNG.');
    const attachment: S['Attachment'] = {
      id: crypto.randomUUID(),
      file_name: file.name,
      content_type: file.type as S['Attachment']['content_type'],
      size: file.size,
      uploaded_by_role: 'student',
      is_result: false,
      created_at: new Date().toISOString(),
    };
    blobs.set(attachment.id, file);
    a.attachments.push(attachment);
    // Как и сообщение: файл в needs_info возвращает заявку в работу
    if (a.status === 'needs_info') setStatus(a, 'in_progress', 'student');
    else touch(a);
    return HttpResponse.json(attachment, { status: 201 });
  }),

  http.get('/api/requests/me/applications/:id/attachments/:attachmentId', ({ params }) => {
    const file = own(params.id)?.attachments.find((f) => f.id === params.attachmentId);
    if (!file) return error(404, 'not_found', 'Файл не найден');
    return fileResponse(blobs.get(file.id) ?? mockPdf(`Mock file ${file.id.slice(0, 8)}`), file.file_name);
  }),

  http.get('/api/requests/me/applications/:id/certificate.pdf', ({ params }) => {
    const a = own(params.id);
    if (!a?.certificate || a.status !== 'ready') return error(404, 'not_found', 'Справка не найдена');
    return fileResponse(mockPdf(`Spravka N ${a.number}, kod ${a.certificate.code}`), `spravka-${a.number}.pdf`);
  }),
];
