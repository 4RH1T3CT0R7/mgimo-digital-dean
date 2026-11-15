-- Заявки тестовых студентов (docs/contracts/seed.md). Время — относительно момента загрузки,
-- чтобы на показе сроки были свежими. Номера выдаёт последовательность: 000001–000005.
-- ID заявок: 50000000-0000-4000-8000-00000000000N.
-- Транзакцию открывает deploy/seed.sh (--single-transaction) вместе с отметкой о применении файла.

-- 000001 · student.mo · Вопрос в деканат · ready, с перепиской
INSERT INTO applications (id, student_id, faculty_id, service_type_id, status, fields, comment, student_snapshot,
                          created_at, updated_at, due_at, last_message_at, last_message_from)
VALUES ('50000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'dean-question', 'ready',
        '{"topic": "Стипендия", "question": "Когда будет начислена повышенная академическая стипендия за осенний семестр?"}',
        NULL,
        '{"full_name": "Лебедева Анна Викторовна", "short_name": "Лебедева А. В.", "faculty_short": "ФМО",
          "faculty_name": "Факультет международных отношений", "program_code": "41.03.05",
          "program_name": "Международные отношения", "course": 2, "group_name": "МО-24-03",
          "student_card_no": "2401317", "study_form": "full_time", "funding": "budget", "study_level": "bachelor"}',
        now() - interval '6 days', now() - interval '5 days' + interval '1 hour', NULL,
        now() - interval '5 days' + interval '1 hour', 'staff');
INSERT INTO status_history (application_id, status, comment, actor_role, actor_id, created_at) VALUES
('50000000-0000-4000-8000-000000000001', 'submitted', NULL, 'student', '30000000-0000-4000-8000-000000000001', now() - interval '6 days'),
('50000000-0000-4000-8000-000000000001', 'in_progress', NULL, 'staff', '40000000-0000-4000-8000-000000000001', now() - interval '6 days' + interval '20 hours'),
('50000000-0000-4000-8000-000000000001', 'ready', NULL, 'staff', '40000000-0000-4000-8000-000000000001', now() - interval '5 days' + interval '1 hour');
INSERT INTO messages (id, application_id, author_role, author_id, author_label, text, created_at) VALUES
('51000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001', 'staff',
 '40000000-0000-4000-8000-000000000001', 'Деканат ФМО',
 'Здравствуйте! Приказ о назначении повышенной стипендии подписан, выплата придёт вместе с основной стипендией в ноябре.',
 now() - interval '5 days'),
('51000000-0000-4000-8000-000000000002', '50000000-0000-4000-8000-000000000001', 'student',
 '30000000-0000-4000-8000-000000000001', 'Лебедева А. В.',
 'Спасибо! Нужно ли писать отдельное заявление?',
 now() - interval '5 days' + interval '30 minutes'),
('51000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000001', 'staff',
 '40000000-0000-4000-8000-000000000001', 'Деканат ФМО',
 'Нет, заявление не нужно: начисление автоматическое.',
 now() - interval '5 days' + interval '1 hour');

-- 000002 · student.meo · Материальная помощь · needs_info
INSERT INTO applications (id, student_id, faculty_id, service_type_id, status, fields, comment, student_snapshot,
                          created_at, updated_at, due_at)
VALUES ('50000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002', 'financial-aid', 'needs_info',
        '{"reason": "Сложная жизненная ситуация", "details": "Прошу оказать материальную помощь: один из родителей временно потерял работу."}',
        NULL,
        '{"full_name": "Соколов Максим Олегович", "short_name": "Соколов М. О.", "faculty_short": "МЭО",
          "faculty_name": "Факультет международных экономических отношений", "program_code": "38.03.01",
          "program_name": "Экономика", "course": 3, "group_name": "МЭО-23-02",
          "student_card_no": "2302214", "study_form": "full_time", "funding": "contract", "study_level": "bachelor"}',
        now() - interval '3 days', now() - interval '2 days' + interval '1 hour', now() + interval '11 days');
INSERT INTO status_history (application_id, status, comment, actor_role, actor_id, created_at) VALUES
('50000000-0000-4000-8000-000000000002', 'submitted', NULL, 'student', '30000000-0000-4000-8000-000000000002', now() - interval '3 days'),
('50000000-0000-4000-8000-000000000002', 'in_progress', NULL, 'staff', '40000000-0000-4000-8000-000000000002', now() - interval '2 days'),
('50000000-0000-4000-8000-000000000002', 'needs_info', 'Приложите справку о составе семьи', 'staff',
 '40000000-0000-4000-8000-000000000002', now() - interval '2 days' + interval '1 hour');

