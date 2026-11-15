import { ExternalLinkIcon, MapPinIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { components } from '@/api/academic';
import { cn } from '@/shared/lib/utils';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { roomBuilding, roomFloor, roomMapUrl, type Building } from '../room-map';

type Room = components['schemas']['Room'];

// Упрощённая схема главного кампуса (пр. Вернадского, 76): корпуса и переходы между ними, без масштаба.
// Нарисована нами по расположению корпусов; планы этажей МГИМО не копируем (D58, D59).
const BUILDINGS: { id: Building; x: number; y: number; w: number; h: number; rx?: number }[] = [
  { id: 'А', x: 4, y: 58, w: 44, h: 44 },
  { id: 'Б', x: 48, y: 10, w: 70, h: 46 },
  { id: 'В', x: 126, y: 20, w: 60, h: 36 },
  { id: 'Г', x: 194, y: 8, w: 56, h: 46 },
  { id: 'Н', x: 228, y: 60, w: 88, h: 30, rx: 8 },
];
const PASSAGES = [
  { x: 40, y: 50, w: 14, h: 10 },
  { x: 118, y: 32, w: 8, h: 8 },
  { x: 186, y: 30, w: 8, h: 8 },
  { x: 236, y: 54, w: 8, h: 6 },
];

function CampusScheme({ active }: { active: Building }) {
  const name = active === 'Н' ? 'Новый корпус' : `корпус ${active}`;
  return (
    <svg viewBox="0 0 320 106" role="img" aria-label={`Схема корпусов МГИМО, выделен ${name}`} className="h-auto w-full">
      {PASSAGES.map((p) => (
        <rect key={`${p.x}-${p.y}`} x={p.x} y={p.y} width={p.w} height={p.h} className="fill-border" />
      ))}
      {BUILDINGS.map((b) => {
        const on = b.id === active;
        return (
          <g key={b.id}>
            <rect
              x={b.x}
              y={b.y}
              width={b.w}
              height={b.h}
              rx={b.rx ?? 4}
              // Выбранный корпус — рамка и мягкая заливка, а не сплошной синий: синий у нас только у нажимаемого
              className={cn(on ? 'fill-accent stroke-primary' : 'fill-card stroke-border')}
              strokeWidth={on ? 2.5 : 1.5}
            />
            <text
              x={b.x + b.w / 2}
              y={b.y + b.h / 2}
              textAnchor="middle"
              dominantBaseline="central"
              className={cn('text-[13px] font-semibold', on ? 'fill-accent-foreground' : 'fill-muted-foreground')}
            >
              {b.id}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/**
 * Аудитория в расписании: по нажатию — окно со схемой корпусов, этажом и ссылкой на точный план этажа на mgimo.ru.
 * Ctrl, Shift или средняя кнопка — как у обычной ссылки: карта МГИМО в новой вкладке.
 * Карту МГИМО во фрейм не встраиваем: её защита от ботов ставит cookie, а во фрейме он сторонний и блокируется (D59).
 */
export function RoomLink({ room }: { room: Room }) {
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const url = roomMapUrl(room);
  const building = roomBuilding(room);
  const floor = roomFloor(room);

  return (
    <>
      <a
        ref={link}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(event) => {
          if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setOpen(true);
        }}
        className="-my-3 inline-flex min-h-11 items-center gap-1.5 text-sm text-primary underline-offset-4 hover:underline focus-visible:rounded-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        <MapPinIcon className="size-4 shrink-0" aria-hidden />
        {room.building}, {room.number}
        <span className="sr-only"> — где это</span>
      </a>
      <Dialog open={open} onOpenChange={setOpen}>
        {/* Окно открывает не DialogTrigger, поэтому фокус после закрытия возвращаем на ссылку сами */}
        <DialogContent
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            link.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>
              {room.building}, аудитория {room.number}
            </DialogTitle>
            <DialogDescription>{floor ?? 'Этаж — на плане МГИМО'}</DialogDescription>
          </DialogHeader>
          {building ? (
            <figure className="flex flex-col gap-2">
              <div className="rounded-lg border bg-muted/40 p-3">
                <CampusScheme active={building} />
              </div>
              <figcaption className="text-[0.8125rem] text-muted-foreground">Схема упрощённая, без масштаба.</figcaption>
            </figure>
          ) : (
            <p className="text-sm text-muted-foreground">Этого корпуса нет на нашей схеме — найдите аудиторию на карте МГИМО.</p>
          )}
          <Button asChild variant="outline" className="w-full sm:w-fit">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {building ? 'План этажа на mgimo.ru' : 'Найти на карте МГИМО'}
              <ExternalLinkIcon aria-hidden />
              <span className="sr-only"> (в новой вкладке)</span>
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
