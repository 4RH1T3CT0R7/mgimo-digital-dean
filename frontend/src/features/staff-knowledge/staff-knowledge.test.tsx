import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { beforeEach, describe, expect, it } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { resetKnowledgeState } from '@/mocks/handlers/knowledge';
import { renderWithProviders, server } from '@/test/render';

const path = '/staff/knowledge';
const renderPage = (login = 'dekanat.mo', route = path) => renderWithProviders(<AppRoutes />, { route, login });
const row = (title: string) => within(screen.getByRole('heading', { name: title }).closest('li')!);
const retakes = 'Порядок пересдач и ликвидации академической задолженности';

beforeEach(() => resetKnowledgeState());

describe('База знаний помощника', () => {
  it('пункт меню есть у сотрудника и администратора', async () => {
    const staff = renderPage('dekanat.mo', '/staff');
    expect((await screen.findAllByRole('link', { name: 'Помощник' }))[0]).toHaveAttribute('href', path);
    staff.unmount();
    renderPage('admin', '/staff');
    expect((await screen.findAllByRole('link', { name: 'Помощник' }))[0]).toHaveAttribute('href', path);
  });

  it('список: название, файл, объём, кто и когда добавил, включён ли', async () => {
    renderPage();
    expect(await screen.findByRole('heading', { name: 'База знаний помощника' })).toBeVisible();
    await screen.findByRole('heading', { name: retakes });
    expect(row(retakes).getByText('Порядок пересдач.docx')).toBeVisible();
    expect(row(retakes).getByText('1 998 символов')).toBeVisible();
    expect(row(retakes).getByText(/^Администрация,/)).toHaveTextContent('Администрация, 10 ноября');
    expect(row(retakes).queryByText('Выключен')).not.toBeInTheDocument();
    expect(row(retakes).getByRole('button', { name: `Выключить: ${retakes}` })).toBeVisible();
    expect(row('Справки и заявления в деканат: сроки и порядок').getByText('Текст вставлен вручную')).toBeVisible();
  });

  it('пусто и ошибка', async () => {
    const empty = renderPage('dekanat.mo', `${path}?scenario=empty`);
    expect(await screen.findByText('Документов пока нет')).toBeVisible();
    empty.unmount();
    renderPage('dekanat.mo', `${path}?scenario=error`);
    expect(await screen.findByText('Не удалось загрузить данные')).toBeVisible();
  });

  it('добавить документ текстом', async () => {
    const { user } = renderPage();
    await screen.findByRole('heading', { name: retakes });
    await user.click(screen.getByRole('button', { name: 'Добавить документ' }));
    const form = within(await screen.findByRole('dialog'));
    await user.type(form.getByLabelText('Название'), 'Общежитие: заселение');
    await user.click(form.getByRole('radio', { name: 'Вставить текст' }));
    await user.type(form.getByLabelText('Текст документа'), 'Места в общежитии распределяет жилищная комиссия.');
    await user.click(form.getByRole('button', { name: 'Добавить документ' }));
    expect(await screen.findByRole('heading', { name: 'Общежитие: заселение' })).toBeVisible();
    expect(row('Общежитие: заселение').getByText('Текст вставлен вручную')).toBeVisible();
    expect(row('Общежитие: заселение').getByText(/^Деканат,/)).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('файл: PDF не принимается, .txt уходит на сервер файлом', async () => {
    // В jsdom имя файла теряется по пути в undici-fetch, поэтому ответ сервера — свой
    let sent: FormData | undefined;
    server.use(http.post('/api/assistant/staff/knowledge', async ({ request }) => {
      sent = await request.formData();
      return HttpResponse.json({
        id: '90000000-0000-4000-8000-0000000000aa', title: 'Памятка первокурснику', source_name: 'Памятка.txt', chars: 37,
        chunks: 1, author_label: 'Деканат', created_at: '2026-11-16T10:00:00+03:00', active: true,
      }, { status: 201 });
    }));
    const { user } = renderPage();
    await screen.findByRole('heading', { name: retakes });
    await user.click(screen.getByRole('button', { name: 'Добавить документ' }));
    const form = within(await screen.findByRole('dialog'));
    await user.type(form.getByLabelText('Название'), 'Памятка первокурснику');
    const input = form.getByLabelText('Файл');
    fireEvent.change(input, { target: { files: [new File(['%PDF-1.7'], 'Памятка.pdf', { type: 'application/pdf' })] } });
    await user.click(form.getByRole('button', { name: 'Добавить документ' }));
    expect(await form.findByText('PDF не подойдёт: сохраните документ как .docx или .txt.')).toBeVisible();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    fireEvent.change(input, { target: { files: [new File(['Студенческий выдают в первую неделю.'], 'Памятка.txt', { type: 'text/plain' })] } });
    await user.click(form.getByRole('button', { name: 'Добавить документ' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(sent?.get('title')).toBe('Памятка первокурснику');
    expect(typeof sent?.get('file')).toBe('object');
    expect(sent?.get('text')).toBeNull();
  });

  it('ошибка сервера по полю видна под полем', async () => {
    server.use(http.post('/api/assistant/staff/knowledge', () =>
      HttpResponse.json({ code: 'validation_failed', message: 'Ошибка', details: { fields: { text: 'В документе нет текста' } } }, { status: 400 })));
    const { user } = renderPage();
    await screen.findByRole('heading', { name: retakes });
    await user.click(screen.getByRole('button', { name: 'Добавить документ' }));
    const form = within(await screen.findByRole('dialog'));
    await user.type(form.getByLabelText('Название'), 'Пустой документ');
    await user.click(form.getByRole('radio', { name: 'Вставить текст' }));
    await user.type(form.getByLabelText('Текст документа'), ' . ');
    await user.click(form.getByRole('button', { name: 'Добавить документ' }));
    expect(await form.findByText('В документе нет текста')).toBeVisible();
    expect(form.getByLabelText('Текст документа')).toHaveAccessibleDescription(/В документе нет текста/);
  });

  it('выключить и удалить с подтверждением', async () => {
    const { user } = renderPage();
    await screen.findByRole('heading', { name: retakes });
    await user.click(row(retakes).getByRole('button', { name: `Выключить: ${retakes}` }));
    expect(await row(retakes).findByText('Выключен')).toBeVisible();
    expect(row(retakes).getByRole('button', { name: `Включить: ${retakes}` })).toBeVisible();

    await user.click(row(retakes).getByRole('button', { name: `Удалить: ${retakes}` }));
    const dialog = within(await screen.findByRole('dialog'));
    expect(dialog.getByText(/Помощник перестанет отвечать по документу/)).toBeVisible();
    await user.click(dialog.getByRole('button', { name: 'Удалить документ' }));
    await waitFor(() => expect(screen.queryByRole('heading', { name: retakes })).not.toBeInTheDocument());
  });

  it('проверка ответа: ИИ по документам и «ничего не нашлось»', async () => {
    const { user } = renderPage('admin');
    const question = await screen.findByLabelText('Вопрос, как его задал бы студент');
    await user.click(screen.getByRole('button', { name: 'Спросить' }));
    expect(await screen.findByText('Введите вопрос, хотя бы 3 символа.')).toBeVisible();
    expect(question).toHaveAccessibleDescription('Введите вопрос, хотя бы 3 символа.');
    await user.type(question, 'Когда приходит стипендия?');
    await user.click(screen.getByRole('button', { name: 'Спросить' }));
    expect(await screen.findByText('Ответ ИИ по источникам ниже — сверьте его с документами.')).toBeVisible();
    expect(screen.getByText('Документ базы знаний')).toBeVisible();
    expect(screen.getAllByText('Стипендии и материальная поддержка: памятка').length).toBeGreaterThan(1);

    await user.clear(question);
    await user.type(question, 'Какая погода завтра?');
    await user.click(screen.getByRole('button', { name: 'Спросить' }));
    expect(await screen.findByText(/^Ничего не нашлось — студенту предложат «Вопрос в деканат»/)).toBeVisible();
  });
});
