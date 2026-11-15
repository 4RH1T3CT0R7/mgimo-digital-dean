import { useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/shared/ui/dialog';
import { SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

const desktop = '(min-width: 640px)';
function subscribe(change: () => void) {
  const media = matchMedia(desktop);
  media.addEventListener('change', change);
  return () => media.removeEventListener('change', change);
}

export function FormDialog({ title, description, open, onOpenChange, children }: {
  title: string;
  description: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}) {
  const wide = useSyncExternalStore(subscribe, () => matchMedia(desktop).matches);
  const Content = wide ? DialogContent : SheetContent;
  const Header = wide ? DialogHeader : SheetHeader;
  const Title = wide ? DialogTitle : SheetTitle;
  const Description = wide ? DialogDescription : SheetDescription;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild><Button>{title}</Button></DialogTrigger>
      <Content className="flex min-h-0 flex-col overflow-hidden [&>button]:size-11">
        <Header>
          <Title>{title}</Title>
          <Description>{description}</Description>
        </Header>
        {children}
      </Content>
    </Dialog>
  );
}
