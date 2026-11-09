# T04: исправления полного ревью PR #20 и данных PR #19

Все пункты ниже проверены локально; проверка через настоящий шлюз остаётся отдельным открытым критерием задачи.

| Пункт капитана | Что изменено | Проверка |
|---|---|---|
| 1. `previous` до конкретного изменения | Взято из строки `LockScopedLesson` до UPDATE; `change.previous` API остаётся первым слотом | `TestEventsUseImmediatePreviousForEveryChange`: 17→19→20, аудитория, отмена; исходный слот API не теряется |
| 2. Свежесть seed | `updated_at`/`changed_at` вычисляются от `now()` | `TestFullSeedScheduleAndGrades`: все даты в пределах последних двух часов |
| 3. Длина аудитории | Оба поля не длиннее 100 Unicode-символов, ошибки `new_room.building`/`new_room.number` | 101 кириллический символ → 400 с полем, 100 → 200 |
| 4. N+1 | `ListLessonGroupsBatch`, один запрос для всех ID | `TestSchedulesAndReplayLoadGroupsInOneQuery` с реальным pgx-трассировщиком: расписания студента/сотрудника, ICS и replay |
| 5. Причина сбоя NATS в логе | Добавлено поле `error` | Проверка кода; существующий `TestPublicationFailureDoesNotUndoChange` подтверждает успешный коммит при сбое |
| 6. Слабые A8/A17 | Точные статусы, время `moved_to`, полный исходный слот API и поля события | `TestA8MovedAway`, `TestA17MoveAndPublishAfterCommit` |
| 7. 400 вне контракта ICS | При `from > to` — 200 с пустым VCALENDAR | `TestReversedCalendarPeriodReturnsEmptyCalendar` |
| 8. Битая ссылка | Удалена ссылка на `T04-google-calendar-import.jpg`, оставлен существующий снимок недели | Поиск по `prompts.md` и наличие файла в git |
| Годы поступления из #19 | student.mo — 2025, student.meo — 2024; одногруппники согласованы | `TestFullSeedScheduleAndGrades` проверяет оба профиля |

Проверки: `REQUIRE_DB_TESTS=1 go test -count=1 ./...`, `go vet ./...`; пакет Academic также запускался отдельно. Контракты не менялись, новая SQL-обёртка получена sqlc.
