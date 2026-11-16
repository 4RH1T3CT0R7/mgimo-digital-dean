import type { components } from '@/api/academic';

type Room = components['schemas']['Room'];

const MAP = 'https://mgimo.ru/territory/';

/** Корпус на нашей схеме кампуса: буква, «Н» — Новый корпус; null — такого корпуса на схеме нет. */
export type Building = 'А' | 'Б' | 'В' | 'Г' | 'Н';

export function roomBuilding({ building }: Room): Building | null {
  const name = building.trim();
  if (name === 'Новый корпус') return 'Н';
  const m = name.match(/^Корпус ([АБВГ])$/);
  return m ? (m[1] as Building) : null;
}

/** Этаж по номеру аудитории МГИМО: первая цифра — этаж («1047», «215»), «Ц…» — цокольный. */
export function roomFloor({ number }: Room): string | null {
  const n = number.trim();
  if (/^ц/i.test(n)) return 'Цокольный этаж';
  const digit = n.match(/^\d/);
  return digit ? `${digit[0]}-й этаж` : null;
}

// Планы этажей с карты МГИМО, которые есть у нас (frontend/public/maps, D64): корпус и этаж → файл
const PLANS: Partial<Record<string, string>> = { Б1: 'b-1', Б2: 'b-2', Г2: 'g-2', Г3: 'g-3', Н2: 'n-2', Н4: 'n-4' };

/** План этажа для аудитории: файл и id аудитории на плане («1047», «n202»); null — плана этого этажа у нас нет */
export function roomPlan(room: Room): { file: string; id: string } | null {
  const building = roomBuilding(room);
  const number = room.number.trim();
  const floor = number.match(/^\d/)?.[0];
  const file = building && floor ? PLANS[building + floor] : undefined;
  if (!file || !building) return null;
  return { file, id: building === 'Н' ? `n${number}` : number };
}

/**
 * Аудитория на открытой карте МГИМО (D58): план этажа с подсвеченной аудиторией.
 * Код на карте: корпуса Б, В, Г — номер («2150»), Новый корпус — «n» и номер («n215»). Другой корпус — поиск по номеру.
 * #main_map — якорь плана этажа: страница открывается сразу на нём, без шапки сайта.
 */
export function roomMapUrl(room: Room): string {
  const code = encodeURIComponent(room.number.trim());
  const building = roomBuilding(room);
  if (building === 'Б' || building === 'В' || building === 'Г') return `${MAP}map/?room=${code}#main_map`;
  if (building === 'Н') return `${MAP}map/?room=n${code}#main_map`;
  return `${MAP}?q=${code}`;
}
