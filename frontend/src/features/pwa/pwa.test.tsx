import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { act, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { endSession } from '@/app/session';
import { renderWithProviders } from '@/test/render';
import { pwaOptions } from './config';
import { InstallAppButton } from './InstallAppButton';
import { clearInstallPrompt, type InstallPromptEvent } from './installation';
import { clearAppStorage } from './storage';

afterEach(() =>
{
    clearInstallPrompt();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

describe('T16: PWA', () =>
{
    it('P1: настоящий конфиг подключает PWA и не кэширует API', () =>
    {
        const config = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), '../../../vite.config.ts'), 'utf8');

        expect(config).toContain('VitePWA(pwaOptions)');
        expect(pwaOptions.workbox?.runtimeCaching).toEqual([]);
        expect(pwaOptions.workbox?.globIgnores).toContain('**/api/**');
        expect(pwaOptions.workbox?.skipWaiting).toBe(true);
        expect(pwaOptions.workbox?.clientsClaim).toBe(true);

        for (const path of ['/api', '/api?x=1', '/api/academic/me/schedule', '/api/auth/me', '/api/requests/public/certificates/CODE'])
        {
            expect(pwaOptions.workbox?.navigateFallbackDenylist?.some((pattern) => pattern.test(path))).toBe(true);
        }
        expect(pwaOptions.workbox?.navigateFallbackDenylist?.some((pattern) => pattern.test('/schedule'))).toBe(false);
    });

    it('P4: offline показывает плашку, online скрывает её', () =>
    {
        let online = true;
        vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
        renderWithProviders(<p>Страница</p>);

        expect(screen.queryByText('Нет соединения. Данные могут быть неактуальны')).not.toBeInTheDocument();
        online = false;
        fireEvent(window, new Event('offline'));
        expect(screen.getByRole('status')).toHaveTextContent('Нет соединения. Данные могут быть неактуальны');
        online = true;
        fireEvent(window, new Event('online'));
        expect(screen.queryByText('Нет соединения. Данные могут быть неактуальны')).not.toBeInTheDocument();
    });

    it('событие установки перехватывается глобально и вызывается только по кнопке', async () =>
    {
        const prompt = vi.fn().mockResolvedValue(undefined);
        const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
            prompt, userChoice: Promise.resolve({ outcome: 'dismissed', platform: 'web' }),
        }) as InstallPromptEvent;
        const { user } = renderWithProviders(<InstallAppButton />);

        expect(screen.queryByRole('button', { name: 'Установить приложение' })).not.toBeInTheDocument();
        act(() => { window.dispatchEvent(event); });
        expect(event.defaultPrevented).toBe(true);
        expect(prompt).not.toHaveBeenCalled();
        await user.click(screen.getByRole('button', { name: 'Установить приложение' }));
        expect(prompt).toHaveBeenCalledOnce();
        await waitFor(() => expect(screen.queryByRole('button', { name: 'Установить приложение' })).not.toBeInTheDocument());
    });

    it('в Safari на iPhone показывает ручную установку', () =>
    {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1');
        renderWithProviders(<InstallAppButton />);

        expect(screen.getByText(/«Поделиться», затем «На экран „Домой“»/)).toBeInTheDocument();
    });

    it('в Chrome на iPhone не даёт инструкцию Safari', () =>
    {
        vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue('Mozilla/5.0 (iPhone) AppleWebKit/605.1.15 CriOS/123.0 Mobile Safari/604.1');
        renderWithProviders(<InstallAppButton />);

        expect(screen.queryByText(/Чтобы установить приложение в Safari/)).not.toBeInTheDocument();
    });

    it('после установки не предлагает установить снова', () =>
    {
        const original = window.matchMedia;
        vi.spyOn(window, 'matchMedia').mockImplementation((query) => ({ ...original(query), matches: query === '(display-mode: standalone)' }));
        renderWithProviders(<InstallAppButton />);

        expect(screen.queryByRole('button', { name: 'Установить приложение' })).not.toBeInTheDocument();
    });

    it('выход удаляет все кэши и localStorage приложения', async () =>
    {
        const deleteCache = vi.fn().mockResolvedValue(true);
        vi.stubGlobal('caches', {
            keys: vi.fn().mockResolvedValue(['mgimo-static-precache-v2', 'old-personal-data']),
            delete: deleteCache,
        });
        localStorage.setItem('theme', 'dark');
        localStorage.setItem('mgimo:profile', 'тестовые данные');
        localStorage.setItem('unrelated-app', 'оставить');
        renderWithProviders(<p>Страница</p>);
        act(() => endSession());

        await waitFor(() => expect(localStorage.getItem('mgimo:profile')).toBeNull());
        expect(localStorage.getItem('theme')).toBeNull();
        expect(localStorage.getItem('unrelated-app')).toBe('оставить');
        expect(deleteCache).toHaveBeenCalledWith('old-personal-data');
        expect(deleteCache).toHaveBeenCalledWith('mgimo-static-precache-v2');
        expect(deleteCache).toHaveBeenCalledTimes(2);
    });

    it('без Cache Storage выход всё равно очищает приложение', async () =>
    {
        localStorage.setItem('mgimo:profile', 'данные');
        await clearAppStorage();

        expect(localStorage.getItem('mgimo:profile')).toBeNull();
    });

    it('ошибка Cache Storage не мешает удалить localStorage приложения', async () =>
    {
        vi.stubGlobal('caches', { keys: vi.fn().mockRejectedValue(new Error('Cache Storage недоступен')) });
        localStorage.setItem('mgimo:profile', 'данные');

        await expect(clearAppStorage()).rejects.toThrow('Cache Storage недоступен');
        expect(localStorage.getItem('mgimo:profile')).toBeNull();
    });
});
