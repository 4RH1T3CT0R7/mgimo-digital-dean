import { DownloadIcon } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { endSession, onLogout } from '@/app/session';
import { ApiError, apiErrorMessage } from '@/shared/lib/errors';
import { toApiDate } from '@/shared/lib/format';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';

export function ExportCalendarButton()
{
    const [busy, setBusy] = useState(false);
    const current = useRef<AbortController | null>(null);

    useEffect(() =>
    {
        const unsubscribe = onLogout(() => current.current?.abort());

        return () =>
        {
            current.current?.abort();
            unsubscribe();
        };
    }, []);

    const download = async () =>
    {
        if (current.current)
        {
            return;
        }
        const controller = new AbortController();
        current.current = controller;
        setBusy(true);

        try
        {
            // Конец семестра определяет API: параметр to намеренно не задаётся.
            const response = await fetch(`/api/academic/me/schedule.ics?from=${toApiDate()}`, { credentials: 'include', cache: 'no-store', signal: controller.signal });

            if (response.status === 401)
            {
                endSession();
            }
            if (!response.ok)
            {
                throw new ApiError(response, await response.json().catch(() => null));
            }
            const blob = await response.blob();

            if (controller.signal.aborted)
            {
                return;
            }
            if (blob.size === 0 || (blob.type && !blob.type.startsWith('text/calendar')))
            {
                throw new Error('Неверный формат файла календаря');
            }
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = 'mgimo-schedule.ics';
            document.body.append(link);
            link.click();
            link.remove();
            const revoke = URL.revokeObjectURL.bind(URL);
            window.setTimeout(() => revoke(url), 1000);
        }
        catch (error)
        {
            if (!controller.signal.aborted)
            {
                toast.error(apiErrorMessage(error));
            }
        }
        finally
        {
            current.current = null;
            setBusy(false);
        }
    };

    return <div className="flex max-w-sm flex-col items-start gap-2">
        <Button variant="outline" disabled={busy} onClick={() => void download()}><DownloadIcon aria-hidden />{busy ? 'Скачиваем…' : 'В календарь'}</Button>
        <details className="text-sm text-muted-foreground"><summary className="flex min-h-11 cursor-pointer items-center text-primary">Как импортировать на телефон</summary><div className="flex flex-col gap-3 pt-2">
            <p>Файл содержит занятия с сегодняшнего дня до конца семестра.</p>
            <p>iPhone: откройте файл .ics как вложение в «Почте» и добавьте события в «Календарь».</p>
            <p>Android с Google Календарём: на компьютере откройте настройки календаря, раздел «Импорт и экспорт», и загрузите файл. События появятся на телефоне при синхронизации.</p>
            <p>Это снимок расписания. После изменений скачайте файл заново.</p>
        </div></details>
    </div>;
}
