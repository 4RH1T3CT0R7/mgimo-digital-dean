# Сервис `auth` — эталон. Как сделать сервис по образцу

Этот файл для агента, который делает новый сервис (`academic`, `notifications`, `requests`). **Повторяй структуру и приёмы `auth` один в один.** Общие правила — `AGENTS.md`, как работать с задачей — `docs/tasks/README.md`.

## 1. Структура

```
services/<svc>/
  cmd/main.go                 # только сборка зависимостей: БД, миграции, app.New, platform.Run. time.Now — только здесь
  migrations/
    00001_init.sql            # goose: -- +goose Up / -- +goose Down
    embed.go                  # //go:embed *.sql → var FS embed.FS
  queries/<svc>.sql           # SQL для sqlc: -- name: Имя :one|:many|:exec, параметры только через sqlc.arg/sqlc.narg
  sqlc.yaml                   # скопируй из services/auth/sqlc.yaml без изменений
  internal/
    api/                      # СГЕНЕРИРОВАНО из docs/contracts/<svc>.yaml — не редактировать
    internalapi/              # СГЕНЕРИРОВАНО из docs/contracts/internal/<svc>.yaml (если есть) — не редактировать
    db/                       # СГЕНЕРИРОВАНО sqlc — не редактировать
    app/
      app.go                  # type Server: реализует StrictServerInterface; New(...); Handlers()
      app_test.go             # тесты через HTTP на отдельной тестовой БД
  seed/                       # тестовые данные (seed.md)
```

Генерация: `make gen` (или по частям: `go generate ./services/<svc>/...` и sqlc через Docker — см. `Makefile`, цель `gen-sqlc`). После генерации — `git diff` без изменений в сгенерированных файлах, которые ты не трогал.

## 2. Server и обработчики

```go
type Server struct {
	q   *db.Queries
	log *slog.Logger
	now func() time.Time // в тестах фиксированное время
}

func (s *Server) Handlers() (public, internal http.Handler) {
	strict := api.StrictHTTPServerOptions{
		RequestErrorHandlerFunc:  platform.RequestErrorHandler,  // ошибка разбора запроса → 400
		ResponseErrorHandlerFunc: platform.ResponseErrorHandler, // ошибка из хендлера → формат Error
	}
	pub := api.HandlerWithOptions(api.NewStrictHandlerWithOptions(s, nil, strict), api.StdHTTPServerOptions{
		BaseRouter:       platform.NewMux(), // /healthz и JSON-404
		ErrorHandlerFunc: platform.RequestErrorHandler,
	})
	// internal — так же из internalapi; если внутреннего API нет — platform.NewMux()
	return platform.Middleware(s.log, pub), platform.Middleware(s.log, in)
}
```

Хендлер возвращает **либо сгенерированный ответ успеха, либо ошибку `platform.*`**. Ответы-ошибки из сгенерированного кода (`GetMe401JSONResponse` и т.п.) не используй — так все сервисы отвечают одинаково:

```go
func (s *Server) GetMyProfile(ctx context.Context, _ api.GetMyProfileRequestObject) (api.GetMyProfileResponseObject, error) {
	me, err := platform.RequireStudent(ctx) // 401 без личности, 403 если не студент
	if err != nil {
		return nil, err
	}
	row, err := s.q.GetStudent(ctx, me.UserID) // ID — ТОЛЬКО из личности, никогда из URL/тела
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, platform.NotFound()
	}
	if err != nil {
		return nil, err // станет 500 без подробностей наружу, подробности — в лог
	}
	return api.GetMyProfile200JSONResponse(toProfile(row)), nil
}
```

| Ошибка | Когда |
|---|---|
| `platform.Unauthenticated()` | нет личности (401) |
| `platform.Forbidden()` | роль не подходит (403) |
| `platform.NotFound()` | нет объекта **или он чужой** (404) |
| `platform.Validation(map[string]string{"поле": "текст"})` | неверные данные (400, `details.fields`) |
| `platform.Conflict("invalid_transition", "текст")` | действие невозможно в текущем состоянии (409) |
| `platform.TooManyAttempts(секунды)` | лимит (429 + `Retry-After`) |

