import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { LessonRow } from '@/features/schedule/components/LessonRow';
import { weekSchedule } from '@/mocks/fixtures/academic';
import { renderWithProviders } from '@/test/render';

describe('аудитория в расписании', () => {
  it('открывает окно со схемой корпусов, этажом и ссылкой на план этажа МГИМО', async () => {
    const lesson = weekSchedule.lessons.find((l) => l.status === 'scheduled' && l.room?.building === 'Корпус Б')!;
    const { user } = renderWithProviders(<LessonRow lesson={lesson} />);

    await user.click(screen.getByRole('link', { name: /где это$/ }));

    const dialog = screen.getByRole('dialog', { name: `Корпус Б, аудитория ${lesson.room!.number}` });
    expect(dialog).toHaveTextContent(`${lesson.room!.number[0]}-й этаж`);
    expect(screen.getByRole('img', { name: 'Схема корпусов МГИМО, выделен корпус Б' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /План этажа на mgimo\.ru/ })).toHaveAttribute(
      'href',
      `https://mgimo.ru/territory/map/?room=${lesson.room!.number}#main_map`,
    );
  });
});
