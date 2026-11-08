import { screen, waitFor, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { components } from '@/api/academic';
import { academicState, resetAcademicState, weekSchedule } from '@/mocks/fixtures/academic';
import { renderWithProviders, server } from '@/test/render';
import { ChangeLessonSheet } from './ChangeLessonSheet';
import { StaffLessonsPage } from './StaffLessonsPage';

const lesson = weekSchedule.lessons.find((item) => item.date === '2026-11-18' && item.start_time === '10:30')!;

beforeEach(() => {
    resetAcademicState();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'));
});

afterEach(() => {
    resetAcademicState();
    vi.useRealTimers();
});

function renderSheet()
{
    const onClose = vi.fn();

    return { onClose, ...renderWithProviders(<ChangeLessonSheet lesson={lesson} onClose={onClose} />, { login: 'dekanat.mo' }) };
}

async function prepareMove(user: ReturnType<typeof renderSheet>['user'])
{
    await user.type(screen.getByLabelText('Новая дата'), '2026-11-19');
    await user.selectOptions(screen.getByLabelText('Пара'), '3');
    await user.click(screen.getByRole('button', { name: 'Далее' }));
}

describe('T14: обязательные сценарии Y1–Y5', () => {
    it('Y1: без новой даты показывает ошибку и не отправляет запрос', async () => {
        const sent = vi.fn();

        server.use(http.post('/api/academic/staff/lessons/:id/change', () => { sent(); return HttpResponse.json(lesson); }));
        const { user } = renderSheet();
        await user.click(screen.getByRole('button', { name: 'Далее' }));

        expect(screen.getByText('Укажите новую дату')).toBeInTheDocument();
        expect(screen.getByLabelText('Новая дата')).toHaveAttribute('aria-invalid', 'true');
        expect(sent).not.toHaveBeenCalled();
    });

    it('Y2: третья пара отправляет 12:00–13:20 только после подтверждения', async () => {
        let body: components['schemas']['LessonChangeRequest'] | undefined;

        server.use(http.post('/api/academic/staff/lessons/:id/change', async ({ request }) => {
            body = await request.json() as typeof body;

            return HttpResponse.json({ ...lesson, status: 'moved' });
        }));
        const { user, onClose } = renderSheet();
        await prepareMove(user);

        expect(body).toBeUndefined();
        expect(screen.getByText(/Студенты групп МО-24-03 получат уведомление/)).toBeInTheDocument();
        await user.click(screen.getByRole('button', { name: 'Сохранить изменение' }));
        await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
        expect(body).toEqual({ type: 'moved', new_date: '2026-11-19', new_start_time: '12:00', new_end_time: '13:20' });
    });

    it('Y3: конфликт объясняет, что занятие уже отменено', async () => {
        server.use(http.post('/api/academic/staff/lessons/:id/change', () => HttpResponse.json({ code: 'conflict', message: 'Конфликт' }, { status: 409 })));
        const { user } = renderSheet();
        await prepareMove(user);
        await user.click(screen.getByRole('button', { name: 'Сохранить изменение' }));

        expect(await screen.findByRole('alert')).toHaveTextContent('Занятие уже отменено, изменить его нельзя');
        expect(screen.getByRole('button', { name: 'Сохранить изменение' })).toBeDisabled();
    });

    it('Y4: у отменённого и перенесённого исходного занятия нет «Изменить»', async () => {
        renderWithProviders(<StaffLessonsPage />, { route: '/staff/lessons?date=2026-11-18', login: 'dekanat.mo' });
        const cancelled = await screen.findByText('Болезнь преподавателя');
        const ghost = screen.getByRole('link', { name: 'Перенесено на 19.11, 12:00' });

        expect(within(cancelled.closest('li')!).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
        expect(within(ghost.closest('li')!).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument();
        expect(ghost).toHaveAttribute('href', '/staff/lessons?date=2026-11-19');
    });

    it('Y5: успешный перенос обновляет список и обе метки', async () => {
        const { user } = renderWithProviders(<StaffLessonsPage />, { route: '/staff/lessons?date=2026-11-18', login: 'dekanat.mo' });
        const day = await screen.findByRole('region', { name: 'среда, 18 ноября' });
        await user.click(within(day).getAllByRole('button', { name: 'Изменить' })[0]);
        await prepareMove(user);
        await user.click(screen.getByRole('button', { name: 'Сохранить изменение' }));

        expect(await screen.findByText('Перенесено с 18.11, 10:30')).toBeInTheDocument();
        expect(within(day).getByRole('link', { name: 'Перенесено на 19.11, 12:00' })).toHaveAttribute('href', '/staff/lessons?date=2026-11-19');
        await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
        expect(academicState.lessons.find((item) => item.id === lesson.id && item.status === 'moved')?.start_time).toBe('12:00');
    });
});

describe('T14: дополнительные проверки', () => {
    it('своя сетка времени проверяет окончание', async () => {
        const { user } = renderSheet();
        await user.type(screen.getByLabelText('Новая дата'), '2026-11-19');
        await user.selectOptions(screen.getByLabelText('Пара'), 'custom');
        await user.clear(screen.getByLabelText('Окончание'));
        await user.type(screen.getByLabelText('Окончание'), '09:00');
        await user.click(screen.getByRole('button', { name: 'Далее' }));

        expect(screen.getByText('Время окончания должно быть позже начала')).toBeInTheDocument();
    });

    it('ошибка 400 привязывается к полю формы', async () => {
        server.use(http.post('/api/academic/staff/lessons/:id/change', () => HttpResponse.json({ code: 'validation_failed', message: 'Проверьте дату', details: { fields: { new_date: 'Дата вне учебного периода' } } }, { status: 400 })));
        const { user } = renderSheet();
        await prepareMove(user);
        await user.click(screen.getByRole('button', { name: 'Сохранить изменение' }));

        expect(await screen.findByText('Дата вне учебного периода')).toBeInTheDocument();
        expect(screen.getByLabelText('Новая дата')).toHaveAttribute('aria-describedby', 'new_date-error');
    });

    it('отмена отправляет только тип и причину', async () => {
        let body: unknown;

        server.use(http.post('/api/academic/staff/lessons/:id/change', async ({ request }) => { body = await request.json(); return HttpResponse.json(lesson); }));
        const { user, onClose } = renderSheet();
        await user.selectOptions(screen.getByLabelText('Что изменить'), 'cancelled');
        await user.type(screen.getByLabelText('Причина'), 'Болезнь преподавателя');
        await user.click(screen.getByRole('button', { name: 'Далее' }));
        await user.click(screen.getByRole('button', { name: 'Сохранить изменение' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());

        expect(body).toEqual({ type: 'cancelled', reason: 'Болезнь преподавателя' });
    });

    it('смена аудитории требует корпус и номер', async () => {
        const { user, onClose } = renderSheet();
        await user.selectOptions(screen.getByLabelText('Что изменить'), 'room_changed');
        await user.click(screen.getByRole('button', { name: 'Далее' }));
        expect(screen.getByText('Укажите корпус и номер аудитории')).toBeInTheDocument();
        await user.type(screen.getByLabelText('Корпус'), 'Главный корпус');
        await user.type(screen.getByLabelText('Аудитория'), '3047');
        await user.click(screen.getByRole('button', { name: 'Далее' }));
        await user.click(screen.getByRole('button', { name: 'Сохранить изменение' }));
        await waitFor(() => expect(onClose).toHaveBeenCalled());

        expect(academicState.lessons.find((item) => item.id === lesson.id)?.room?.number).toBe('3047');
    });

    it('администратор сначала выбирает факультет; чужая неделя не остаётся', async () => {
        const { user } = renderWithProviders(<StaffLessonsPage />, { route: '/staff/lessons?date=2026-11-18', login: 'admin' });
        await user.selectOptions(await screen.findByLabelText('Факультет'), '10000000-0000-4000-8000-000000000001');
        expect(await screen.findByLabelText('Группа')).toHaveValue('20000000-0000-4000-8000-000000000001');
        expect(await screen.findByText('Болезнь преподавателя')).toBeInTheDocument();
        await user.selectOptions(screen.getByLabelText('Факультет'), '10000000-0000-4000-8000-000000000002');

        expect(await screen.findByText('На этой неделе занятий нет')).toBeInTheDocument();
        expect(screen.getByLabelText('Группа')).toHaveValue('20000000-0000-4000-8000-000000000004');
        expect(screen.queryByText('Болезнь преподавателя')).not.toBeInTheDocument();
    });
});
