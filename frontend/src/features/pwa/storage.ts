import { setTheme } from '@/app/theme';

async function clearBrowserCaches()
{
    if ('caches' in globalThis)
    {
        await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
    }
}

export async function clearAppStorage()
{
    try
    {
        await clearBrowserCaches();
    }
    finally
    {
        for (const key of Object.keys(localStorage))
        {
            if (key === 'theme' || key.startsWith('mgimo:'))
            {
                localStorage.removeItem(key);
            }
        }
        setTheme('system');
    }
}
