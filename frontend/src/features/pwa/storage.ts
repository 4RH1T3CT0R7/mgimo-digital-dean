export async function clearAppStorage()
{
    // Личные данные остаются в памяти TanStack Query; их удаляет каркас onLogout.
    // В localStorage приложение сохраняет только тему, её при выходе не сбрасываем.
    if ('caches' in globalThis)
    {
        await Promise.all((await caches.keys()).map((name) => caches.delete(name)));
    }
}
