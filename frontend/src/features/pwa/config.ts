import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { VitePWAOptions } from 'vite-plugin-pwa';

const themePath = resolve(dirname(fileURLToPath(import.meta.url)), '../../index.css');
const theme = readFileSync(themePath, 'utf8').match(/:root\s*\{([\s\S]*?)\}/)?.[1] ?? '';

function color(name: string): string
{
    const value = theme.match(new RegExp(`--${name}:\\s*([^;]+);`))?.[1].trim();

    if (!value)
    {
        throw new Error(`Не найден цвет темы: ${name}`);
    }

    return value;
}

export const pwaOptions: Partial<VitePWAOptions> = {
    registerType: 'autoUpdate',
    injectRegister: 'script-defer',
    manifest: {
        id: '/',
        name: 'Мой вуз — концепт',
        short_name: 'Мой вуз',
        description: 'Демонстрационный личный кабинет студента',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: color('background'),
        theme_color: color('background'),
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
        screenshots: [
            {
                src: '/icons/install-schedule-wide.jpg',
                sizes: '1265x791',
                type: 'image/jpeg',
                form_factor: 'wide',
                label: 'Расписание на компьютере',
            },
            {
                src: '/icons/install-schedule-narrow.jpg',
                sizes: '345x767',
                type: 'image/jpeg',
                form_factor: 'narrow',
                label: 'Расписание на телефоне',
            },
        ],
    },
    workbox: {
        cacheId: 'mgimo-static',
        globPatterns: ['**/*.{js,css,html,svg,png,jpg,ico,woff2}'],
        globIgnores: ['**/api/**', '**/mockServiceWorker.js'],
        navigateFallback: 'index.html',
        navigateFallbackDenylist: [/^\/api(?:[/?]|$)/],
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
    },
    // В dev:mock корневым service worker управляет MSW; PWA проверяется production-сборкой.
    devOptions: { enabled: false },
};
