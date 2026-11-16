import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { FACULTY_ID, applications, resetApplications } from '@/mocks/fixtures/requests';
import { renderWithProviders, server } from '@/test/render';

const LIST = '/api/requests/staff/applications';
const STATUS = '/api/requests/staff/applications/:id/status';
const appUrl = (n: number) => `/staff/requests/50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const SUBMITTED_QUESTION = appUrl(12); // «Вопрос в деканат» студентки ФМО, статус submitted

/** Номера заявок в таблице (на компьютере; карточки телефона — та же выборка) */
async function tableNumbers() {
  const table = await screen.findByRole('table');
  return within(table)
    .getAllByRole('link')
    .map((l) => l.textContent);
}

/** Записывает адреса запросов списка и пропускает их дальше к мокам */
function captureListRequests() {
  const urls: URL[] = [];
  server.use(
    http.get(LIST, ({ request }) => {
      urls.push(new URL(request.url));
    }),
  );
  return urls;
}

beforeEach(resetApplications);

describe('Список заявок /staff', () => {
  it('staff видит только свой факультет, просроченные — первыми, фильтра факультета нет', async () => {
    renderWithProviders(<AppRoutes />, { route: '/staff', login: 'dekanat.mo' });
    const numbers = await tableNumbers();
    expect(numbers.slice(0, 2).sort()).toEqual(['№ 000010', '№ 000011']);
    expect(numbers).not.toContain('№ 000002'); // заявка МЭО
    expect(within(screen.getByRole('table')).getAllByText('Просрочено')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'Просрочены: 2' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Факультет')).not.toBeInTheDocument();
  });

  it('счётчик «Просрочены» передаёт status=submitted,in_progress и оставляет только просроченные', async () => {
    const urls = captureListRequests();
    const { user } = renderWithProviders(<AppRoutes />, { route: '/staff', login: 'dekanat.mo' });
    await user.click(await screen.findByRole('button', { name: /^Просрочены/ }));
    expect(screen.getByRole('button', { name: /^Просрочены/ })).toHaveAttribute('aria-pressed', 'true');
    await vi.waitFor(() => expect(urls.at(-1)?.searchParams.get('status')).toBe('submitted,in_progress'));
    await vi.waitFor(async () => expect((await tableNumbers()).sort()).toEqual(['№ 000010', '№ 000011']));
  });

  it('admin видит фильтр факультета, и он передаёт faculty_id', async () => {
    const urls = captureListRequests();
    renderWithProviders(<AppRoutes />, { route: `/staff?faculty_id=${FACULTY_ID['МЭО']}`, login: 'admin' });
    expect(await screen.findByLabelText('Факультет')).toBeInTheDocument();
    expect((await tableNumbers()).sort()).toEqual(['№ 000002', '№ 000005', '№ 000008', '№ 000009']);
    expect(urls.at(-1)?.searchParams.get('faculty_id')).toBe(FACULTY_ID['МЭО']);
  });

  it('?scenario=empty — пустое состояние', async () => {
    renderWithProviders(<AppRoutes />, { route: '/staff?scenario=empty', login: 'dekanat.mo' });
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
  });
});

describe('Заявка /staff/requests/:id', () => {
  it('кнопки статусов — только из allowed_transitions', async () => {
    renderWithProviders(<AppRoutes />, { route: SUBMITTED_QUESTION, login: 'dekanat.mo' });
    const actions = await screen.findByRole('button', { name: 'Взять в работу' });
    const buttons = within(actions.parentElement!).getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['Взять в работу', 'Отклонить']);
  });

  it('кнопки берутся из ответа сервера, а не вычисляются на клиенте', async () => {
    // Заявка в submitted, но сервер разрешил только «Запросить уточнения»
    const submitted = applications.find((a) => a.number === '000012')!;
    server.use(
      http.get('/api/requests/staff/applications/:id', () =>
        HttpResponse.json({ ...submitted, overdue: false, allowed_transitions: ['needs_info'] }),
      ),
    );
    renderWithProviders(<AppRoutes />, { route: SUBMITTED_QUESTION, login: 'dekanat.mo' });
    expect(await screen.findByRole('button', { name: 'Запросить уточнения' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Взять в работу' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отклонить' })).not.toBeInTheDocument();
  });

  it('у завершённой заявки кнопок нет', async () => {
    renderWithProviders(<AppRoutes />, { route: appUrl(1), login: 'dekanat.mo' });
    expect(await screen.findByRole('heading', { name: 'Заявка № 000001' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Действия с заявкой' })).not.toBeInTheDocument();
  });

  it('«Отклонить» без комментария не отправляется, с комментарием — отклоняет', async () => {
    const sent = vi.fn();
    server.use(
      http.post(STATUS, () => {
        sent(); // и дальше — к моку
      }),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: SUBMITTED_QUESTION, login: 'dekanat.mo' });
    await user.click(await screen.findByRole('button', { name: 'Отклонить' }));
    const dialog = screen.getByRole('dialog', { name: 'Отклонить заявку № 000012?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отклонить' }));
    expect(within(dialog).getByText('Напишите комментарий для студента')).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Комментарий для студента/)).toHaveAttribute('aria-invalid', 'true');
    expect(sent).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText(/Комментарий для студента/), 'Вопрос не по адресу');
    await user.click(within(dialog).getByRole('button', { name: 'Отклонить' }));
    expect(await screen.findByText('Заявка № 000012 отклонена')).toBeInTheDocument();
    expect(sent).toHaveBeenCalledOnce();
    expect(await screen.findByRole('heading', { name: 'Заявка № 000012' })).toBeInTheDocument();
    expect(screen.queryByRole('group', { name: 'Действия с заявкой' })).not.toBeInTheDocument();
    expect(screen.getByText('Вопрос не по адресу')).toBeInTheDocument(); // комментарий в истории
  });

  it('409 показывается понятным текстом', async () => {
    server.use(
      http.post(STATUS, () =>
        HttpResponse.json({ code: 'invalid_transition', message: 'Это действие недоступно в текущем статусе заявки' }, { status: 409 }),
      ),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: SUBMITTED_QUESTION, login: 'dekanat.mo' });
    await user.click(await screen.findByRole('button', { name: 'Взять в работу' }));
    expect(await screen.findByText('Это действие недоступно в текущем статусе заявки')).toBeInTheDocument();
  });

  it('ответ студенту появляется в переписке с подписью деканата', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: SUBMITTED_QUESTION, login: 'dekanat.mo' });
    await user.type(await screen.findByLabelText('Ответ студенту'), 'Стипендию начислят до 25 числа.');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByText('Стипендию начислят до 25 числа.')).toBeInTheDocument();
    expect(screen.getByText(/^Деканат ФМО, /)).toBeInTheDocument();
    expect(screen.getByLabelText('Ответ студенту')).toHaveValue('');
  });
});

describe('Шаблоны ответов', () => {
  it('шаблон вставляется в поле ответа и дописывается к уже введённому тексту', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: SUBMITTED_QUESTION, login: 'dekanat.mo' });
    const field = await screen.findByLabelText('Ответ студенту');
    const templates = screen.getByRole('group', { name: 'Шаблоны ответов' });
    await user.click(within(templates).getByRole('button', { name: 'Приняли в работу' }));
    expect(field).toHaveValue('Заявку приняли в работу. Сообщим, как только всё будет готово.');
    await user.click(within(templates).getByRole('button', { name: 'Спасибо' }));
    expect((field as HTMLTextAreaElement).value.split('\n')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    expect(await screen.findByText(/Заявку приняли в работу/)).toBeInTheDocument();
  });
});

describe('Деканат видит ответы студентов (W4)', () => {
  it('метка «Студент написал» — только у заявок, где последнее сообщение от студента', async () => {
    renderWithProviders(<AppRoutes />, { route: '/staff', login: 'dekanat.mo' });
    const table = await screen.findByRole('table');
    expect(within(table).getAllByText('Студент написал')).toHaveLength(1);
    const row = within(table).getByRole('link', { name: '№ 000011' }).closest('tr')!;
    expect(within(row).getByText('Студент написал')).toBeInTheDocument();
    // № 000001 и № 000003: последним писал деканат
    for (const n of ['№ 000001', '№ 000003']) {
      expect(within(within(table).getByRole('link', { name: n }).closest('tr')!).queryByText('Студент написал')).not.toBeInTheDocument();
    }
  });

  it('счётчики администратора — по выбранному факультету, как список', async () => {
    const urls: URL[] = [];
    server.use(
      http.get('/api/requests/staff/stats', ({ request }) => {
        urls.push(new URL(request.url));
      }),
    );
    renderWithProviders(<AppRoutes />, { route: `/staff?faculty_id=${FACULTY_ID['МЭО']}`, login: 'admin' });
    // У МЭО в работе нет ничего, у всех факультетов вместе — две заявки ФМО
    expect(await screen.findByRole('button', { name: 'В работе: 0' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ждут студента: 1' })).toBeInTheDocument();
    expect(urls.at(-1)?.searchParams.get('faculty_id')).toBe(FACULTY_ID['МЭО']);
  });

  it('«Завершить» у документа без файла: подсказка «где и когда забрать» и предупреждение', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: appUrl(3), login: 'dekanat.mo' });
    await user.click(await screen.findByRole('button', { name: 'Завершить заявку' }));
    const dialog = screen.getByRole('dialog', { name: 'Завершить заявку № 000003?' });
    expect(within(dialog).getByLabelText(/Комментарий для студента/)).toHaveAttribute('placeholder', 'Где и когда забрать документ');
    expect(within(dialog).getByText(/Файл документа не приложен/)).toBeInTheDocument();
  });

  it('с файлом-результатом предупреждения нет', async () => {
    applications
      .find((a) => a.number === '000003')!
      .attachments.push({
        id: '52000000-0000-4000-8000-000000000999',
        file_name: 'spravka.pdf',
        content_type: 'application/pdf',
        size: 1024,
        uploaded_by_role: 'staff',
        is_result: true,
        created_at: new Date().toISOString(),
      });
    const { user } = renderWithProviders(<AppRoutes />, { route: appUrl(3), login: 'dekanat.mo' });
    await user.click(await screen.findByRole('button', { name: 'Завершить заявку' }));
    const dialog = screen.getByRole('dialog', { name: 'Завершить заявку № 000003?' });
    expect(within(dialog).getByLabelText(/Комментарий для студента/)).toHaveAttribute('placeholder', 'Где и когда забрать документ');
    expect(within(dialog).queryByText(/Файл документа не приложен/)).not.toBeInTheDocument();
  });
});

describe('Общее хранилище моков (T10 + T12)', () => {
  it('ответ деканата попадает в ту же заявку, которую видит студент', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: appUrl(3), login: 'dekanat.mo' });
    await user.type(await screen.findByLabelText('Ответ студенту'), 'Справка будет готова завтра.');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));
    await screen.findByText('Справка будет готова завтра.');
    // Моки студента (handlers/requests.ts) читают этот же массив
    const shared = applications.find((a) => a.number === '000003')!;
    expect(shared.messages.map((m) => m.text)).toContain('Справка будет готова завтра.');
    expect(shared.student.short_name).toBe('Лебедева А. В.'); // заявка student.mo
  });
});
