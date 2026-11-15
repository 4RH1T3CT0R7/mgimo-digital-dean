import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { notificationsApi } from '@/api/clients';
import { AppRoutes } from '@/app/routes';
import { setMockUser } from '@/mocks/handlers/auth';
import { resetNotificationsState } from '@/mocks/handlers/notifications';
import { renderWithProviders, server } from '@/test/render';

const api = '/api/notifications';
const ackId = '71000000-0000-4000-8000-000000000005';
const deadlineId = '70000000-0000-4000-8000-000000000002';
const path = '/staff/announcements';
const renderPage = (route = path, login = 'dekanat.mo') => renderWithProviders(<AppRoutes />, { route, login });

beforeEach(() => {
  vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
  resetNotificationsState();
});
afterEach(() => vi.useRealTimers());

describe('T13', () => {
  it('X1 — только администратор может выбрать всех студентов', async () => {
    const staff = renderPage();
    await staff.user.click(await screen.findByRole('button', { name: 'Новое объявление' }));
    expect(within(await screen.findByRole('dialog')).queryByRole('option', { name: 'Все студенты' })).not.toBeInTheDocument();
    staff.unmount();
    const admin = renderPage(path, 'admin');
    await admin.user.click(await screen.findByRole('button', { name: 'Новое объявление' }));
    const form = within(await screen.findByRole('dialog'));
    expect(form.getByRole('option', { name: 'Все студенты' })).toBeVisible();
    expect(await form.findByRole('option', { name: /ФМО —/ })).toBeInTheDocument();
  });

  it('X2 — новость не требует подтверждения', async () => {
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Новое объявление' }));
    const form = within(screen.getByRole('dialog'));
    await user.click(form.getByRole('checkbox', { name: 'Требует подтверждения ознакомления' }));
    await user.click(form.getByRole('radio', { name: 'Новость' }));
    expect(form.queryByRole('checkbox', { name: /Требует подтверждения/ })).not.toBeInTheDocument();
  });

  it('X3 — текст серверной ошибки отображается под заголовком', async () => {
    server.use(http.post(`${api}/staff/announcements`, () =>
      HttpResponse.json({ code: 'validation_failed', message: 'Ошибка', details: { fields: { title: 'Этот заголовок уже занят' } } }, { status: 400 })));
    const { user } = renderPage();
    await user.click(await screen.findByRole('button', { name: 'Новое объявление' }));
    const form = within(screen.getByRole('dialog'));
    const title = form.getByLabelText('Заголовок');
    await user.type(title, 'Объявление на завтра');
    await user.type(form.getByLabelText('Текст'), 'Проверьте изменения в расписании.');
    await user.click(form.getByRole('button', { name: 'Опубликовать' }));
    expect(await form.findByText('Этот заголовок уже занят')).toBeVisible();
    expect(title).toHaveAccessibleDescription(/Этот заголовок уже занят/);
    expect(title).toHaveAttribute('aria-invalid', 'true');
  });

  it('X4 — прямая ссылка открывает отчёт с одним подтверждением из трёх', async () => {
    setMockUser('student.mo');
    const { response } = await notificationsApi.POST('/me/feed/{item_id}/ack', { params: { path: { item_id: ackId } } });
    expect(response.status).toBe(204);
    renderPage(`${path}/${ackId}`);
    expect(await screen.findByText('Ознакомились: 1 из 3')).toBeVisible();
    const remaining = screen.getByRole('region', { name: 'Ещё нет' });
    expect(within(remaining).getAllByRole('listitem')).toHaveLength(2);
  });

  it('X5 — удаляет только после подтверждения в диалоге', async () => {
    const remove = vi.fn();
    const onRequest = ({ request }: { request: Request }) => {
      if (request.method === 'DELETE' && new URL(request.url).pathname === `${api}/staff/deadlines/${deadlineId}`) remove();
    };
    server.events.on('request:start', onRequest);
    try {
      const { user } = renderPage('/staff/deadlines');
      const trigger = await screen.findByRole('button', { name: 'Удалить: Зачёт: Международное публичное право' });
      await user.click(trigger);
      const dialog = within(screen.getByRole('dialog', { name: 'Удалить дедлайн?' }));
      expect(remove).not.toHaveBeenCalled();
      await user.click(dialog.getByRole('button', { name: 'Отмена' }));
      expect(remove).not.toHaveBeenCalled();
      await user.click(trigger);
      await user.click(screen.getByRole('button', { name: 'Удалить дедлайн' }));
      await waitFor(() => expect(trigger).not.toBeInTheDocument());
      expect(remove).toHaveBeenCalledOnce();
    } finally {
      server.events.removeListener('request:start', onRequest);
    }
  });

  it('X6 — для подачи заявлений показывает каталог услуг', async () => {
    const requested = vi.fn();
    const onRequest = ({ request }: { request: Request }) => {
      if (new URL(request.url).pathname === '/api/requests/service-types') requested();
    };
    server.events.on('request:start', onRequest);
    try {
      const { user } = renderPage('/staff/deadlines');
      await user.click(await screen.findByRole('button', { name: 'Новый дедлайн' }));
      const form = within(screen.getByRole('dialog'));
      expect(form.queryByRole('combobox', { name: 'Услуга' })).not.toBeInTheDocument();
      await user.selectOptions(form.getByLabelText('Тип'), 'application');
      const select = await form.findByRole('combobox', { name: 'Услуга' });
      expect(within(select).getByRole('option', { name: 'Материальная помощь' })).toBeInTheDocument();
      expect(requested).toHaveBeenCalledOnce();
    } finally {
      server.events.removeListener('request:start', onRequest);
    }
  });

  it('связывает публикацию и дедлайн с лентой адресата и отчётом сотрудника', async () => {
    const staff = renderPage();
    await staff.user.click(await screen.findByRole('button', { name: 'Новое объявление' }));
    const publication = within(screen.getByRole('dialog'));
    await staff.user.type(publication.getByLabelText('Заголовок'), 'Встреча группы');
    await staff.user.type(publication.getByLabelText('Текст'), 'Проверьте время встречи.');
    await staff.user.click(publication.getByRole('checkbox', { name: 'Требует подтверждения ознакомления' }));
    await staff.user.selectOptions(publication.getByLabelText('Кому показать'), 'group');
    const group = await publication.findByLabelText('Группа');
    expect(within(group).queryByRole('option', { name: 'МЭО-23-02' })).not.toBeInTheDocument();
    await staff.user.selectOptions(group, within(group).getByRole('option', { name: 'МО-24-03' }));
    await staff.user.click(publication.getByRole('button', { name: 'Опубликовать' }));
    const reportLink = await screen.findByRole('link', { name: 'Отчёт об ознакомлении: Встреча группы' });
    const reportPath = reportLink.getAttribute('href')!;
    staff.unmount();

    const dates = renderPage('/staff/deadlines');
    await dates.user.click(await screen.findByRole('button', { name: 'Новый дедлайн' }));
    const form = within(screen.getByRole('dialog'));
    await dates.user.type(form.getByLabelText('Заголовок'), 'Подать заявление до пятницы');
    await dates.user.selectOptions(form.getByLabelText('Тип'), 'application');
    await dates.user.selectOptions(await form.findByLabelText('Услуга'), 'financial-aid');
    fireEvent.change(form.getByLabelText('Дата'), { target: { value: '2026-11-20' } });
    await dates.user.click(form.getByRole('button', { name: 'Создать дедлайн' }));
    expect(await screen.findByRole('heading', { name: 'Подать заявление до пятницы' })).toBeVisible();
    dates.unmount();

    const wrongStudent = renderPage('/notifications', 'student.meo');
    expect(await screen.findByText('Срок сдачи курсовой работы')).toBeVisible();
    expect(screen.queryByText('Встреча группы')).not.toBeInTheDocument();
    expect(screen.queryByText('Подать заявление до пятницы')).not.toBeInTheDocument();
    wrongStudent.unmount();

    const student = renderPage('/notifications', 'student.mo');
    const published = (await screen.findByText('Встреча группы')).closest('li')!;
    const deadline = (await screen.findByRole('heading', { name: 'Подать заявление до пятницы' })).closest('li')!;
    expect(within(deadline).getByRole('link', { name: 'Подать заявку' })).toHaveAttribute('href', '/requests/new/financial-aid');
    await student.user.click(within(published).getByRole('button', { name: 'Ознакомлен(а)' }));
    expect(await within(published).findByText('Вы ознакомились 18.11 в 10:00')).toBeVisible();
    student.unmount();

    renderPage(reportPath);
    const confirmed = await screen.findByRole('region', { name: 'Ознакомились' });
    expect(within(confirmed).getByText('Лебедева А. В.')).toBeVisible();
    expect(screen.getByText('Ознакомились: 1 из 3')).toBeVisible();
  });

  it('отклоняет чужую группу при записи и скрывает чужой отчёт', async () => {
    setMockUser('dekanat.meo');
    const { response } = await notificationsApi.POST('/staff/announcements', { body: {
      type: 'announcement', title: 'Объявление', body: 'Текст объявления', important: false, requires_ack: true,
      audience: { kind: 'group', group_id: '20000000-0000-4000-8000-000000000001' },
    } });
    expect(response.status).toBe(400);
    const report = await notificationsApi.GET('/staff/announcements/{announcement_id}/acks', { params: { path: { announcement_id: ackId } } });
    expect(report.response.status).toBe(404);
  });
});

