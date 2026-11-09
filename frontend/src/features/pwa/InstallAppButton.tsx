import { useState } from 'react';
import { Button } from '@/shared/ui/button';
import { toast } from '@/shared/ui/toast';
import { clearInstallPrompt, isInstalled, isIosSafari, useInstallPrompt } from './installation';

export function InstallAppButton()
{
    const prompt = useInstallPrompt();
    const [busy, setBusy] = useState(false);
    const install = async () =>
    {
        if (!prompt || busy)
        {
            return;
        }
        setBusy(true);

        try
        {
            await prompt.prompt();
            await prompt.userChoice;
            clearInstallPrompt();
        }
        catch
        {
            toast.error('Не удалось открыть установку приложения. Попробуйте ещё раз.');
        }
        finally
        {
            setBusy(false);
        }
    };

    if (isInstalled())
    {
        return null;
    }
    if (prompt)
    {
        return <Button variant="outline" disabled={busy} onClick={() => void install()}>{busy ? 'Открываем установку…' : 'Установить приложение'}</Button>;
    }
    if (isIosSafari())
    {
        return <p className="text-sm text-muted-foreground">Чтобы установить приложение в Safari, нажмите «Поделиться», затем «На экран „Домой“».</p>;
    }

    return null;
}