Если сгенерированный ответ не позволяет сделать то, что требует контракт (как с необязательным заголовком `X-Faculty-Id`), — сделай свой тип с методом `Visit…Response(w)`, как `verified` в `app.go`, и напиши комментарий почему.

## 3. Права доступа (security.md §3)

- `/me/*` → `platform.RequireStudent(ctx)`; в SQL **всегда** фильтр `WHERE student_id = sqlc.arg(student_id)` с ID из личности.
- `/staff/*` → `platform.RequireStaffOrAdmin(ctx)`; фильтр по факультету — `id.FacultyScope()`: для `staff` это его факультет, для `admin` — `nil` (все). В SQL: `AND (sqlc.narg(faculty_id)::uuid IS NULL OR faculty_id = sqlc.narg(faculty_id))`.
- Чужое → `platform.NotFound()`, не `Forbidden()`.
- Исходный запрос (cookie, IP), если нужен: `platform.RequestFrom(ctx)`, `platform.ClientIP(r)`.

## 4. Логи

- Логгер запроса: `platform.Log(ctx)` — в нём уже `request_id` и `user_id`.
- В лог — только ID и типы событий. **Никаких ФИО, логинов, паролей, текстов сообщений.** Тест `TestLogsContainNeitherPasswordNorLogin` — образец такой проверки.

## 5. Тесты (образец — `internal/app/app_test.go`)

```go
pool := platformtest.NewDB(t, migrations.FS) // отдельная база на тест, миграции применены
clock := time.Date(2026, 11, 18, 10, 0, 0, 0, msk)
srv := app.New(pool, logger, func() time.Time { return clock })
pub, _ := srv.Handlers()

r := httptest.NewRequest(http.MethodGet, "/me/profile", nil)
platformtest.As(r, platformtest.Student(studentID)) // как это делает шлюз
w := httptest.NewRecorder()
pub.ServeHTTP(w, r)
e := platformtest.DecodeError(t, w.Body.Bytes()) // для ответов-ошибок
```

- Тестируй **через HTTP** (хендлер целиком), а чистые правила (шкала, светофор, переходы статусов) — отдельными табличными тестами без БД.
- Данные для теста создаёт сам тест (вставки через `db.Queries` или SQL), на seed не опирается.
- Запуск локально с базой: поднять PostgreSQL (`make up` или `docker run -d -p 55432:5432 -e POSTGRES_PASSWORD=postgres postgres:17-alpine`) и
  `TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/postgres?sslmode=disable go test ./services/<svc>/...`
- Без `TEST_DATABASE_URL` тесты с БД пропускаются; в CI они обязательны (`REQUIRE_DB_TESTS=1`).
- События: `platformtest.NewNATS(t)` — встроенный NATS с JetStream (см. `pkg/events`).

## 6. Нельзя

- Писать руками типы запросов/ответов — только сгенерированные `api.*`.
- Редактировать `internal/api`, `internal/internalapi`, `internal/db`, `pkg/clients`, контракты.
- Ходить в чужую БД или импортировать `services/<другой>/...`. Чужие данные — через `pkg/clients/<svc>` или события `pkg/events`.
- Вызывать `time.Now()` в логике.
- Добавлять зависимости, которых нет в `docs/architecture.md` §7.

## 7. Как устроен сам `auth`

| Что | Где |
|---|---|
| Вход: лимиты (5 неудач на логин, 30 на IP за 15 минут) → bcrypt (с хешем-пустышкой для неизвестного логина) → сессия | `Login` |
| Сессия: 32 случайных байта в cookie `sid` (`HttpOnly; Secure; SameSite=Lax`, 24 ч), в БД — SHA-256 | `newToken`, `hashToken`, `sessionCookie` |
| Проверка сессии для шлюза: 204 + `X-User-Id`, `X-User-Role`, `X-Faculty-Id` (только у сотрудника) | `VerifySession`, тип `verified` |
| Хеш пароля для тестовых данных | `go run ./cmd/hashpw` (пароль — через stdin) |
