import { useSyncExternalStore } from 'react';

export interface InstallPromptEvent extends Event
{
    prompt: () => Promise<void>;
    userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

let pending: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();

export function clearInstallPrompt()
{
    pending = null;
    listeners.forEach((listener) => listener());
}

export function listenForInstallation()
{
    const capture = (event: Event) =>
    {
        event.preventDefault();
        pending = event as InstallPromptEvent;
        listeners.forEach((listener) => listener());
    };

    window.addEventListener('beforeinstallprompt', capture);
    window.addEventListener('appinstalled', clearInstallPrompt);

    return () =>
    {
        window.removeEventListener('beforeinstallprompt', capture);
        window.removeEventListener('appinstalled', clearInstallPrompt);
    };
}

function subscribe(listener: () => void)
{
    listeners.add(listener);

    return () => { listeners.delete(listener); };
}

export function useInstallPrompt()
{
    return useSyncExternalStore(subscribe, () => pending, () => null);
}

export function isInstalled()
{
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
}

export function isIosSafari()
{
    const agent = navigator.userAgent;
    const ios = /iPad|iPhone|iPod/.test(agent) || (/Macintosh/.test(agent) && navigator.maxTouchPoints > 1);

    return ios && /Safari/.test(agent) && !/CriOS|FxiOS|EdgiOS|OPiOS/.test(agent);
}