describe('Состояния экранов T11 и T13', () => {
  const screens = [
    { route: '/notifications', login: 'student.mo', empty: 'Новых уведомлений нет', loaded: 'Проверьте время декабрьских зачётов' },
    { route: path, login: 'dekanat.mo', empty: 'Объявлений пока нет', loaded: 'Проверьте время декабрьских зачётов' },
    { route: '/staff/deadlines', login: 'dekanat.mo', empty: 'Дедлайнов пока нет', loaded: 'Зачёт: Международное публичное право' },
  ];

  it.each(screens)('$route — сценарии empty, error и slow', async ({ route, login, empty, loaded }) => {
    const emptyPage = renderPage(`${route}?scenario=empty`, login);
    expect(await screen.findByText(empty)).toBeVisible();
    emptyPage.unmount();

    const errorPage = renderPage(`${route}?scenario=error`, login);
    expect((await screen.findAllByText('Не удалось загрузить данные')).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Повторить' }).length).toBeGreaterThan(0);
    errorPage.unmount();

    renderPage(`${route}?scenario=slow`, login);
    expect(await screen.findAllByText('Загрузка…')).not.toHaveLength(0);
    expect(await screen.findByText(loaded, {}, { timeout: 5000 })).toBeVisible();
  }, 10_000);

  it.each([[360, 'sheet-content'], [1280, 'dialog-content']])('при ширине %i форма использует %s', async (width, slot) => {
    const original = window.matchMedia.bind(window);
    const spy = vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({
      ...original(query),
      matches: query === '(min-width: 640px)' && width >= 640,
    }));
    try {
      const { user } = renderPage();
      await user.click(await screen.findByRole('button', { name: 'Новое объявление' }));
      const dialog = screen.getByRole('dialog');
      expect(dialog).toHaveAttribute('data-slot', slot);
      expect(within(dialog).getByRole('button', { name: 'Опубликовать' })).toBeVisible();
    } finally {
      spy.mockRestore();
    }
  });
});
