import { useQuery } from '@tanstack/react-query';
import { LocateFixedIcon, MaximizeIcon, MinusIcon, PlusIcon } from 'lucide-react';
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react';
import { Button } from '@/shared/ui/button';
import type { Building } from '../room-map';

// Планы этажей и схема кампуса — с открытой карты mgimo.ru/territory (D64): только геометрия и цвета,
// извлечены скриптом docs/maps/extract.cjs. Узел: [тег, атрибуты, дети?]
type Attrs = Record<string, string | number | number[] | undefined>;
type PlanNode = [string, Attrs, PlanNode[]?];
type Plan = { viewBox: string; nodes: PlanNode[] };
type Box = [number, number, number, number];

const ROOM_FILL = '#c6efd5'; // аудитории — мягкий зелёный, как учебные помещения на карте МГИМО
const ROOM_STROKE = '#7c8b99';
const DARK_FILL = '#cfd5dc'; // чёрные заливки исходника (служебные помещения) — светлее, чтобы план читался
const CAMPUS_FILL = '#d9dde3';
const CAMPUS_KEY: Record<Building, string> = { А: 'a', Б: 'b', В: 'v', Г: 'g', Н: 'n' };

function usePlan(file: string) {
  return useQuery({
    queryKey: ['map', file],
    queryFn: async () => {
      const response = await fetch(`/maps/${file}.json`);
      if (!response.ok) throw new Error('План не загрузился');
      return (await response.json()) as Plan;
    },
    staleTime: Infinity,
  });
}

const str = (a: Attrs, k: string) => a[k] as string | undefined;

/** Узел плана как JSX: без innerHTML, только известные теги и атрибуты */
function Shape({ node, target, fillOverride }: { node: PlanNode; target?: string; fillOverride?: (a: Attrs) => string | undefined }) {
  const [tag, a, kids] = node;
  if (tag === 'g') {
    return (
      <g transform={str(a, 'transform')}>
        {kids?.map((k, i) => <Shape key={i} node={k} target={target} fillOverride={fillOverride} />)}
      </g>
    );
  }
  const room = str(a, 'room');
  const raw = str(a, 'fill');
  const fill = fillOverride?.(a) ?? (room ? (room === target ? 'var(--primary)' : ROOM_FILL) : raw === '#000000' ? DARK_FILL : raw);
  const paint = {
    fill,
    stroke: str(a, 'stroke') ?? (room ? ROOM_STROKE : undefined),
    strokeWidth: str(a, 'sw'),
    opacity: a.op as number | undefined,
    transform: str(a, 'transform'),
  };
  switch (tag) {
    case 'rect':
      return <rect x={str(a, 'x')} y={str(a, 'y')} width={str(a, 'width')} height={str(a, 'height')} rx={str(a, 'rx')} ry={str(a, 'ry')} {...paint} />;
    case 'path':
      return <path d={str(a, 'd')} {...paint} />;
    case 'polygon':
      return <polygon points={str(a, 'points')} {...paint} />;
    case 'polyline':
      return <polyline points={str(a, 'points')} {...paint} />;
    case 'circle':
      return <circle cx={str(a, 'cx')} cy={str(a, 'cy')} r={str(a, 'r')} {...paint} />;
    case 'ellipse':
      return <ellipse cx={str(a, 'cx')} cy={str(a, 'cy')} rx={str(a, 'rx')} ry={str(a, 'ry')} {...paint} />;
    case 'line':
      return <line x1={str(a, 'x1')} y1={str(a, 'y1')} x2={str(a, 'x2')} y2={str(a, 'y2')} {...paint} />;
    case 'text':
      return (
        <text x={str(a, 'x')} y={str(a, 'y')} fontSize={str(a, 'fs')} textAnchor={str(a, 'anchor') as 'start' | 'middle' | 'end' | undefined} transform={str(a, 'transform')} fill={raw ?? '#333'}>
          {str(a, 'text')}
        </text>
      );
    default:
      return null;
  }
}

/** Все узлы с атрибутом key (аудитории или корпуса) и их границы */
function collect(nodes: PlanNode[], key: 'room' | 'building', acc: { id: string; bb: Box }[] = []) {
  for (const [, a, kids] of nodes) {
    if (a[key] && a.bb) acc.push({ id: a[key] as string, bb: a.bb as Box });
    if (kids) collect(kids, key, acc);
  }
  return acc;
}

function parseBox(viewBox: string): Box {
  const [x, y, w, h] = viewBox.split(/[\s,]+/).map(Number);
  return [x, y, w, h];
}

/** Вид «к аудитории»: аудитория по центру, вокруг — соседние помещения */
function focus(full: Box, bb: Box): Box {
  const size = Math.min(Math.max(Math.max(bb[2], bb[3]) * 7, full[2] / 6), full[2]);
  const w = size, h = size * 0.75;
  // Аудитория у края плана — вид прижимается к границе, а не показывает пустое поле за ней
  const clamp = (v: number, from: number, len: number, view: number) => (view >= len ? from + (len - view) / 2 : Math.min(Math.max(v, from), from + len - view));
  return [clamp(bb[0] + bb[2] / 2 - w / 2, full[0], full[2], w), clamp(bb[1] + bb[3] / 2 - h / 2, full[1], full[3], h), w, h];
}

