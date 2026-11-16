import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { resetApplications } from '@/mocks/fixtures/requests';
import { renderWithProviders, server } from '@/test/render';
import { resubmitPath } from './links';

// Заявки в моке меняются в памяти — каждый тест начинает с исходных
beforeEach(() => resetApplications());

const id = (n: number) => `50000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Статус в шапке заявки: «Статус: » — скрытая подпись для экранного диктора
const statusIs = (label: string) => (_: string, el: Element | null) => el?.textContent === `Статус: ${label}` && !!el.firstElementChild?.classList.contains('sr-only');

describe('Список заявок', () => {
  it('мои заявки со статусами, поиск по номеру, каталог по категориям', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/requests', login: 'student.mo' });
    expect(await screen.findByRole('link', { name: /Вопрос в деканат\s*Ответ дан/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Справка в военкомат\s*В работе/ })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Повторная выдача студенческого билета\s*Отклонена/ })).toBeInTheDocument();

    await user.type(screen.getByLabelText('Поиск по номеру заявки'), '4');
    expect(screen.getAllByRole('link', { name: /№ \d{6}/ }).map((l) => l.textContent)).toEqual([expect.stringContaining('№ 000004')]);

    const catalog = screen.getByRole('region', { name: 'Подать заявку' });
    expect(within(catalog).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['Справки', 'Деканат', 'Финансы']);
    expect(within(catalog).getByRole('link', { name: /Справка с места учёбы.*Сразу/ })).toHaveAttribute('href', '/requests/new/study-certificate');
  });

  it('?scenario=empty — пустые состояния', async () => {
    renderWithProviders(<AppRoutes />, { route: '/requests?scenario=empty', login: 'student.mo' });
    expect(await screen.findByText('Заявок пока нет')).toBeInTheDocument();
    expect(await screen.findByText('Услуг пока нет')).toBeInTheDocument();
  });
});

describe('Новая заявка', () => {
  it('обязательный select без выбора — ошибка под полем, запрос не уходит', async () => {
    let posted = false;
    server.use(
      http.post('/api/requests/me/applications', () => {
        posted = true;
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: '/requests/new/study-certificate', login: 'student.mo' });
    await user.click(await screen.findByRole('button', { name: 'Подать заявку' }));

    const purpose = screen.getByRole('combobox', { name: 'Для чего нужна справка' });
    expect(purpose).toHaveAttribute('aria-invalid', 'true');
    expect(purpose).toHaveAccessibleDescription('Выберите вариант');
    expect(purpose).toHaveFocus();
    expect(posted).toBe(false);
  });

  it('400 с details.fields — ошибка под своим полем', async () => {
    server.use(
      http.post('/api/requests/me/applications', () =>
        HttpResponse.json(
          { code: 'validation_failed', message: 'Проверьте поля формы', details: { fields: { commissariat: 'Укажите военкомат полностью' } } },
          { status: 400 },
        ),
      ),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: '/requests/new/military-certificate', login: 'student.mo' });
    await user.type(await screen.findByLabelText('Военный комиссариат'), 'ОВК');
    await user.click(screen.getByRole('combobox', { name: 'Как получить' }));
    await user.click(await screen.findByRole('option', { name: 'Электронная копия' }));
    await user.click(screen.getByRole('button', { name: 'Подать заявку' }));

    const commissariat = screen.getByLabelText('Военный комиссариат');
    await waitFor(() => expect(commissariat).toHaveAccessibleDescription('Укажите военкомат полностью'));
    expect(commissariat).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('Проверьте поля формы');
  });

  it('справка с места учёбы — экран «Справка готова» с PDF и кодом проверки', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: '/requests/new/study-certificate', login: 'student.mo' });
    await user.click(await screen.findByRole('combobox', { name: 'Для чего нужна справка' }));
    await user.click(await screen.findByRole('option', { name: 'Для работодателя' }));
    await user.click(screen.getByRole('button', { name: 'Подать заявку' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Справка готова' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Скачать PDF' })).toBeInTheDocument();
    const code = screen.getByText(/^[A-Z2-7]{10}$/).textContent;
    expect(screen.getByRole('link', { name: /Страница проверки/ })).toHaveAttribute('href', `/verify/${code}`);
  });

  it('предзаполнение из адреса (?purpose=…) — для ИИ-помощника', async () => {
    renderWithProviders(<AppRoutes />, {
      route: `/requests/new/study-certificate?purpose=${encodeURIComponent('Для налоговой')}&destination=${encodeURIComponent('ИФНС № 5')}`,
      login: 'student.mo',
    });
    expect(await screen.findByRole('combobox', { name: 'Для чего нужна справка' })).toHaveTextContent('Для налоговой');
    expect(screen.getByLabelText(/Куда нужна справка/)).toHaveValue('ИФНС № 5');
  });

  it('чужой вариант select из адреса игнорируется', async () => {
    renderWithProviders(<AppRoutes />, { route: '/requests/new/study-certificate?purpose=hack', login: 'student.mo' });
    expect(await screen.findByRole('combobox', { name: 'Для чего нужна справка' })).toHaveTextContent('Выберите вариант');
  });

  it('файл больше 5 МБ отклоняется до отправки', async () => {
    let uploaded = false;
    server.use(
      http.post('/api/requests/me/applications/:id/attachments', () => {
        uploaded = true;
        return HttpResponse.json({}, { status: 500 });
      }),
    );
    const { user } = renderWithProviders(<AppRoutes />, { route: '/requests/new/financial-aid', login: 'student.mo' });
    const input = await screen.findByLabelText(/Перетащите файлы/);
    await user.upload(input, new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'scan.pdf', { type: 'application/pdf' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Файл «scan.pdf» больше 5 МБ');
    expect(screen.queryByRole('list', { name: 'Выбранные файлы' })).not.toBeInTheDocument();

    await user.type(screen.getByLabelText('Опишите ситуацию'), 'Нужна помощь');
    await user.click(screen.getByRole('button', { name: 'Подать заявку' }));
    expect(screen.getByText('Приложите хотя бы один файл')).toBeInTheDocument();
    expect(uploaded).toBe(false);

    await user.upload(input, new File(['%PDF-1.4'], 'spravka.pdf', { type: 'application/pdf' }));
    expect(within(screen.getByRole('list', { name: 'Выбранные файлы' })).getByText('spravka.pdf')).toBeInTheDocument();
  });
});

describe('Заявка', () => {
  it('сообщение в needs_info переводит статус в «В работе» после обновления', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: `/requests/${id(2)}`, login: 'student.meo' });
    expect(await screen.findByText('Деканат просит уточнить: Приложите справку о составе семьи')).toBeInTheDocument();
    expect(screen.getByText(statusIs('Нужны уточнения'))).toBeInTheDocument();

    await user.type(screen.getByLabelText('Сообщение для деканата'), 'Справку приложу завтра');
    await user.click(screen.getByRole('button', { name: 'Отправить' }));

    expect(await screen.findByText(statusIs('В работе'))).toBeInTheDocument();
    expect(screen.getByText('Справку приложу завтра')).toBeInTheDocument();
    expect(screen.queryByText(/Деканат просит уточнить/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Сообщение для деканата')).toHaveValue('');
  });

  it('«Отозвать заявку» — через диалог', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: `/requests/${id(5)}`, login: 'student.meo' });
    await user.click(await screen.findByRole('button', { name: 'Отозвать заявку' }));
    const dialog = screen.getByRole('dialog', { name: 'Отозвать заявку № 000005?' });
    await user.click(within(dialog).getByRole('button', { name: 'Отозвать' }));

    expect(await screen.findByText(statusIs('Отозвана'))).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Отозвать заявку' })).not.toBeInTheDocument();
  });

  it('готовая справка: код и ссылка проверки', async () => {
    renderWithProviders(<AppRoutes />, { route: `/requests/${id(4)}`, login: 'student.mo' });
    expect(await screen.findByRole('heading', { name: 'Справка готова' })).toBeInTheDocument();
    expect(screen.getByText('K7M2QX4PWA')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Страница проверки/ })).toHaveAttribute('href', '/verify/K7M2QX4PWA');
  });

  it('отказ — «Подать заново» открывает форму той же услуги с полями отклонённой заявки', async () => {
    const { user } = renderWithProviders(<AppRoutes />, { route: `/requests/${id(7)}`, login: 'student.mo' });
    expect(await screen.findByText('Заявка отклонена')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Подать заново' }));

    expect(await screen.findByRole('heading', { level: 1, name: 'Повторная выдача студенческого билета' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /Причина/ })).toHaveTextContent('Смена фамилии');
  });

  it('«Подать заново» переносит и комментарий', async () => {
    const path = resubmitPath({
      service_type: { id: 'academic-leave', title: 'Академический отпуск', kind: 'document' },
      fields: [{ key: 'start_date', label: 'С какой даты', value: '2027-02-01' }],
      comment: 'Справку приложу',
    });
    renderWithProviders(<AppRoutes />, { route: path, login: 'student.mo' });
    expect(await screen.findByLabelText('С какой даты')).toHaveValue('2027-02-01');
    expect(screen.getByLabelText(/Комментарий для деканата/)).toHaveValue('Справку приложу');
  });

  it('готовый документ — ссылка на кабинет и часы деканата', async () => {
    renderWithProviders(<AppRoutes />, { route: `/requests/${id(6)}`, login: 'student.mo' });
    expect(await screen.findByRole('link', { name: 'кабинет и часы приёма' })).toHaveAttribute('href', '/useful#dean');
  });

  it('чужая заявка — «Заявка не найдена»', async () => {
    renderWithProviders(<AppRoutes />, { route: `/requests/${id(2)}`, login: 'student.mo' });
    expect(await screen.findByText('Заявка не найдена')).toBeInTheDocument();
  });
});

describe('Оценка ответа деканата', () => {
  it('студент отмечает «не помог» с комментарием — сотрудник видит оценку и счётчик', async () => {
    const student = renderWithProviders(<AppRoutes />, { route: `/requests/${id(1)}`, login: 'student.mo' });
    const card = await screen.findByRole('region', { name: 'Ответ помог?' });
    await student.user.click(within(card).getByRole('button', { name: 'Нет' }));
    await student.user.type(within(card).getByLabelText(/Что можно улучшить/), 'Хотелось бы ответ быстрее');
    await student.user.click(within(card).getByRole('button', { name: 'Отправить оценку' }));
    expect(await screen.findByText('Ответ помог? Ваш ответ: «Нет».')).toBeInTheDocument();
    student.unmount();

    const staff = renderWithProviders(<AppRoutes />, { route: `/staff/requests/${id(1)}`, login: 'dekanat.mo' });
    expect(await screen.findByText('Оценка студента')).toBeInTheDocument();
    expect(screen.getByText('«Хотелось бы ответ быстрее»')).toBeInTheDocument();
    staff.unmount();

    renderWithProviders(<AppRoutes />, { route: '/staff', login: 'dekanat.mo' });
    expect(await screen.findByText('Оценки студентов: помогло 0 из 1 ответа (0 %)')).toBeInTheDocument();
  });

  it('у мгновенной справки оценки нет — её выдаёт система', async () => {
    renderWithProviders(<AppRoutes />, { route: `/requests/${id(4)}`, login: 'student.mo' });
    await screen.findByText(statusIs('Готово'));
    expect(screen.queryByText(/Ответ помог?|выполнили так, как вам было нужно/)).not.toBeInTheDocument();
  });
});
