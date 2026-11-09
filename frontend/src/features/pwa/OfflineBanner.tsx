import { useEffect, useSyncExternalStore } from 'react';
import { onLogout } from '@/app/session';
import { toast } from '@/shared/ui/toast';
import { listenForInstallation } from './installation';
import { clearAppStorage } from './storage';
import './offline-banner.css';

function subscribe(listener: () => void)
{
    window.addEventListener('online', listener);
    window.addEventListener('offline', listener);

    return () =>
    {
        window.removeEventListener('online', listener);
        window.removeEventListener('offline', listener);
    };
}

export function OfflineBanner()
{
    const online = useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

    // Компонент подключён над маршрутизатором: здесь же живут подписки PWA и выхода.
    useEffect(() => listenForInstallation(), []);
    useEffect(() => onLogout(() =>
    {
        void clearAppStorage().catch(() => toast.error('Не удалось очистить локальные данные приложения. Очистите данные сайта в настройках браузера.'));
    }), []);

    return (
        <div role="status" hidden={online} className="pwa-offline-banner fixed inset-x-0 z-40 border-y bg-warning-soft px-gutter py-3 text-sm font-medium text-warning-strong">
            {online ? '' : 'Нет соединения. Данные могут быть неактуальны'}
        </div>
    );
}
