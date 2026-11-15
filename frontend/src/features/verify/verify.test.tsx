import { screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';
import type { components } from '@/api/requests';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, server } from '@/test/render';
import { codeHint } from './code';

const code = 'K7M2QX4PWA';
const verification: components['schemas']['CertificateVerification'] = {
    valid: true, holder: 'Лебедева А. В.', faculty_short: 'ФМО', title: 'Справка с места учёбы',
    issued_at: '2026-11-18T09:00:00+03:00', valid_until: '2026-12-18',
};

function renderResult()
{
    return renderWithProviders(<AppRoutes />, { route: `/verify/${code}` });
}

describe('T15: обязательные сценарии Z1–Z6', () =>
{
    it('Z1: действительная справка и владелец без входа', async () =>
    {
        server.use(http.get('/api/requests/public/certificates/:code', () => HttpResponse.json(verification)));
        renderResult();

        expect(await screen.findByRole('heading', { name: 'Справка действительна' })).toBeInTheDocument();
        expect(screen.getByText('Лебедева А. В.')).toBeInTheDocument();
        expect(screen.getByText('ФМО')).toBeInTheDocument();
        expect(screen.getByText('18 декабря 2026 г.')).toBeInTheDocument();
        expect(screen.queryByRole('navigation', { name: 'Разделы' })).not.toBeInTheDocument();
        expect(screen.queryByRole('button', { name: /Меню пользователя/ })).not.toBeInTheDocument();
        expect(screen.getByText('Это учебный прототип. Справка — не официальный документ.')).toBeInTheDocument();
    });

    it('Z2: истёкшая справка сохраняет данные владельца', async () =>
    {
        server.use(http.get('/api/requests/public/certificates/:code', () => HttpResponse.json({ ...verification, valid: false })));
        renderResult();

        expect(await screen.findByRole('heading', { name: 'Срок действия справки истёк' })).toBeInTheDocument();
        expect(screen.getByText('Лебедева А. В.')).toBeInTheDocument();
        expect(screen.getByText('Справка с места учёбы')).toBeInTheDocument();
    });

    it('Z3: 404 предлагает проверить другой код', async () =>
    {
        server.use(http.get('/api/requests/public/certificates/:code', () => HttpResponse.json({ code: 'not_found', message: 'Нет справки' }, { status: 404 })));
        renderResult();

        expect(await screen.findByText('Справка с таким кодом не найдена')).toBeInTheDocument();
        expect(screen.getByText('Проверьте код')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Проверить другой код' })).toHaveAttribute('href', '/verify');
    });

    // Пользователь согласовал исправление Z4: цифра 9 в исходном ТЗ противоречит Б6 (A–Z2–7).
    it('Z4: k7m2 qx4p7a нормализуется в K7M2QX4P7A, кнопка активна', async () =>
    {
        const { user } = renderWithProviders(<AppRoutes />, { route: '/verify' });
        await user.type(screen.getByLabelText('Код справки'), 'k7m2 qx4p7a');

        expect(screen.getByLabelText('Код справки')).toHaveValue('K7M2QX4P7A');
        expect(screen.getByRole('button', { name: 'Проверить' })).toBeEnabled();
        await user.click(screen.getByRole('button', { name: 'Проверить' }));
        expect(window.location.pathname).toBe('/verify/K7M2QX4P7A');
    });

    it('Z5: цифра 1 не допускается', async () =>
    {
        const { user } = renderWithProviders(<AppRoutes />, { route: '/verify' });
        await user.type(screen.getByLabelText('Код справки'), 'K7M2QX4P91');

        expect(screen.getByText(codeHint)).toBeInTheDocument();
        expect(screen.getByLabelText('Код справки')).toHaveAttribute('aria-invalid', 'true');
        expect(screen.getByRole('button', { name: 'Проверить' })).toBeDisabled();
    });

    it('Z6: 429 использует Retry-After: 30', async () =>
    {
        const requests = vi.fn();

        server.use(http.get('/api/requests/public/certificates/:code', () =>
        {
            requests();

            return HttpResponse.json({ code: 'rate_limited', message: 'Слишком много проверок' }, { status: 429, headers: { 'Retry-After': '30' } });
        }));
        renderResult();

        expect(await screen.findByRole('alert')).toHaveTextContent('Попробуйте через 30 секунд');
        expect(screen.getByRole('heading', { name: 'Слишком много проверок' })).toBeInTheDocument();
        expect(requests).toHaveBeenCalledOnce();
    });
});

describe('T15: дополнительные сценарии', () =>
{
    it.each(['K7M2QX4P9A', 'K7M2QX4P0A', 'К7M2QX4P7A', 'SHORT', 'K7M2QX4P7AA'])('не допускает %s', async (value) =>
    {
        const { user } = renderWithProviders(<AppRoutes />, { route: '/verify' });
        await user.type(screen.getByLabelText('Код справки'), value);

        expect(screen.getByRole('button', { name: 'Проверить' })).toBeDisabled();
    });

    it('прямая ссылка с неверным кодом не делает запрос', async () =>
    {
        const requested = vi.fn();

        server.use(http.get('/api/requests/public/certificates/:code', () =>
        {
            requested();

            return HttpResponse.json(verification);
        }));
        renderWithProviders(<AppRoutes />, { route: '/verify/INVALID1' });

        expect(screen.getByText('Неверный формат кода')).toBeInTheDocument();
        expect(requested).not.toHaveBeenCalled();
    });

    it('ошибка сети показывает повтор, затем данные восстанавливаются', async () =>
    {
        let failed = true;

        server.use(http.get('/api/requests/public/certificates/:code', () => failed ? HttpResponse.error() : HttpResponse.json(verification)));
        const { user } = renderResult();

        expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить данные');
        failed = false;
        await user.click(screen.getByRole('button', { name: 'Повторить' }));
        expect(await screen.findByRole('heading', { name: 'Справка действительна' })).toBeInTheDocument();
    });

    it('публичный мок раскрывает только поля контракта', async () =>
    {
        const { client } = renderResult();
        await screen.findByRole('heading', { name: 'Справка действительна' });
        const result = client.getQueryData<components['schemas']['CertificateVerification']>(['requests', 'public', 'certificate', code]);

        expect(Object.keys(result!).sort()).toEqual(['faculty_short', 'holder', 'issued_at', 'title', 'valid', 'valid_until']);
        expect(result?.holder).toBe('Лебедева А. В.');
        expect(result).not.toHaveProperty('student_card_no');
    });

    it('без Retry-After показывает понятное ожидание', async () =>
    {
        server.use(http.get('/api/requests/public/certificates/:code', () => HttpResponse.json({ code: 'rate_limited' }, { status: 429 })));
        renderResult();

        expect(await screen.findByRole('alert')).toHaveTextContent('Попробуйте позже');
    });

    it('ссылка «Проверить другой код» возвращает форму', async () =>
    {
        const { user } = renderResult();
        await user.click(await screen.findByRole('link', { name: 'Проверить другой код' }));

        await waitFor(() => expect(screen.getByLabelText('Код справки')).toHaveValue(''));
        expect(window.location.pathname).toBe('/verify');
    });
});
