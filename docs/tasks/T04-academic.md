# T04. Сервис `academic`

**Исполнитель:** Всеволод Омельченко (Codex) · **Ревью:** капитан · **Приоритет:** P0
**Сроки:** PR1 — до **12.11** (его ждут сервисы `requests` и `notifications`), PR2 — до **13.11**.

## Цель
Бэкенд для профиля (F1), расписания с заметными переносами (F2) и успеваемости со шкалой МГИМО и светофором (F3, I2). Это обязательное ядро задания (критерий К1) и сценарий жюри «посмотреть расписание и оценки» (К3).

## Контекст — прочитай по порядку
1. `AGENTS.md` — правила (особенно 1–14) и таблица владения каталогами.
2. `docs/tasks/README.md` — как работать, промпт для агента, тесты с БД.
3. **`services/auth/README.md` — образец сервиса. Структуру, стиль, тесты повторяй один в один.**
4. `docs/contracts/academic.yaml` и `docs/contracts/internal/academic.yaml` — что именно должно отвечать API.
5. `docs/contracts/data-model.md` — раздел `academic` (таблицы) и правила **Б1–Б4**.
6. `docs/contracts/seed.md` — раздел `academic` и общие ID.
7. `docs/contracts/events.md` — событие `academic.lesson.changed`.

Твои каталоги: `services/academic/**`. Больше ничего не меняй.

## Что сделать

### PR1 — каркас, внутренний API, базовые данные (до 12.11)
1. Создай структуру сервиса **как в `services/auth`**: `cmd/main.go`, `internal/…`, `migrations/`, `queries/`, `seed/`.
2. Миграции — **все** таблицы `academic` из `data-model.md` (сразу все, чтобы во втором PR не менять схему).
3. Внутренний API на порту 8081 по `internal/academic.yaml`: `getStudentCard`, `getStudentMembership`, `getGroup`, `resolveAudience`. Хендлеры реализуют сгенерированный интерфейс (`make gen`), типы руками не пиши.
4. Seed (часть 1): факультеты, программы, семестр, группы, тестовые студенты и по 8–10 студентов без логина в каждой академической группе, преподаватели, дисциплины. **ID — строго из `seed.md`**. Все ФИО вымышленные.
5. Тесты I1–I4 (ниже).

### PR2 — публичный API (до 13.11)
6. **Чистые функции** (без БД, без HTTP) в `services/academic/internal/grading/`:
   - `Grade(percent int) (Grade5, Ects)` — Б1;
   - `ResultStatus(form, percent *int, passed *bool) Status` — Б1;
   - `AverageGrade5([]Grade5) *float64` — Б1;
   - `Traffic(score, maxToDate, attendance int) (Traffic, reason string, needed int, achievable bool)` — Б2.

   Чистые функции календаря в `services/academic/internal/calendar/`:
   - `SemesterNumber(course int, term Term) int`;
   - `WeekOf(termStart, date time.Time) (number int, parity Parity)` — Б3.
7. Текущее время — только через внедряемую функцию `now func() time.Time` (в тестах фиксируется **2026-11-18 10:00 МСК**). `time.Now()` в логике не вызывай.
8. Эндпоинты по `academic.yaml`:
   - `/me/*` — только роль `student`, всё фильтруется по `X-User-Id`;
   - `/staff/*` — `staff` видит **только группы своего факультета** (чужое → 404), `admin` — всё.
9. Расписание:
   - объединение академической и языковых групп студента;
   - без параметров — текущая неделя (пн–вс);
   - период больше 31 дня или `from > to` → 400;
   - виртуальные записи `moved_away` (из `prev_*`) — только если старая дата попадает в период;
   - `weeks`, `as_of`.
10. `.ics` по RFC 5545: `VCALENDAR`/`VEVENT`, `TZID=Europe/Moscow`, `UID` = id занятия, без `cancelled` и `moved_away`.
11. `POST /staff/lessons/{id}/change`:
    - валидация по типу (`LessonChangeRequest` в контракте);
    - в `prev_*` сохраняются значения **до первого** изменения;
    - отменённое занятие → 409;
    - событие `academic.lesson.changed` через `pkg/events` **после коммита транзакции**.
