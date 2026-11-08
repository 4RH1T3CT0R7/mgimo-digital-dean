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
    includeAssets: ['favicon.svg', 'theme.js', 'icons/*.png'],
    manifest: {
        id: '/',
        name: 'Цифровой деканат — концепт',
        short_name: 'Деканат',
        description: 'Демонстрационный личный кабинет студента',
        lang: 'ru',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        background_color: color('background'),
        theme_color: color('primary'),
        icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
    },
    workbox: {
        cacheId: 'mgimo-static',
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
