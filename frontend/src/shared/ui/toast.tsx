import type { CSSProperties } from 'react';
import { Toaster as Sonner } from 'sonner';

// Тосты: toast.success('Заявка отправлена'), toast.error(apiErrorMessage(err))
export { toast } from 'sonner';

export function Toaster() {
  return (
    <Sonner
      position="top-center"
      closeButton
      toastOptions={{ className: 'font-sans' }}
      style={
        {
          '--normal-bg': 'var(--popover)',
          '--normal-text': 'var(--popover-foreground)',
          '--normal-border': 'var(--border)',
        } as CSSProperties
      }
    />
  );
}
