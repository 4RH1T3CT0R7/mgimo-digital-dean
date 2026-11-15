import type { components } from '@/api/academic';

const MAP = 'https://mgimo.ru/territory/';

/**
 * Аудитория на открытой карте МГИМО (D58): план этажа с подсвеченной аудиторией.
 * Код на карте: корпуса Б, В, Г — номер («2150»), Новый корпус — «n» и номер («n215»). Другой корпус — поиск по номеру.
 */
export function roomMapUrl({ building, number }: components['schemas']['Room']): string {
  const code = encodeURIComponent(number.trim());
  if (/^Корпус [БВГ]$/.test(building.trim())) return `${MAP}map/?room=${code}`;
  if (building.trim() === 'Новый корпус') return `${MAP}map/?room=n${code}`;
  return `${MAP}?q=${code}`;
}
