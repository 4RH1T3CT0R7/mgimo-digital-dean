# Модель данных и бизнес-правила

Статус: этап 5. У каждого сервиса своя БД и свой пользователь (D27). Связи между БД — только по ID, без внешних ключей. Типы — PostgreSQL. Время — `timestamptz`, время занятий — `time` (Europe/Moscow).

Общий ключ между сервисами: **ID пользователя `auth.users.id` = ID студента `academic.students.id`**. Общие ID для тестовых данных — `seed.md`.

## auth

| Таблица | Колонки | Ограничения |
|---|---|---|
| `users` | `id uuid`, `login text`, `password_hash text`, `role text`, `display_name text`, `faculty_id uuid null`, `created_at` | PK `id`; UNIQUE `login`; CHECK `role in (student, staff, admin)`; CHECK `(role = 'staff') = (faculty_id is not null)` |
| `sessions` | `token_hash bytea`, `user_id uuid`, `created_at`, `expires_at`, `last_seen_at` | PK `token_hash` (SHA-256 от токена; сам токен не хранится); FK `user_id` |
| `login_attempts` | `id bigserial`, `login text`, `ip inet`, `success bool`, `created_at` | индексы `(login, created_at)`, `(ip, created_at)` |

Токен сессии — 32 случайных байта (`crypto/rand`), в cookie — base64url. Просроченные сессии удаляются при проверке.

## academic

| Таблица | Колонки | Ограничения |
|---|---|---|
| `faculties` | `id`, `short_name`, `name` | UNIQUE `short_name` |
| `programs` | `id`, `faculty_id`, `code`, `name`, `level` | `level in (bachelor, specialist, master)` |
| `terms` | `id`, `academic_year text` («2026/2027»), `term text` (autumn/spring), `start_date`, `end_date`, `is_current bool` | частичный UNIQUE: одна строка с `is_current` |
| `groups` | `id`, `faculty_id`, `program_id null`, `name`, `kind`, `course int`, `language text null` | UNIQUE `name`; `kind in (academic, language)` |
| `students` | `id` (= `auth.users.id`), `full_name`, `short_name`, `faculty_id`, `program_id`, `course`, `academic_group_id`, `student_card_no`, `study_form`, `funding`, `study_level`, `enrollment_year`, `status` | UNIQUE `student_card_no` |
| `student_language_groups` | `student_id`, `group_id` | PK оба |
| `teachers` | `id`, `full_name`, `short_name` | только вымышленные |
| `disciplines` | `id`, `name` | |
| `lessons` | `id`, `discipline_id`, `kind`, `format`, `date`, `start_time`, `end_time`, `pair_number`, `room_building null`, `room_number null`, `teacher_id null`, `status`, `change_type null`, `prev_date null`, `prev_start_time null`, `prev_end_time null`, `prev_room_building null`, `prev_room_number null`, `change_reason null`, `changed_at null`, `updated_at` | `status in (scheduled, moved, cancelled, changed)`; индекс `(date)` |
| `lesson_groups` | `lesson_id`, `group_id` | PK оба; индекс `(group_id)` |
| `student_disciplines` | `id`, `student_id`, `discipline_id`, `semester int`, `academic_year`, `term`, `control_form`, `hours`, `credits`, `teacher_id null`, `percent int null`, `passed bool null`, `result_date null`, `current_score int null`, `max_to_date int null`, `attendance_percent int null`, `updated_at` | UNIQUE `(student_id, discipline_id, semester)`; CHECK проценты 0..100 |
| `control_points` | `id`, `student_id`, `discipline_id`, `semester`, `date`, `title`, `score int null`, `max int` | |
| `student_ratings` | `student_id`, `semester`, `percent numeric(5,2)`, `percentile int null` | PK `(student_id, semester)` |

- `moved_away` в базе не хранится: такие записи вычисляются при чтении из `prev_*` перенесённых занятий.
- `as_of` расписания — `max(lessons.updated_at)` по занятиям в выдаче; `as_of` оценок — `max(student_disciplines.updated_at)` студента.
- В строках текущего семестра заполнены `current_score`, `max_to_date`, `attendance_percent`; в прошлых — `percent` / `passed`, `result_date`.