/** План этажа: нужная аудитория выделена и подписана, сразу приближена; кнопки масштаба и перетаскивание */
export function FloorPlan({ file, roomId, label }: { file: string; roomId: string; label: string }) {
  const plan = usePlan(file);
  const svgRef = useRef<SVGSVGElement>(null);
  const [view, setView] = useState<Box | null>(null);
  const drag = useRef<{ x: number; y: number; box: Box } | null>(null);

  const full = plan.data ? parseBox(plan.data.viewBox) : null;
  const rooms = plan.data ? collect(plan.data.nodes, 'room') : [];
  const target = rooms.find((r) => r.id === roomId);
  const home = full && target ? focus(full, target.bb) : full;
  const box = view ?? home;

  // Колесо мыши — масштаб; слушатель не пассивный, чтобы не прокручивалось окно
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !full) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      setView((v) => zoom(v ?? home!, event.deltaY > 0 ? 1.25 : 0.8, full));
    };
    svg.addEventListener('wheel', onWheel, { passive: false });
    return () => svg.removeEventListener('wheel', onWheel);
  });

  if (plan.isPending) return <div className="flex h-[50dvh] min-h-64 items-center justify-center rounded-lg border bg-white text-sm text-neutral-500">Загружаем план этажа…</div>;
  if (plan.isError || !full || !box) return <p className="rounded-lg bg-muted px-4 py-6 text-sm">План этажа не загрузился — откройте его на сайте МГИМО.</p>;

  const scale = () => {
    const svg = svgRef.current;
    return svg ? Math.max(box[2] / svg.clientWidth, box[3] / svg.clientHeight) : 1;
  };
  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { x: event.clientX, y: event.clientY, box };
  };
  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const d = drag.current;
    if (!d) return;
    const k = scale();
    setView([d.box[0] - (event.clientX - d.x) * k, d.box[1] - (event.clientY - d.y) * k, d.box[2], d.box[3]]);
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="relative overflow-hidden rounded-lg border bg-white">
        <svg
          ref={svgRef}
          viewBox={box.join(' ')}
          preserveAspectRatio="xMidYMid meet"
          role="img"
          aria-label={`План этажа, выделена ${label}`}
          className="h-[50dvh] min-h-64 w-full cursor-grab touch-none select-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={() => (drag.current = null)}
          onPointerCancel={() => (drag.current = null)}
        >
          {plan.data.nodes.map((n, i) => <Shape key={i} node={n} target={roomId} />)}
          {rooms.map(({ id, bb }) => {
            const on = id === roomId;
            const size = Math.min(bb[2], bb[3]) * (on ? 0.42 : 0.32);
            return (
              <text key={id} x={bb[0] + bb[2] / 2} y={bb[1] + bb[3] / 2} fontSize={size} textAnchor="middle" dominantBaseline="central"
                fontWeight={on ? 700 : 500} fill={on ? 'var(--primary-foreground)' : '#24303f'} className="pointer-events-none">
                {id.replace(/^n/, '')}
              </text>
            );
          })}
        </svg>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="Приблизить" onClick={() => setView(zoom(box, 0.7, full))}><PlusIcon aria-hidden /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Отдалить" onClick={() => setView(zoom(box, 1.4, full))}><MinusIcon aria-hidden /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="К аудитории" onClick={() => setView(home)}><LocateFixedIcon aria-hidden /></Button>
          <Button type="button" variant="outline" size="icon" aria-label="Весь этаж" onClick={() => setView(full)}><MaximizeIcon aria-hidden /></Button>
        </div>
      </div>
      <p className="text-[0.8125rem] text-muted-foreground">Двигайте план пальцем или мышью. План — с карты mgimo.ru/territory.</p>
    </div>
  );
}

function zoom(box: Box, factor: number, full: Box): Box {
  const w = Math.min(Math.max(box[2] * factor, full[2] / 25), full[2] * 1.3);
  const h = (box[3] / box[2]) * w;
  return [box[0] + box[2] / 2 - w / 2, box[1] + box[3] / 2 - h / 2, w, h];
}

/** Схема кампуса МГИМО: нужный корпус выделен (буквы корпусов — часть их контуров на исходной схеме) */
export function CampusMap({ building }: { building: Building }) {
  const plan = usePlan('campus');
  if (!plan.data) return null;
  const key = CAMPUS_KEY[building];
  // Заливку выбираем по корпусу: группа корпуса передаёт её всем своим фигурам
  const paint = (nodes: PlanNode[], fill?: string): PlanNode[] =>
    nodes.map(([tag, a, kids]) => {
      const own = a.building ? (a.building === key ? 'var(--primary)' : CAMPUS_FILL) : fill;
      return [tag, own && tag !== 'g' ? { ...a, fill: own } : a, kids && paint(kids, own)];
    });
  return (
    <svg viewBox={plan.data.viewBox} role="img" aria-label={`Схема кампуса МГИМО, выделен ${building === 'Н' ? 'Новый корпус' : `корпус ${building}`}`} className="h-auto w-full">
      {paint(plan.data.nodes).map((n, i) => <Shape key={i} node={n} />)}
    </svg>
  );
}
