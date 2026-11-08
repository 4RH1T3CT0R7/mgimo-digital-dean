import { useEffect, useSyncExternalStore } from 'react';
import { onLogout } from '@/app/session';
import { toast } from '@/shared/ui/toast';
import { listenForInstallation } from './installation';
import { clearAppStorage } from './storage';

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

    useEffect(() => listenForInstallation(), []);
    useEffect(() => onLogout(() =>
    {
        void clearAppStorage().catch(() => toast.error('Не удалось очистить локальные данные приложения. Очистите данные сайта в настройках браузера.'));
    }), []);

    return online ? null : <div role="status" className="fixed inset-x-0 bottom-tabbar z-40 border-y bg-warning-soft px-gutter py-3 text-sm font-medium text-warning-strong lg:bottom-0">Нет соединения. Данные могут быть неактуальны</div>;
}