-- 000003 · student.mo · Справка в военкомат · in_progress, с сообщением деканата
INSERT INTO applications (id, student_id, faculty_id, service_type_id, status, fields, comment, student_snapshot,
                          created_at, updated_at, due_at, last_message_at, last_message_from)
VALUES ('50000000-0000-4000-8000-000000000003', '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'military-certificate', 'in_progress',
        '{"commissariat": "Военный комиссариат по месту регистрации", "delivery": "Забрать в деканате"}',
        NULL,
        '{"full_name": "Лебедева Анна Викторовна", "short_name": "Лебедева А. В.", "faculty_short": "ФМО",
          "faculty_name": "Факультет международных отношений", "program_code": "41.03.05",
          "program_name": "Международные отношения", "course": 2, "group_name": "МО-24-03",
          "student_card_no": "2401317", "study_form": "full_time", "funding": "budget", "study_level": "bachelor"}',
        now() - interval '2 days', now() - interval '2 days' + interval '3 hours 5 minutes', now() + interval '3 days',
        now() - interval '2 days' + interval '3 hours 5 minutes', 'staff');
INSERT INTO status_history (application_id, status, comment, actor_role, actor_id, created_at) VALUES
('50000000-0000-4000-8000-000000000003', 'submitted', NULL, 'student', '30000000-0000-4000-8000-000000000001', now() - interval '2 days'),
('50000000-0000-4000-8000-000000000003', 'in_progress', NULL, 'staff', '40000000-0000-4000-8000-000000000001', now() - interval '2 days' + interval '3 hours');
INSERT INTO messages (id, application_id, author_role, author_id, author_label, text, created_at) VALUES
('51000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000003', 'staff',
 '40000000-0000-4000-8000-000000000001', 'Деканат ФМО',
 'Справку готовим. Забрать её можно в деканате с 10:00 до 17:00, при себе иметь паспорт.',
 now() - interval '2 days' + interval '3 hours 5 minutes');

-- 000004 · student.mo · Справка с места учёбы · ready, со справкой
INSERT INTO applications (id, student_id, faculty_id, service_type_id, status, fields, comment, student_snapshot,
                          created_at, updated_at, due_at)
VALUES ('50000000-0000-4000-8000-000000000004', '30000000-0000-4000-8000-000000000001',
        '10000000-0000-4000-8000-000000000001', 'study-certificate', 'ready',
        '{"purpose": "По месту требования"}',
        NULL,
        '{"full_name": "Лебедева Анна Викторовна", "short_name": "Лебедева А. В.", "faculty_short": "ФМО",
          "faculty_name": "Факультет международных отношений", "program_code": "41.03.05",
          "program_name": "Международные отношения", "course": 2, "group_name": "МО-24-03",
          "student_card_no": "2401317", "study_form": "full_time", "funding": "budget", "study_level": "bachelor"}',
        now() - interval '1 day', now() - interval '1 day', NULL);
INSERT INTO status_history (application_id, status, comment, actor_role, actor_id, created_at) VALUES
('50000000-0000-4000-8000-000000000004', 'ready', NULL, 'system', NULL, now() - interval '1 day');
INSERT INTO certificates (code, application_id, title, holder, faculty_short, issued_at, valid_until) VALUES
('K7M2QX4PWA', '50000000-0000-4000-8000-000000000004', 'Справка с места учёбы', 'Лебедева А. В.', 'ФМО',
 now() - interval '1 day', ((now() - interval '1 day') AT TIME ZONE 'Europe/Moscow')::date + 30);

-- 000005 · student.meo · Выписка оценок · submitted
INSERT INTO applications (id, student_id, faculty_id, service_type_id, status, fields, comment, student_snapshot,
                          created_at, updated_at, due_at)
VALUES ('50000000-0000-4000-8000-000000000005', '30000000-0000-4000-8000-000000000002',
        '10000000-0000-4000-8000-000000000002', 'transcript', 'submitted',
        '{"language": "Английский", "period": "Весь период обучения"}',
        'Нужна для программы обмена.',
        '{"full_name": "Соколов Максим Олегович", "short_name": "Соколов М. О.", "faculty_short": "МЭО",
          "faculty_name": "Факультет международных экономических отношений", "program_code": "38.03.01",
          "program_name": "Экономика", "course": 3, "group_name": "МЭО-23-02",
          "student_card_no": "2302214", "study_form": "full_time", "funding": "contract", "study_level": "bachelor"}',
        now() - interval '20 hours', now() - interval '20 hours', now() - interval '20 hours' + interval '10 days');
INSERT INTO status_history (application_id, status, comment, actor_role, actor_id, created_at) VALUES
('50000000-0000-4000-8000-000000000005', 'submitted', NULL, 'student', '30000000-0000-4000-8000-000000000002', now() - interval '20 hours');

