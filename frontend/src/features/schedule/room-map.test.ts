import { describe, expect, it } from 'vitest';
import { roomBuilding, roomFloor, roomMapUrl, roomPlan } from './room-map';

describe('аудитория на карте МГИМО', () => {
  it('ссылка: корпуса Б–Г — по номеру, Новый корпус — с префиксом n, другой корпус — поиск по номеру', () => {
    expect(roomMapUrl({ building: 'Корпус Г', number: '2150' })).toBe('https://mgimo.ru/territory/map/?room=2150#main_map');
    expect(roomMapUrl({ building: 'Новый корпус', number: '215' })).toBe('https://mgimo.ru/territory/map/?room=n215#main_map');
    expect(roomMapUrl({ building: 'Корпус А', number: '101' })).toBe('https://mgimo.ru/territory/?q=101');
    expect(roomMapUrl({ building: 'Главный корпус', number: '3047' })).toBe('https://mgimo.ru/territory/?q=3047');
  });

  it('корпус на схеме и этаж по номеру', () => {
    expect(roomBuilding({ building: ' Корпус Б ', number: '1047' })).toBe('Б');
    expect(roomBuilding({ building: 'Новый корпус', number: '405' })).toBe('Н');
    expect(roomBuilding({ building: 'Главный корпус', number: '1' })).toBeNull();
    expect(roomFloor({ building: 'Корпус Б', number: '1047' })).toBe('1-й этаж');
    expect(roomFloor({ building: 'Новый корпус', number: '405' })).toBe('4-й этаж');
    expect(roomFloor({ building: 'Корпус Б', number: 'Ц12' })).toBe('Цокольный этаж');
    expect(roomFloor({ building: 'Корпус Б', number: 'Зал 7' })).toBeNull();
  });

  it('план этажа: корпус и этаж → файл, у Нового корпуса id с «n»; нет плана — null', () => {
    expect(roomPlan({ building: 'Корпус Б', number: '1047' })).toEqual({ file: 'b-1', id: '1047' });
    expect(roomPlan({ building: 'Корпус Г', number: '3122' })).toEqual({ file: 'g-3', id: '3122' });
    expect(roomPlan({ building: 'Новый корпус', number: '405' })).toEqual({ file: 'n-4', id: 'n405' });
    expect(roomPlan({ building: 'Корпус Б', number: '4025' })).toBeNull();
    expect(roomPlan({ building: 'Главный корпус', number: '1047' })).toBeNull();
  });
});
