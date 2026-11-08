-- Завершённые семестры: результаты от A до E; у student.meo ровно один F в 4-м семестре.
WITH subjects AS (
    SELECT s.id AS student_id, s.course, sem AS semester, n,
           CASE WHEN s.course = 2 THEN n ELSE (ARRAY[7, 8, 9, 5, 10, 3])[n] END AS subject
    FROM students s
    CROSS JOIN LATERAL generate_series(1, (s.course-1)*2) sem
    CROSS JOIN generate_series(1, 6) n
    WHERE s.id IN ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')
)
INSERT INTO student_disciplines (id, student_id, discipline_id, semester, academic_year, term,
                                control_form, hours, credits, percent, passed, result_date, updated_at)
SELECT md5('academic:grade:' || student_id::text || ':' || semester::text || ':' || subject::text)::uuid,
       student_id, ('51000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid,
       semester,
       (2026 - (course-1) + (semester-1)/2)::text || '/' || (2027 - (course-1) + (semester-1)/2)::text,
       CASE WHEN semester % 2 = 1 THEN 'autumn' ELSE 'spring' END,
       CASE WHEN n = 6 THEN 'credit' WHEN n = 5 THEN 'graded_credit' ELSE 'exam' END,
       108, 3,
       CASE WHEN n = 6 THEN NULL
            WHEN course = 3 AND semester = 4 AND n = 1 THEN 55
            ELSE (ARRAY[95, 85, 78, 70, 63])[n] END,
       CASE WHEN n = 6 THEN true ELSE NULL END,
       make_date(2026 - (course-1) + (semester+1)/2, CASE WHEN semester % 2 = 1 THEN 1 ELSE 6 END, 20),
       '2026-11-09 00:00:00+03'::timestamptz
FROM subjects;

-- Текущие шесть дисциплин. У student.mo строго 3 зелёных / 2 жёлтых / 1 красная.
WITH subjects AS (
    SELECT s.id AS student_id, s.course, n,
           CASE WHEN s.course = 2 THEN n ELSE (ARRAY[7, 8, 9, 5, 10, 3])[n] END AS subject
    FROM students s CROSS JOIN generate_series(1, 6) n
    WHERE s.id IN ('30000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000002')
)
INSERT INTO student_disciplines (id, student_id, discipline_id, semester, academic_year, term,
                                control_form, hours, credits, teacher_id, current_score, max_to_date,
                                attendance_percent, updated_at)
SELECT md5('academic:grade:' || student_id::text || ':' || (course*2-1)::text || ':' || subject::text)::uuid,
       student_id, ('51000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid,
       course*2-1, '2026/2027', 'autumn',
       CASE WHEN n = 6 THEN 'credit' ELSE 'exam' END, 108, 3,
       ('52000000-0000-4000-8000-' || lpad(subject::text, 12, '0'))::uuid,
       (ARRAY[55, 50, 48, 40, 55, 30])[n], 60,
       (ARRAY[95, 90, 85, 90, 65, 90])[n],
       '2026-11-09 00:00:00+03'::timestamptz
FROM subjects;

-- Три контрольные точки на дисциплину; третья ещё не оценена.
INSERT INTO control_points (id, student_id, discipline_id, semester, date, title, score, max)
SELECT md5('academic:point:' || sd.id::text || ':' || n::text)::uuid,
       sd.student_id, sd.discipline_id, sd.semester, '2026-10-01'::date + (n-1)*21,
       CASE n WHEN 1 THEN 'Контрольная работа 1' WHEN 2 THEN 'Семинарская работа' ELSE 'Контрольная работа 2' END,
       CASE n WHEN 1 THEN sd.current_score/2 WHEN 2 THEN sd.current_score-sd.current_score/2 ELSE NULL END, 30
FROM student_disciplines sd CROSS JOIN generate_series(1, 3) n
WHERE sd.academic_year = '2026/2027' AND sd.term = 'autumn';

INSERT INTO student_ratings (student_id, semester, percent, percentile) VALUES
('30000000-0000-4000-8000-000000000001', 2, 82.50, 78),
('30000000-0000-4000-8000-000000000002', 4, 76.20, 61);
