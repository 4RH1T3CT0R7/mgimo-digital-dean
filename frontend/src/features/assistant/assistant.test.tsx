import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, server } from '@/test/render';

const open = () => renderWithProviders(<AppRoutes />, { route: '/assistant', login: 'student.mo' });
const field = () => screen.getByLabelText('Ваш вопрос');

describe('ИИ-помощник (T26)', () => {
  it('Q1: ответ provider = llm — пометка «Ответ сгенерирован ИИ…»', async () => {
    const { user } = open();
    await user.type(await screen.findByLabelText('Ваш вопрос'), 'Как получить справку для военкомата?{Enter}');
    expect(await screen.findByText(/Ответ сгенерирован ИИ и может содержать ошибки/)).toBeInTheDocument();
    expect(screen.getByText('Что указать в заявке на справку в военкомат?')).toBeInTheDocument();
  });

  it('Q2: suggested_action — кнопка ведёт на форму с предзаполнением', async () => {
    server.use(
      http.post('/api/assistant/ask', () =>
        HttpResponse.json({
          answer: 'Подайте заявку на справку в военкомат.',
          provider: 'faq',
          sources: [],
          suggested_action: { service_type_id: 'military-certificate', prefill: { delivery: 'Электронная копия' } },
        }),
      ),
    );
    const { user } = open();
    await user.click(await screen.findByRole('button', { name: 'Как получить справку для военкомата?' }));
    const link = await screen.findByRole('link', { name: 'Заполнить заявление: Справка в военкомат' });
    expect(decodeURI(link.getAttribute('href')!)).toBe('/requests/new/military-certificate?delivery=Электронная+копия');

    await user.click(link);
    expect(await screen.findByRole('combobox', { name: 'Как получить' })).toHaveTextContent('Электронная копия');
  });

  it('Q3: вопрос из 2 символов — «Спросить» неактивна', async () => {
    const { user } = open();
    await user.type(await screen.findByLabelText('Ваш вопрос'), 'аб');
    expect(screen.getByRole('button', { name: 'Спросить' })).toBeDisabled();
    await user.type(field(), 'в');
    expect(screen.getByRole('button', { name: 'Спросить' })).toBeEnabled();
  });

  it('Q4: 429 с Retry-After: 600 — «попробуйте через 10 минут»', async () => {
    server.use(
      http.post('/api/assistant/ask', () =>
        HttpResponse.json({ code: 'too_many_attempts', message: 'Слишком много вопросов' }, { status: 429, headers: { 'Retry-After': '600' } }),
      ),
    );
    const { user } = open();
    await user.type(await screen.findByLabelText('Ваш вопрос'), 'Как оформить академический отпуск?{Enter}');
    expect(await screen.findByRole('alert')).toHaveTextContent('Вы задали много вопросов, попробуйте через 10 минут');
  });

  it('Q5: после перезагрузки страницы история пуста', async () => {
    const { user, unmount } = open();
    await user.type(await screen.findByLabelText('Ваш вопрос'), 'Что делать, если потерял студенческий?{Enter}');
    expect(await screen.findByText('Ответ из справочника')).toBeInTheDocument();
    unmount();

    open();
    expect(await screen.findByLabelText('Ваш вопрос')).toHaveValue('');
    expect(screen.queryByText(/потерял студенческий/, { selector: 'h2, summary' })).not.toBeInTheDocument();
    expect(screen.queryByText('Ответ из справочника')).not.toBeInTheDocument();
  });

  it('история не пишется ни в localStorage, ни в sessionStorage', async () => {
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    const { user } = open();
    await user.type(await screen.findByLabelText('Ваш вопрос'), 'Где посмотреть расписание на неделю?{Enter}');
    expect(await screen.findByText(/переключите неделю стрелками/)).toBeInTheDocument();

    const stored = [localStorage, sessionStorage].flatMap((s) => Array.from({ length: s.length }, (_, i) => s.getItem(s.key(i)!))).join('\n');
    const written = setItem.mock.calls.flat().join('\n');
    for (const text of ['расписание на неделю', 'стрелками']) {
      expect(stored).not.toContain(text);
      expect(written).not.toContain(text);
    }
    setItem.mockRestore();
  });
});
