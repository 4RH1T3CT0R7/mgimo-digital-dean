import { ExternalLinkIcon, MapPinIcon } from 'lucide-react';
import { useRef, useState } from 'react';
import type { components } from '@/api/academic';
import { Button } from '@/shared/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/shared/ui/dialog';
import { roomBuilding, roomFloor, roomMapUrl, roomPlan } from '../room-map';
import { CampusMap, FloorPlan } from './RoomMap';

type Room = components['schemas']['Room'];

/**
 * Аудитория в расписании: по нажатию — окно с планом этажа (аудитория выделена, план приближен к ней)
 * и схемой кампуса с карты МГИМО (D64). Ctrl, Shift или средняя кнопка — карта mgimo.ru в новой вкладке.
 * Страницу МГИМО во фрейм не встраиваем: её защита от ботов ставит cookie, а во фрейме он сторонний и блокируется (D59).
 */
export function RoomLink({ room }: { room: Room }) {
  const [open, setOpen] = useState(false);
  const link = useRef<HTMLAnchorElement>(null);
  const url = roomMapUrl(room);
  const building = roomBuilding(room);
  const floor = roomFloor(room);
  const plan = roomPlan(room);
  const label = `аудитория ${room.number}`;

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
          className="max-w-3xl"
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
          {plan && <FloorPlan file={plan.file} roomId={plan.id} label={label} />}
          {building ? (
            <figure className="flex flex-col gap-1.5">
              <div className="rounded-lg border bg-white p-2">
                <CampusMap building={building} />
              </div>
              <figcaption className="text-[0.8125rem] text-muted-foreground">
                {building === 'Н' ? 'Новый корпус' : `Корпус ${building}`} на схеме кампуса
              </figcaption>
            </figure>
          ) : (
            <p className="text-sm text-muted-foreground">Этого корпуса нет на нашей схеме — найдите аудиторию на карте МГИМО.</p>
          )}
          <Button asChild variant="outline" className="w-full sm:w-fit">
            <a href={url} target="_blank" rel="noopener noreferrer">
              {building ? 'Открыть на mgimo.ru' : 'Найти на карте МГИМО'}
              <ExternalLinkIcon aria-hidden />
              <span className="sr-only"> (в новой вкладке)</span>
            </a>
          </Button>
        </DialogContent>
      </Dialog>
    </>
  );
}