## requests

| Таблица | Колонки | Ограничения |
|---|---|---|
| `service_types` | `id text`, `title`, `description`, `category`, `kind`, `sla_days int`, `fields jsonb`, `attachments_allowed`, `attachments_required`, `attachments_hint null`, `sort_order int`, `active bool` | PK `id` (slug) |
| `applications` | `id uuid`, `number bigint`, `student_id`, `faculty_id`, `service_type_id`, `status`, `fields jsonb`, `comment null`, `student_snapshot jsonb`, `created_at`, `updated_at`, `due_at null`, `last_message_at null`, `last_message_from null` | UNIQUE `number` (sequence); индексы `(student_id, updated_at desc)`, `(faculty_id, status)` |
| `status_history` | `id`, `application_id`, `status`, `comment null`, `actor_role`, `actor_id null`, `created_at` | `actor_role in (student, staff, system)` |
| `messages` | `id`, `application_id`, `author_role`, `author_id`, `author_label`, `text`, `created_at` | |
| `attachments` | `id`, `application_id`, `uploaded_by_role`, `uploaded_by_id`, `file_name`, `content_type`, `size int`, `data bytea`, `is_result bool`, `created_at` | CHECK `size <= 5242880`; файлы в БД, поэтому попадают в `pg_dump` |
| `certificates` | `code text`, `application_id`, `title`, `holder`, `faculty_short`, `issued_at`, `valid_until date` | PK `code`; UNIQUE `application_id` |

`student_snapshot` — `{full_name, short_name, faculty_short, faculty_name, program_code, program_name, course, group_name, student_card_no, study_form, funding, study_level}` из `getStudentCard` (D32).

## notifications

| Таблица | Колонки | Ограничения |
|---|---|---|
| `notifications` | `id`, `type`, `title`, `body`, `important`, `requires_ack`, `link_kind`, `link_id null`, `link_date null`, `audience_kind`, `audience_user_id null`, `audience_faculty_id null`, `audience_course null`, `audience_group_id null`, `author_id null`, `author_label null`, `source_event_id uuid null`, `created_at` | UNIQUE `source_event_id`; индексы по колонкам адресата |
| `notification_reads` | `notification_id`, `user_id`, `read_at`, `acked_at null` | PK `(notification_id, user_id)` |
| `deadlines` | `id`, `title`, `description null`, `kind`, `due_at`, `service_type_id null`, `audience_*` (как в `notifications`), `author_id null`, `created_at` | индекс `(due_at)` |

Объявления и новости сотрудника — это строки `notifications` с `type in (news, announcement)` и `author_id is not null`. Для всех адресатов, кроме `all` и `user`, заполняется `audience_faculty_id`: так сотрудник видит объявления своего факультета.

---

## Бизнес-правила

### Б1. Шкала оценок МГИМО (D20)

| percent | grade5 | ects |
|---|---|---|
| 90–100 | excellent | A |
| 82–89 | good | B |
| 75–81 | good | C |
| 67–74 | satisfactory | D |
| 60–66 | satisfactory | E |
| 0–59 | unsatisfactory | F |

- Для `exam` и `graded_credit` хранится `percent`, а `grade5` и `ects` вычисляются.
- Для `credit` хранится `passed`, `grade5` и `ects` = null.
- `status`: `pending`, если результата нет; `failed`, если `percent < 60` или `passed = false`; иначе `passed`.
- `average_grade5`: excellent=5, good=4, satisfactory=3, unsatisfactory=2; среднее по результатам с оценкой; 2 знака.
- `debts_count` — результаты прошлых семестров со статусом `failed`.

**Покрыть табличным тестом (границы 59/60, 66/67, 74/75, 81/82, 89/90).**

### Б2. Светофор текущей дисциплины (I2)

