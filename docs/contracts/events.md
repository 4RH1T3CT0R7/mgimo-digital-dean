# События (NATS JetStream)

Статус: этап 5. Решение D24. Go-типы и обёртка — `pkg/events` (пишет капитан). Руками JSON событий не собирается (AGENTS.md, правило 4).

## Инфраструктура

| Параметр | Значение |
|---|---|
| Stream | `EVENTS`, subjects `academic.>`, `requests.>` |
| Хранение | file storage, `max_age` 7 дней |
| Дедупликация при публикации | заголовок `Nats-Msg-Id` = `id` события (окно 2 минуты) |
| Подписчик | durable consumer `notifications`, explicit ack, `max_deliver` 5; несколько копий сервиса читают как одна группа |
| Гарантия | «как минимум один раз» → получатель обязан быть **идемпотентным**: `notifications.source_event_id` уникален, повтор игнорируется |

Публикация — **после** успешного коммита транзакции в БД. Если публикация не удалась, ошибка пишется в лог, а запрос пользователя всё равно успешен: уведомление второстепенно по отношению к самому действию.

## Конверт

```json
{
  "id": "6f1c…-uuid",
  "type": "requests.application.status_changed",
  "occurred_at": "2026-11-20T10:15:00+03:00",
  "data": { }
}
```

## Каталог событий

### `academic.lesson.changed`
Публикует `academic` при `POST /staff/lessons/{id}/change`.

| Поле `data` | Тип | Описание |
|---|---|---|
| `lesson_id` | uuid | |
| `faculty_id` | uuid | Факультет групп занятия |
| `group_ids` | uuid[] | Все группы занятия |
| `discipline_name` | string | |
| `change_type` | `moved` \| `cancelled` \| `room_changed` | |
| `previous` | `{date, start_time, end_time, room}` | Состояние **до этого изменения** (не до первого): при «перенос 17.11 → 19.11, затем отмена» в событии отмены `previous` = 19.11. Исходное расписание хранит `change.previous` в API. `room` — строка «Главный корпус, 3047» или null |
| `current` | `{date, start_time, end_time, room}` | Для `cancelled` равно `previous` |
| `reason` | string \| null | |

**Что делает `notifications`:** по одному уведомлению на каждую группу. Тип `schedule_change`, адресат `group`, `audience_faculty_id = faculty_id`, `important = true` для переноса и отмены, ссылка `{kind: lesson, id: lesson_id, date: current.date}`. Тексты — §«Шаблоны».

### `requests.application.status_changed`
Публикует `requests` при создании заявки и каждой смене статуса.

| Поле `data` | Тип | Описание |
|---|---|---|
| `application_id` | uuid | |
| `number` | string | `000123` |
| `student_id` | uuid | |
| `faculty_id` | uuid | |
| `service_type_id` | string | slug услуги, например `study-certificate` |
| `service_title` | string | |
| `old_status` | string \| null | null — заявка только создана |
| `new_status` | string | |
| `comment` | string \| null | Комментарий сотрудника |

**Что делает `notifications`:** если `new_status = submitted` — ничего (студент сам только что подал). Иначе — уведомление типа `application_status`, адресат `user = student_id`, ссылка `{kind: application, id}`. `important = true` для `needs_info`, `ready`, `rejected`.

### `requests.application.message_added`
Публикует `requests` при каждом новом сообщении.

| Поле `data` | Тип | Описание |
|---|---|---|
| `application_id` | uuid | |
| `number` | string | |
| `student_id` | uuid | |
| `service_type_id` | string | slug услуги, например `study-certificate` |
| `service_title` | string | |
| `author_role` | `student` \| `staff` | |
| `author_label` | string | «Деканат ФМО» |

**Что делает `notifications`:** только при `author_role = staff` — уведомление `application_message`, адресат `user = student_id`, ссылка на заявку. Текст сообщения в уведомление **не копируется** (минимизация); студент читает его в заявке.

## Шаблоны текстов уведомлений

| Событие | Заголовок | Текст |
|---|---|---|
| lesson moved | `Перенос: {discipline}` | `Занятие {prev.date} в {prev.start} перенесено на {cur.date} в {cur.start}, {cur.room}. {reason}` |
| lesson cancelled | `Отмена: {discipline}` | `Занятие {prev.date} в {prev.start} отменено. {reason}` |
| lesson room_changed | `Другая аудитория: {discipline}` | `Занятие {cur.date} в {cur.start} пройдёт в {cur.room}.` |
| status in_progress | `Заявка №{number} в работе` | `{service_title}: деканат начал обработку.` |
| status needs_info | `Нужны уточнения по заявке №{number}` | `{service_title}: {comment}` |
| status ready | `Готово: заявка №{number}` | `{service_title}: можно скачать или забрать в деканате.` (если `service_type_id = study-certificate` — `Справка готова, её можно скачать.`) |
| status rejected | `Заявка №{number} отклонена` | `{service_title}: {comment}` |
| message from staff | `Ответ по заявке №{number}` | `{author_label} ответил по заявке «{service_title}».` |

Даты в текстах — `ДД.ММ`, время — `ЧЧ:ММ`, по Москве.
