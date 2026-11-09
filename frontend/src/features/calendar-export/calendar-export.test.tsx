import { screen, waitFor, act, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endSession, onLogout } from '@/app/session';
import { resetAcademicState } from '@/mocks/fixtures/academic';
import { toApiDate } from '@/shared/lib/format';
import { toast } from '@/shared/ui/toast';
import { renderWithProviders } from '@/test/render';
import { ExportCalendarButton } from './ExportCalendarButton';

const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const createObjectURL = vi.fn<(blob: Blob) => string>(() => 'blob:calendar');
const revokeObjectURL = vi.fn();
const calendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

function blobText(blob: Blob): Promise<string>
{
    if (typeof blob.text === 'function')
    {
        return blob.text();
    }

    // Blob из jsdom читается FileReader, Blob из Node fetch — методом text.
    return new Promise((resolve, reject) =>
    {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsText(blob);
    });
}

beforeEach(() =>
{
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
});

afterEach(() =>
{
    resetAcademicState();
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();

    if (createDescriptor)
    {
        Object.defineProperty(URL, 'createObjectURL', createDescriptor);
    }
    else
    {
        Reflect.deleteProperty(URL, 'createObjectURL');
    }
    if (revokeDescriptor)
    {
        Object.defineProperty(URL, 'revokeObjectURL', revokeDescriptor);
    }
    else
    {
        Reflect.deleteProperty(URL, 'revokeObjectURL');
    }
});

describe('T16: выгрузка календаря', () =>
{
    it('dev:mock: кнопка скачивает настоящий ICS через общий обработчик MSW', async () =>
    {
        resetAcademicState();
        vi.useFakeTimers({ toFake: ['Date'] });
        vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
        const fetch = vi.spyOn(globalThis, 'fetch');
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        const { user } = renderWithProviders(<ExportCalendarButton />, { login: 'student.mo' });
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));

        await waitFor(() => expect(click).toHaveBeenCalledOnce());
        expect(fetch).toHaveBeenCalledWith('/api/academic/me/schedule.ics?from=2026-11-18', expect.objectContaining({ credentials: 'include' }));
        expect(createObjectURL).toHaveBeenCalledOnce();
        const downloaded = createObjectURL.mock.calls[0][0];
        expect(downloaded.type).toContain('text/calendar');
        expect(await blobText(downloaded)).toContain('BEGIN:VEVENT\r\n');
        expect(click.mock.instances[0]).toHaveAttribute('download', 'mgimo-schedule.ics');
    });

    it('P2: скачивает с credentials: include, создаёт mgimo-schedule.ics', async () =>
    {
        const fetch = vi.fn().mockResolvedValue(new Response(calendar, { headers: { 'Content-Type': 'text/calendar; charset=utf-8' } }));
        const clicks: { file: string; url: string }[] = [];
        vi.stubGlobal('fetch', fetch);
        vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement)
        {
            clicks.push({ file: this.download, url: this.href });
        });
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));

        await waitFor(() => expect(clicks).toEqual([{ file: 'mgimo-schedule.ics', url: 'blob:calendar' }]));
        expect(fetch).toHaveBeenCalledWith(`/api/academic/me/schedule.ics?from=${toApiDate()}`, expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
        expect(createObjectURL).toHaveBeenCalledOnce();
        const downloaded = createObjectURL.mock.calls[0][0];
        expect(downloaded.type.split(';')[0]).toBe('text/calendar');
        expect(await blobText(downloaded)).toBe(calendar);
        expect(screen.getByRole('button', { name: 'Скачать для календаря' })).toBeEnabled();
    });

    it('P3: 500 показывает тост ошибки', async () =>
    {
        const error = vi.spyOn(toast, 'error');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'internal' }), { status: 500 })));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));

        await waitFor(() => expect(error).toHaveBeenCalledWith('Сервис временно недоступен. Попробуйте чуть позже.'));
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('URL остаётся доступен 40 секунд, включая уход со страницы', async () =>
    {
        vi.useFakeTimers();
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(calendar, { headers: { 'Content-Type': 'text/calendar' } })));
        const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
        const { unmount } = renderWithProviders(<ExportCalendarButton />);
        await act(async () =>
        {
            fireEvent.click(screen.getByRole('button', { name: 'Скачать для календаря' }));
        });

        expect(click).toHaveBeenCalledOnce();
        unmount();
        vi.advanceTimersByTime(39_999);
        expect(revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1);
        expect(revokeObjectURL).toHaveBeenCalledExactlyOnceWith('blob:calendar');
    });

    it.each([
        { body: '', type: 'text/calendar' },
        { body: '<html>Страница ошибки</html>', type: 'text/html' },
    ])('неверный файл: $type не скачивается, показана точная причина', async ({ body, type }) =>
    {
        const error = vi.spyOn(toast, 'error');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(body, { headers: { 'Content-Type': type } })));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));

        await waitFor(() => expect(error).toHaveBeenCalledWith('Неверный формат файла календаря. Попробуйте скачать ещё раз.'));
        expect(createObjectURL).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Скачать для календаря' })).toBeEnabled();
    });

    it('выход прерывает запрос и не создаёт файл после выхода', async () =>
    {
        let resolve: (response: Response) => void = () => undefined;
        const fetch = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
        vi.stubGlobal('fetch', fetch);
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));
        expect(screen.getByRole('button', { name: 'Скачиваем…' })).toBeDisabled();
        act(() => endSession());
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        resolve(new Response(calendar, { headers: { 'Content-Type': 'text/calendar' } }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'Скачать для календаря' })).toBeEnabled());
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('401 завершает сессию', async () =>
    {
        const listener = vi.fn();
        const off = onLogout(listener);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'unauthenticated' }), { status: 401 })));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));

        await waitFor(() => expect(listener).toHaveBeenCalledOnce());
        expect(createObjectURL).not.toHaveBeenCalled();
        off();
    });

    it('ошибка сети не создаёт пустой файл', async () =>
    {
        const error = vi.spyOn(toast, 'error');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'Скачать для календаря' }));

        await waitFor(() => expect(error).toHaveBeenCalledWith('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'));
        expect(createObjectURL).not.toHaveBeenCalled();
    });
});
