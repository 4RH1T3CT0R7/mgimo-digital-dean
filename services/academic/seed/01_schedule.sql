-- Недельный шаблон на весь текущий семестр: 3 академические пары + 1 языковая в будни.
WITH days AS (
    SELECT day::date AS date, extract(isodow FROM day)::integer AS weekday
    FROM terms t, generate_series(t.start_date::timestamp, t.end_date::timestamp, interval '1 day') day
    WHERE t.is_current AND extract(isodow FROM day) BETWEEN 1 AND 5
), slots AS (
    SELECT g.id AS group_id, days.date, pair,
           CASE WHEN g.faculty_id = '10000000-0000-4000-8000-000000000001'::uuid
                THEN (ARRAY[1, 2, 3, 4])[1 + (weekday + pair - 2) % 4]
                ELSE (ARRAY[7, 8, 9, 3])[1 + (weekday + pair - 2) % 4] END AS subject,
           CASE WHEN pair = 1 THEN 'lecture' ELSE 'seminar' END AS kind
    FROM days CROSS JOIN groups g CROSS JOIN generate_series(1, 3) pair
    WHERE g.kind = 'academic'
    UNION ALL
    SELECT g.id, days.date, 4,
           CASE WHEN g.language = 'Английский язык' THEN 5
                WHEN g.language = 'Французский язык' THEN 6 ELSE 10 END,
           'language'
    FROM days CROSS JOIN groups g
    WHERE g.kind = 'language' AND (
        (g.language = 'Английский язык' AND weekday IN (1, 3, 5))
        OR (g.language <> 'Английский язык' AND weekday IN (2, 4))
    )
), rooms AS (
    -- Настоящие учебные аудитории с открытой карты mgimo.ru/territory (D58): у каждой дисциплины свои 4 аудитории,
    -- по одной на номер пары. Расписание из них правдоподобное, но вымышленное.
    SELECT slots.*, (ARRAY[
        'Корпус Б|1047', 'Корпус Б|1049', 'Корпус Б|1051', 'Корпус Б|1052',
        'Корпус Б|2009', 'Корпус Б|2010', 'Корпус Б|2011', 'Корпус Б|2016',
        'Корпус Г|2115', 'Корпус Г|2116', 'Корпус Г|2119', 'Корпус Г|2121',
        'Корпус Г|3122', 'Корпус Г|3123', 'Корпус Г|3124', 'Корпус Г|3126',
        'Новый корпус|202', 'Новый корпус|206', 'Новый корпус|207', 'Новый корпус|212',
        'Новый корпус|220', 'Новый корпус|221', 'Новый корпус|226', 'Новый корпус|404',
        'Корпус Б|2039', 'Корпус Б|2040', 'Корпус Б|2041', 'Корпус Б|2017',
        'Корпус Г|2123', 'Корпус Г|2126', 'Корпус Г|2131', 'Корпус Г|2133',
        'Корпус Г|3128', 'Корпус Г|3134', 'Корпус Г|3135', 'Корпус Г|3136',
        'Корпус Б|1057', 'Корпус Б|1058', 'Корпус Б|1059', 'Корпус Б|1067'
    ])[(subject - 1) * 4 + pair] AS room
    FROM slots
)
INSERT INTO lessons (id, discipline_id, kind, format, date, start_time, end_time,
                     pair_number, room_building, room_number, teacher_id, status, updated_at)
SELECT md5('academic:lesson:' || group_id::text || ':' || date::text || ':' || pair::text)::uuid,
       ('51000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid,
       kind, 'offline', date,
       (ARRAY['09:00', '10:30', '12:00', '14:20'])[pair]::time,
       (ARRAY['10:20', '11:50', '13:20', '15:40'])[pair]::time,
       pair, split_part(room, '|', 1), split_part(room, '|', 2),
       ('52000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid,
       'scheduled', now() - interval '1 hour'
FROM rooms;

-- ID вычисляется из той же пары (группа, дата, номер пары), без отдельной таблицы шаблонов.
INSERT INTO lesson_groups (lesson_id, group_id)
SELECT l.id, g.id
FROM lessons l CROSS JOIN groups g
WHERE l.id = md5('academic:lesson:' || g.id::text || ':' || l.date::text || ':' || l.pair_number::text)::uuid;

-- В каждой из трёх недель: перенос вторника, отмена среды, новая аудитория четверга.
-- Исходная запись остаётся только в prev_*; moved_away вычисляет API.
WITH changes AS (
    SELECT lg.lesson_id, extract(isodow FROM l.date)::integer AS weekday
    FROM lessons l
    JOIN lesson_groups lg ON lg.lesson_id = l.id
    JOIN groups g ON g.id = lg.group_id
    WHERE g.kind = 'academic' AND l.date BETWEEN '2026-11-16' AND '2026-12-06'
      AND ((extract(isodow FROM l.date) = 2 AND l.pair_number = 2)
        OR (extract(isodow FROM l.date) = 3 AND l.pair_number = 1)
        OR (extract(isodow FROM l.date) = 4 AND l.pair_number = 2))
)
UPDATE lessons l SET
    prev_date = l.date, prev_start_time = l.start_time, prev_end_time = l.end_time,
    prev_room_building = l.room_building, prev_room_number = l.room_number,
    date = CASE WHEN c.weekday = 2 THEN l.date + 2 ELSE l.date END,
    start_time = CASE WHEN c.weekday = 2 THEN '15:50'::time ELSE l.start_time END,
    end_time = CASE WHEN c.weekday = 2 THEN '17:10'::time ELSE l.end_time END,
    pair_number = CASE WHEN c.weekday = 2 THEN 5 ELSE l.pair_number END,
    room_building = CASE WHEN c.weekday = 4 THEN 'Новый корпус' ELSE l.room_building END,
    room_number = CASE WHEN c.weekday = 4 THEN '405' ELSE l.room_number END,
    status = CASE c.weekday WHEN 2 THEN 'moved' WHEN 3 THEN 'cancelled' ELSE 'changed' END,
    change_type = CASE c.weekday WHEN 2 THEN 'moved' WHEN 3 THEN 'cancelled' ELSE 'room_changed' END,
    change_reason = CASE c.weekday WHEN 2 THEN 'Преподаватель перенёс занятие'
                                 WHEN 3 THEN 'Преподаватель заболел' ELSE 'В аудитории ремонт' END,
    changed_at = now() - interval '30 minutes',
    updated_at = now() - interval '30 minutes'
FROM changes c WHERE l.id = c.lesson_id;
