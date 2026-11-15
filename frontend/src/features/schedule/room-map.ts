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