12. Seed (часть 2):
    - расписание на семестр через `generate_series`;
    - изменения в каждой неделе 16.11–06.12 (перенос, отмена, смена аудитории у каждого тестового студента);
    - оценки, рейтинги, контрольные точки так, как описано в `seed.md`.

    Флаг `-seed-events` (образец — `services/requests/internal/app/replay.go` и проверка флага в `services/requests/cmd/main.go`): публикует `academic.lesson.changed` по всем изменённым занятиям из БД с **детерминированными ID** (`uuid.NewSHA1` от ID занятия) — так уведомления о переносах из тестовых данных создаст сам `notifications`. Добавь `academic` в список сервисов с `-seed-events` в `deploy/seed.sh` — это единственная разрешённая правка вне твоего каталога.
13. Тесты G1–G4, C1–C2, A1–A21.

## Обязательные тест-кейсы
Значения в таблицах — **приёмка**. Тест не проходит — меняй код, а не ожидание.

**G1. `Grade`** (табличный тест, все строки):

| percent | grade5 | ects |
|---|---|---|
| 100 | excellent | A |
| 90 | excellent | A |
| 89 | good | B |
| 82 | good | B |
| 81 | good | C |
| 75 | good | C |
| 74 | satisfactory | D |
| 67 | satisfactory | D |
| 66 | satisfactory | E |
| 60 | satisfactory | E |
| 59 | unsatisfactory | F |
| 0 | unsatisfactory | F |

**G2. `ResultStatus`:**

| Форма | Данные | Ожидаемо |
|---|---|---|
| exam | percent = nil | pending |
| exam | 59 | failed |
| exam | 60 | passed |
| graded_credit | 75 | passed |
| credit | passed = true | passed |
| credit | passed = false | failed |
| credit | passed = nil | pending |

**G3. `AverageGrade5`:** [excellent, good, satisfactory] → 4.00; [excellent, good] → 4.50; [] → nil.

**G4. `Traffic`:**

| score | max_to_date | attendance | traffic | reason | needed | achievable |
|---|---|---|---|---|---|---|
| 0 | 0 | 100 | green | «Оценок пока нет» | 90 | true |
| 50 | 60 | 90 | green | — | 40 | true |
| 45 | 60 | 100 | green | — (ровно 0,75) | 45 | false |
| 40 | 60 | 90 | yellow | «Набрано меньше 75% возможных баллов» | 50 | false |
| 36 | 60 | 90 | yellow | «Набрано меньше 75% возможных баллов» (ровно 0,6) | 54 | false |
| 35 | 60 | 90 | red | «Набрано меньше 60% возможных баллов» | 55 | false |
| 55 | 60 | 65 | yellow | «Посещаемость ниже 70%» | 35 | true |
| 55 | 60 | 45 | red | «Посещаемость ниже 50%» | 35 | true |
| 30 | 60 | 45 | red | «Набрано меньше 60% возможных баллов» | 60 | false |
| 92 | 100 | 100 | green | — | 0 | true |

**C1. `SemesterNumber`:** (1, autumn) → 1; (1, spring) → 2; (2, autumn) → 3; (3, autumn) → 5.

**C2. `WeekOf`** при начале семестра 2026-09-01:

| Дата | Неделя | Чётность |
|---|---|---|
| 2026-08-31 | 1 | odd |
| 2026-09-06 | 1 | odd |
| 2026-09-07 | 2 | even |
| 2026-11-16 | 12 | even |
| 2026-11-22 | 12 | even |
| 2026-11-23 | 13 | odd |

**HTTP-тесты с БД** (`platformtest.NewDB`; данные для теста создаёт сам тест, на seed не опирается; S1 — студент группы G1 + языковые L1, L2 факультета F1; S2 — студент группы G2 факультета F2):

