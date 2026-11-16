-- Календарный план осеннего семестра 2026/2027 и сессия (D62). Отдельный файл: ложится и на чистую базу,
-- и поверх уже применённых 00–02. Даты совпадают с дедлайнами notifications/seed/02_deadlines.sql:
-- зачёты 18.12 10:30 (МО-24-03) и 22.12 12:00 (Англ-12), экзамен 12.01 09:00 (МО-24-03).
-- Периоды выровнены по неделям, чтобы полоса «Учебный год» показывала недели целиком.
INSERT INTO term_periods (term_id, kind, start_date, end_date) VALUES
('12000000-0000-4000-8000-000000000001', 'study',       '2026-09-01', '2026-12-20'),
('12000000-0000-4000-8000-000000000001', 'credit_week', '2026-12-21', '2026-12-27'),
('12000000-0000-4000-8000-000000000001', 'holidays',    '2026-12-28', '2027-01-10'),
('12000000-0000-4000-8000-000000000001', 'session',     '2027-01-11', '2027-01-24'),
('12000000-0000-4000-8000-000000000001', 'vacation',    '2027-01-25', '2027-02-07');

-- В зачётную неделю обычных пар нет (01_schedule.sql генерирует их до старого конца семестра 27.12).
DELETE FROM lessons WHERE date > '2026-12-20' AND kind IN ('lecture', 'seminar', 'language');

-- Зачёты, консультации и экзамены. Аудитории — настоящие, из набора аудиторий дисциплины в 01_schedule.sql (D58).
WITH session (group_n, subject, kind, date, start_time, end_time, building, number) AS (VALUES
    -- student.mo: МО-24-03 (1), Англ-12 (2), Фр-07 (3)
    (1, 4,  'credit',       '2026-12-18', '10:30', '11:50', 'Корпус Г',     '3122'),
    (2, 5,  'credit',       '2026-12-22', '12:00', '13:20', 'Новый корпус', '202'),
    (3, 6,  'credit',       '2026-12-24', '12:00', '13:20', 'Новый корпус', '220'),
    (1, 1,  'consultation', '2027-01-11', '12:00', '13:20', 'Корпус Б',     '1049'),
    (1, 1,  'exam',         '2027-01-12', '09:00', '13:20', 'Корпус Б',     '1047'),
    (1, 2,  'consultation', '2027-01-14', '12:00', '13:20', 'Корпус Б',     '2010'),
    (1, 2,  'exam',         '2027-01-15', '09:00', '13:20', 'Корпус Б',     '2009'),
    (1, 3,  'consultation', '2027-01-18', '12:00', '13:20', 'Корпус Г',     '2116'),
    (1, 3,  'exam',         '2027-01-19', '09:00', '13:20', 'Корпус Г',     '2115'),
    -- student.meo: МЭО-23-02 (4), Англ-31 (5), Кит-04 (6)
    (4, 3,  'credit',       '2026-12-17', '12:00', '13:20', 'Корпус Г',     '2119'),
    (5, 5,  'credit',       '2026-12-23', '10:30', '11:50', 'Новый корпус', '206'),
    (6, 10, 'credit',       '2026-12-25', '10:30', '11:50', 'Корпус Б',     '1058'),
    (4, 7,  'consultation', '2027-01-12', '12:00', '13:20', 'Корпус Б',     '2040'),
    (4, 7,  'exam',         '2027-01-13', '09:00', '13:20', 'Корпус Б',     '2039'),
    (4, 8,  'consultation', '2027-01-15', '12:00', '13:20', 'Корпус Г',     '2126'),
    (4, 8,  'exam',         '2027-01-18', '09:00', '13:20', 'Корпус Г',     '2123'),
    (4, 9,  'consultation', '2027-01-20', '12:00', '13:20', 'Корпус Г',     '3134'),
    (4, 9,  'exam',         '2027-01-21', '09:00', '13:20', 'Корпус Г',     '3128')
), rows AS (
    SELECT md5('academic:session:' || group_n || ':' || date || ':' || kind)::uuid AS id,
           ('20000000-0000-4000-8000-' || lpad(group_n::text, 12, '0'))::uuid AS group_id,
           ('51000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid AS discipline_id,
           ('52000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid AS teacher_id,
           kind, date::date AS date, start_time::time AS start_time, end_time::time AS end_time,
           array_position(ARRAY['09:00', '10:30', '12:00'], start_time) AS pair_number, building, number
    FROM session
), inserted AS (
    INSERT INTO lessons (id, discipline_id, kind, format, date, start_time, end_time,
                         pair_number, room_building, room_number, teacher_id, status, updated_at)
    SELECT id, discipline_id, kind, 'offline', date, start_time, end_time,
           pair_number, building, number, teacher_id, 'scheduled', now() - interval '1 hour'
    FROM rows
)
INSERT INTO lesson_groups (lesson_id, group_id) SELECT id, group_id FROM rows;

-- Зачёт в последнюю учебную неделю заменяет обычную пару своей группы в то же время.
DELETE FROM lessons r USING lesson_groups rg, lesson_groups sg, lessons s
WHERE rg.lesson_id = r.id AND sg.lesson_id = s.id AND rg.group_id = sg.group_id
  AND r.kind IN ('lecture', 'seminar', 'language') AND s.kind IN ('consultation', 'credit', 'exam')
  AND r.date = s.date AND r.start_time < s.end_time AND s.start_time < r.end_time;

-- Форма контроля текущих дисциплин — по расписанию сессии: есть зачёт в группах студента — значит, зачёт.
UPDATE student_disciplines sd SET control_form = 'credit'
FROM students st
WHERE st.id = sd.student_id AND sd.academic_year = '2026/2027' AND sd.term = 'autumn'
  AND EXISTS (
      SELECT 1 FROM lessons l JOIN lesson_groups lg ON lg.lesson_id = l.id
      WHERE l.kind = 'credit' AND l.discipline_id = sd.discipline_id
        AND (lg.group_id = st.academic_group_id OR EXISTS (
            SELECT 1 FROM student_language_groups slg WHERE slg.student_id = st.id AND slg.group_id = lg.group_id
        ))
  );

-- Семестр заканчивается последним днём сессии. Сдвиг — после генерации пар в 01_schedule.sql,
-- иначе обычные пары растянулись бы на январь.
UPDATE terms SET end_date = '2027-01-24' WHERE id = '12000000-0000-4000-8000-000000000001';