```
ratio = score / max_to_date        (если max_to_date = 0 → green, reason «Оценок пока нет»)
red    если ratio < 0.60 или attendance_percent < 50
yellow если ratio < 0.75 или attendance_percent < 70
green  иначе
to_excellent.needed     = max(0, 90 − score)
to_excellent.achievable = needed ≤ 100 − max_to_date
```

`traffic_reason` — первая сработавшая причина: «Набрано меньше 60% возможных баллов», «Посещаемость ниже 50%», «Набрано меньше 75% возможных баллов», «Посещаемость ниже 70%». **Покрыть табличным тестом.**

### Б3. Семестр и неделя
- Номер семестра студента: `(course − 1) · 2 + (term = autumn ? 1 : 2)`.
- Неделя 1 — неделя (пн–вс), в которую попадает `terms.start_date`. Номер растёт каждый понедельник. Нечётные номера — `odd`, чётные — `even`.

### Б4. Сетка пар (вымышленная, по мотивам МГИМО: 80 минут, начало в 9:00)

| Пара | 1 | 2 | 3 | 4 | 5 | 6 | 7 |
|---|---|---|---|---|---|---|---|
| Время | 09:00–10:20 | 10:30–11:50 | 12:00–13:20 | 14:20–15:40 | 15:50–17:10 | 17:20–18:40 | 18:50–20:10 |

Обед — 13:20–14:20.

### Б5. Статусы заявки

| Из | В | Кто | Условие |
|---|---|---|---|
| — | `submitted` | студент | подача (kind `document`, `question`) |
| — | `ready` | система | подача, kind `instant_certificate`; справка создаётся в той же транзакции |
| `submitted` | `cancelled` | студент | |
| `submitted` | `in_progress`, `rejected` | сотрудник | для `rejected` нужен комментарий |
| `in_progress` | `needs_info`, `ready`, `rejected` | сотрудник | для `needs_info`, `rejected` нужен комментарий |
| `needs_info` | `in_progress` | студент (сообщением) или сотрудник | |
| `needs_info` | `rejected` | сотрудник | комментарий |

`ready`, `rejected`, `cancelled` — конечные. Любой другой переход → 409 `invalid_transition`. Каждый переход записывается в `status_history` и публикует событие. **Покрыть табличным тестом всех пар.**

- `due_at = created_at + sla_days` календарных дней; у конечных статусов — null.
- `overdue = now > due_at` и статус `submitted` или `in_progress` (в `needs_info` ждём студента).
- `number` — общая последовательность, 6 цифр с ведущими нулями.

### Б6. Справка с места учёбы (I1)
- `code` — 10 символов из алфавита base32 `A–Z2–7`, `crypto/rand`; `valid_until = issued_at + 30 дней`.
- `holder` — «Фамилия И. О.» из слепка.
- PDF содержит: ФИО, факультет, направление, курс, форму и основу обучения из слепка; дату; код и адрес проверки `/verify/{code}`; водяной знак «КОНЦЕПТ. НЕ ЯВЛЯЕТСЯ ДОКУМЕНТОМ»; подвал «Сформировано в прототипе для конкурса „Цифровой деканат будущего“».

### Б7. Адресат уведомления и дедлайна
Элемент виден студенту с принадлежностью `M` (getStudentMembership), если:
```
kind = all
или kind = user    и user_id = студент
или kind = faculty и faculty_id = M.faculty_id
или kind = course  и faculty_id = M.faculty_id и course = M.course
или kind = group   и group_id ∈ M.group_ids
```
- Сотрудник создаёт адресат только внутри своего факультета. Для `group` сервис проверяет `getGroup(group_id).faculty_id = X-Faculty-Id`, иначе 400.
- Администратор — любой адресат.

### Б8. Лента
- Порядок: сначала `important` без `read_at`, затем по `created_at` (новые сверху).
- `unread` — видимые элементы без строки в `notification_reads`.
- `deadlines_soon` — дедлайны с `due_at` в ближайшие 3 суток.
- `days_left` — разница календарных дат по Москве (сегодня = 0).

### Б9. Подписи
- Сообщение сотрудника подписывается `«Деканат {faculty_short}»`, у администратора — «Администрация». Имена сотрудников студенту не показываются (D37).
