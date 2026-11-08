import { screen, waitFor, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { endSession, onLogout } from '@/app/session';
import { toApiDate } from '@/shared/lib/format';
import { toast } from '@/shared/ui/toast';
import { renderWithProviders } from '@/test/render';
import { ExportCalendarButton } from './ExportCalendarButton';

const createDescriptor = Object.getOwnPropertyDescriptor(URL, 'createObjectURL');
const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, 'revokeObjectURL');
const createObjectURL = vi.fn(() => 'blob:calendar');
const revokeObjectURL = vi.fn();
const calendar = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nEND:VCALENDAR\r\n';

beforeEach(() =>
{
    createObjectURL.mockClear();
    revokeObjectURL.mockClear();
    Object.defineProperty(URL, 'createObjectURL', { value: createObjectURL, configurable: true });
    Object.defineProperty(URL, 'revokeObjectURL', { value: revokeObjectURL, configurable: true });
});

afterEach(() =>
{
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
        await user.click(screen.getByRole('button', { name: 'В календарь' }));

        await waitFor(() => expect(clicks).toEqual([{ file: 'mgimo-schedule.ics', url: 'blob:calendar' }]));
        expect(fetch).toHaveBeenCalledWith(`/api/academic/me/schedule.ics?from=${toApiDate()}`, expect.objectContaining({ credentials: 'include', cache: 'no-store' }));
        expect(createObjectURL).toHaveBeenCalledWith(expect.any(Blob));
        expect(screen.getByRole('button', { name: 'В календарь' })).toBeEnabled();
    });

    it('P3: 500 показывает тост ошибки', async () =>
    {
        const error = vi.spyOn(toast, 'error');
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'internal' }), { status: 500 })));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'В календарь' }));

        await waitFor(() => expect(error).toHaveBeenCalledWith('Сервис временно недоступен. Попробуйте чуть позже.'));
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('выход прерывает запрос и не создаёт файл после выхода', async () =>
    {
        let resolve: (response: Response) => void = () => undefined;
        const fetch = vi.fn().mockReturnValue(new Promise<Response>((done) => { resolve = done; }));
        vi.stubGlobal('fetch', fetch);
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'В календарь' }));
        expect(screen.getByRole('button', { name: 'Скачиваем…' })).toBeDisabled();
        act(() => endSession());
        expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
        resolve(new Response(calendar, { headers: { 'Content-Type': 'text/calendar' } }));

        await waitFor(() => expect(screen.getByRole('button', { name: 'В календарь' })).toBeEnabled());
        expect(createObjectURL).not.toHaveBeenCalled();
    });

    it('401 завершает сессию', async () =>
    {
        const listener = vi.fn();
        const off = onLogout(listener);
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'unauthenticated' }), { status: 401 })));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'В календарь' }));

        await waitFor(() => expect(listener).toHaveBeenCalledOnce());
        expect(createObjectURL).not.toHaveBeenCalled();
        off();
    });

    it('ошибка сети не создаёт пустой файл', async () =>
    {
        const error = vi.spyOn(toast, 'error');
        vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
        const { user } = renderWithProviders(<ExportCalendarButton />);
        await user.click(screen.getByRole('button', { name: 'В календарь' }));

        await waitFor(() => expect(error).toHaveBeenCalledWith('Нет связи с сервером. Проверьте интернет и попробуйте ещё раз.'));
        expect(createObjectURL).not.toHaveBeenCalled();
    });
});