| № | Запрос | Кто | Ожидаемо |
|---|---|---|---|
| I1 | `GET /internal/students/{S1}` / неизвестный id | — | 200 со всеми полями `StudentCard` / 404 |
| I2 | `GET /internal/students/{S1}/membership` | — | `group_ids` = {G1, L1, L2}, `faculty_id` = F1 |
| I3 | `GET /internal/groups/{G1}` / неизвестный | — | `faculty_id` = F1 / 404 |
| I4 | `POST /internal/audience/students`: `{kind: group, group_id: G1}`; `{kind: course, faculty_id: F1, course: 2}`; `{kind: faculty}` без `faculty_id` | — | только студенты G1; только курс 2 факультета F1; 400 |
| A1 | `GET /me/profile` | S1 | 200, `faculty.id` = F1, 2 языковые группы |
| A2 | `GET /me/profile` | без заголовков | 401 |
| A3 | `GET /me/profile` | staff | 403 |
| A4 | `GET /me/schedule?from=2026-11-16&to=2026-11-22` | S1 | есть занятия G1, L1, L2; **нет** занятий G2 |
| A5 | `from=2026-11-22&to=2026-11-16` | S1 | 400 |
| A6 | `from=2026-11-01&to=2026-12-15` | S1 | 400 |
| A7 | без параметров | S1 | `from` = 2026-11-16, `to` = 2026-11-22 |
| A8 | Занятие перенесено с 17.11 на 19.11: период 16–22 / период 18–22 | S1 | две записи (`moved` 19.11 и `moved_away` 17.11 с `moved_to`) / одна (`moved`) |
| A9 | Отменённое занятие в периоде | S1 | `status = cancelled`, заполнен `change.previous` |
| A10 | `GET /me/schedule.ics` | S1 | 200, `text/calendar`, есть `BEGIN:VCALENDAR`, нет UID отменённого занятия |
| A11 | `GET /me/grades/summary` (у S2 есть F в прошлом семестре) | S2 | `debts_count` = 1 |
| A12 | `GET /me/grades/current` | S1 | порядок: все red, затем yellow, затем green |
| A13 | `GET /me/grades/sessions` | S1 | семестры по убыванию; `grade5`/`ects` по Б1; у зачёта `grade5` = null |
| A14 | `GET /staff/groups` | staff F1 / admin / admin + `faculty_id=F2` | только группы F1 / все / только F2 |
| A15 | `GET /staff/lessons?group_id=G2` | staff F1 / admin | 404 / 200 |
| A16 | `POST /staff/lessons/{L}/change` `{type: moved}` без `new_date` | staff F1 | 400, в `details.fields` есть `new_date` |
| A17 | Корректный перенос занятия группы G1 | staff F1 | 200, `status = moved`, `change.previous` = исходные значения; во встроенном NATS (`platformtest.NewNATS`) пришло событие с `group_ids` и `faculty_id` |
| A18 | Затем `room_changed` того же занятия | staff F1 | `change.previous` по-прежнему **исходные** значения |
| A19 | Изменение отменённого занятия | staff F1 | 409 |
| A20 | Изменение занятия группы G1 | staff F2 | 404 |
| A21 | Изменение занятия | студент | 403 |

## Контракты
Предоставляет: `docs/contracts/academic.yaml`, `docs/contracts/internal/academic.yaml`, событие `academic.lesson.changed`. **Контракты не меняй.** Если что-то не сходится — остановись и напиши капитану.

## Зависимости
T02 (образец `auth`, `pkg/platform`, `platformtest`), T03 (`pkg/events`).

## Критерии готовности
**PR1:**
- [ ] `make gen` — без изменений в git после запуска.
- [ ] `go test ./services/academic/...` — зелёный, тесты I1–I4 есть и проходят (в CI — с БД).
- [ ] `make up` + `make seed`: сервис healthy, внутренний API отвечает (`docker compose exec` + `curl academic:8081/internal/students/30000000-0000-4000-8000-000000000001`).
- [ ] CI зелёный.

**PR2:**
- [ ] Тесты G1–G4, C1–C2, A1–A21 есть, **значения совпадают с таблицами**, все проходят.
- [ ] В каждом SQL-запросе для `/me/*` есть фильтр по студенту (проверь поиском по `queries/`).
- [ ] `time.Now()` не используется в логике (только в `cmd/main.go` при создании `now`).
- [ ] Через шлюз под `student.mo` (после `make seed`): `/api/academic/me/schedule` отдаёт неделю с переносом, отменой и сменой аудитории.
- [ ] `.ics` импортируется в Google Calendar или в календарь телефона — скриншот в PR.
- [ ] `bash deploy/seed.sh` публикует события `academic` (в логе `seed_events published=N`, N > 0); повторный запуск даёт те же ID событий (тест по образцу `replay_test.go`).
- [ ] Нет изменений вне `services/academic/` (`git diff --stat main`).
- [ ] CI зелёный.

## Что не входит
- Экраны (T09, T14).
- Уведомления о переносах — их создаёт `notifications` по событию (T06).
- Изменение контрактов, `pkg/`, других сервисов.
- Кэширование, пагинация расписания, поиск по преподавателю.

## Оценка
PR1 — 0,5–1 день, PR2 — 1,5 дня.
