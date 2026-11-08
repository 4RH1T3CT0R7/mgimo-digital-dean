# T02. `pkg/platform` и сервис `auth` (эталон)

**Исполнитель:** Капитан (Claude Code) · **Приоритет:** P0 · **Веха:** M1

## Цель
Общая платформа сервисов и первый сервис, который служит **образцом** для остальных (D25). Закрывает вход (F1) и требования безопасности: хеши паролей, сессии, защиту от перебора (К3).

## Контекст
- `AGENTS.md`; `docs/architecture.md` §3 (шлюз и роли).
- `docs/security.md` §3–4 (угрозы и меры ИАФ / УПД / РСБ).
- `docs/contracts/data-model.md` — раздел `auth`.

## Что сделать
1. **`pkg/platform`:**
   - конфиг из переменных окружения;
   - `slog` в JSON с `request_id` (берётся из `X-Request-Id` или генерируется);
   - пул pgx;
   - миграции goose из `embed.FS`, применяются при старте;
   - HTTP-серверы 8080 и 8081 с graceful shutdown;
   - middleware личности: читает `X-User-*` в `Identity{UserID, Role, FacultyID}` в контексте; хелперы `RequireStudent`, `RequireStaffOrAdmin` (→ 403);
   - хелперы ошибок в формате `Error` из контрактов (`validation_failed` с `details.fields` и т.д.);
   - JSON 404 для неизвестных путей; recover от паник → 500 без подробностей.
2. **Сервис `auth`:**
   - миграции `users`, `sessions`, `login_attempts`;
   - `POST /login`:
     - bcrypt (cost 12);
     - лимиты: 5 неудач на логин и 30 на IP за 15 минут → 429 с `Retry-After`;
     - одинаковая ошибка при неверном логине и неверном пароле;
     - токен — 32 байта `crypto/rand`, в БД — SHA-256 от него;
     - cookie `sid`: `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400`;
   - `POST /logout` — всегда 204;
   - `GET /me`;
   - `GET /internal/verify` на 8081: 204 + заголовки или 401; просроченные сессии удаляет; обновляет `last_seen_at`.
3. Журнал событий безопасности (`event=login_success|login_failed|login_locked|logout`) — только ID и IP, **без логина и пароля** в открытом виде.
4. `cmd/hashpw` — печатает bcrypt-хеш пароля, введённого со stdin (для T07).
4a. **`pkg/platform/platformtest`** — помощники для тестов участников (T04, T06):
   - `NewDB(t, migrations fs.FS) *pgxpool.Pool` — создаёт отдельную базу на тест из `TEST_DATABASE_URL`, применяет миграции и удаляет базу после теста; без переменной — `t.Skip`, а при `REQUIRE_DB_TESTS=1` — `t.Fatal`;
   - `NewNATS(t)` — встроенный NATS с JetStream;
   - `AsStudent(id)`, `AsStaff(id, faculty)`, `AsAdmin(id)` — заголовки личности для `httptest`;
   - `DecodeError(t, resp)` — разбор `Error`.

   В CI задать `TEST_DATABASE_URL` (service-контейнер Postgres) и `REQUIRE_DB_TESTS=1`.
5. `services/auth/README.md` — **«Как сделать сервис по образцу»**: структура каталогов, где миграции и запросы sqlc, как подключить сгенерированный strict-server, где middleware, как писать табличные тесты. Этот файл получают субагенты в T04–T06.

## Контракты
Предоставляет: `docs/contracts/auth.yaml`, `docs/contracts/internal/auth.yaml`.

## Зависимости
T01.

## Критерии готовности
- [ ] Табличные тесты:
  - вход верный / неверный пароль / неизвестный логин (одинаковый ответ);
  - блокировка после 5 неудач;
  - verify: валидная / истёкшая / отсутствующая сессия;
  - атрибуты cookie;
  - в БД нет сырого токена.
- [ ] Через шлюз: вход тестовым пользователем → cookie → `GET /api/auth/me` 200 → `POST /api/auth/logout` → `GET /api/auth/me` 401.
- [ ] В логах при неудачном входе нет пароля.
- [ ] `services/auth/README.md` написан **для агента, который не видел проекта**: пошаговый рецепт нового сервиса, пример хендлера, пример табличного теста с `platformtest`, список запретов из `AGENTS.md`.
- [ ] Тесты `auth` сами используют `platformtest` (образец для участников); в CI выполняются, без `TEST_DATABASE_URL` локально — пропускаются.
- [ ] `make test` и CI зелёные.

## Что не входит
Смена пароля и регистрация (их нет: аккаунты демонстрационные, общие для всего жюри). Тестовые пользователи — в T07.

## Оценка
1 день.
