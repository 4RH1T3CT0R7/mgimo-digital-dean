import { describe, expect, it } from 'vitest';
import { roomMapUrl } from './room-map';

describe('roomMapUrl', () => {
  it('корпуса Б–Г — по номеру, Новый корпус — с префиксом n, другой корпус — поиск по номеру', () => {
    expect(roomMapUrl({ building: 'Корпус Г', number: '2150' })).toBe('https://mgimo.ru/territory/map/?room=2150');
    expect(roomMapUrl({ building: 'Новый корпус', number: '215' })).toBe('https://mgimo.ru/territory/map/?room=n215');
    expect(roomMapUrl({ building: 'Главный корпус', number: '3047' })).toBe('https://mgimo.ru/territory/?q=3047');
  });
});
