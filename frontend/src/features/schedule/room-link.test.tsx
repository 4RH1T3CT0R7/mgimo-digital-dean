import { screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it } from 'vitest';
import { LessonRow } from '@/features/schedule/components/LessonRow';
import { weekSchedule } from '@/mocks/fixtures/academic';
import { renderWithProviders, server } from '@/test/render';

// Маленькие план этажа и схема кампуса в формате docs/maps/extract.cjs: [тег, атрибуты, дети?]
const floor = (room: string) => ({
  viewBox: '0 0 1000 800',
  nodes: [
    ['rect', { x: '0', y: '0', width: '1000', height: '800', fill: '#ffffff' }],
    ['g', { transform: 'translate(10,0)' }, [
      ['rect', { x: '100', y: '100', width: '80', height: '120', fill: '#000000', room, bb: [110, 100, 80, 120] }],
      ['rect', { x: '200', y: '100', width: '80', height: '120', fill: '#000000', room: '9999', bb: [210, 100, 80, 120] }],
    ]],
  ],
});
const campus = {
  viewBox: '0 0 378 161',
  nodes: [
    ['g', { building: 'b', bb: [50, 40, 60, 40] }, [['rect', { x: '50', y: '40', width: '60', height: '40', fill: '#cccccc' }]]],
    ['g', { building: 'g', bb: [150, 40, 60, 40] }, [['rect', { x: '150', y: '40', width: '60', height: '40', fill: '#cccccc' }]]],
  ],
};

describe('аудитория в расписании', () => {
  it('открывает окно с планом этажа (аудитория выделена), схемой кампуса и ссылкой на карту МГИМО', async () => {
    const lesson = weekSchedule.lessons.find((l) => l.status === 'scheduled' && l.room?.building === 'Корпус Б')!;
    const number = lesson.room!.number;
    server.use(
      http.get('/maps/campus.json', () => HttpResponse.json(campus)),
      http.get('/maps/:file', () => HttpResponse.json(floor(number))),
    );
    const { user } = renderWithProviders(<LessonRow lesson={lesson} />);

    await user.click(screen.getByRole('link', { name: /где это$/ }));

    const dialog = screen.getByRole('dialog', { name: `Корпус Б, аудитория ${number}` });
    expect(dialog).toHaveTextContent(`${number[0]}-й этаж`);
    const plan = await within(dialog).findByRole('img', { name: `План этажа, выделена аудитория ${number}` });
    expect(within(plan).getByText(number)).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Приблизить' })).toBeInTheDocument();
    expect(await within(dialog).findByRole('img', { name: 'Схема кампуса МГИМО, выделен корпус Б' })).toBeInTheDocument();
    expect(within(dialog).getByRole('link', { name: /Открыть на mgimo\.ru/ })).toHaveAttribute(
      'href',
      `https://mgimo.ru/territory/map/?room=${number}#main_map`,
    );
  });
});
