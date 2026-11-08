# T01. Каркас репозитория и инфраструктура

**Исполнитель:** Капитан (Claude Code) · **Приоритет:** P0 · **Веха:** M0

## Цель
Основа, на которой работают все остальные задачи: одна команда поднимает систему, код генерируется из контрактов, CI ловит расхождения. Критерии: К3 (прототип запускается и работает), К2 (структура проекта для агентов).

## Контекст
- `AGENTS.md` — правила и владение каталогами.
- `docs/architecture.md` §2–7 — сервисы, шлюз, данные, контракты, структура, технологии.
- `docs/contracts/README.md` — порты 8080/8081, префиксы, формат ошибок.
- `docs/security.md` §3–4 — заголовки безопасности, изоляция сети.

## Что сделать
1. `go.mod` (модуль `github.com/4RH1T3CT0R7/mgimo-digital-dean`, Go 1.25). Инструменты — через `tool`-директивы (`go get -tool …`): oapi-codegen v2, goose.
2. Каталоги по `architecture.md` §6. У каждого из 4 сервисов `cmd/main.go` с `/healthz` на 8080 и 8081 — заглушки до своих задач.
3. Кодогенерация:
   - oapi-codegen: для каждого `docs/contracts/<svc>.yaml` — strict-server на `net/http` + модели → `services/<svc>/internal/api`; для `internal/<svc>.yaml` — сервер в `services/<svc>/internal/internalapi` и клиент в `pkg/clients/<svc>`;
   - sqlc — конфиг на сервис, запуск через Docker-образ `sqlc/sqlc` (на Windows у sqlc проблемы с cgo).
4. `Makefile`:
   - `gen`, `lint-contracts` (redocly, команда из `contracts/README.md`), `test`, `up`, `down`, `logs`, `seed`, `e2e`, `lint`;
   - в README написать, как поставить `make` на Windows (`winget install ezwinports.make` или scoop).
5. `Dockerfile` — один на все Go-сервисы: `ARG SERVICE`, multi-stage, итоговый образ distroless/static, непривилегированный пользователь.
6. `deploy/docker-compose.yml`:
   - `postgres:17` с томом и `postgres/init.sql`: 4 базы и 4 пользователя, пароли из `.env`;
   - `nats:2` с `-js` и томом;
   - 4 сервиса: порты наружу **не публикуются**;
   - `caddy:2`: 80/443, том данных, `Caddyfile`;
   - healthcheck и `restart: unless-stopped` у всех.
7. `deploy/Caddyfile`:
   - удалить из входящего запроса `X-User-Id`, `X-User-Role`, `X-Faculty-Id`;
   - без проверки сессии: `POST /api/auth/login`, `POST /api/auth/logout`, `/api/requests/public/*`, статика SPA (`try_files` → `index.html`);
   - всё остальное `/api/*` — через `forward_auth auth:8081 { uri /internal/verify; copy_headers X-User-Id X-User-Role X-Faculty-Id }`;
   - `handle_path /api/<svc>/*` → `<svc>:8080`; **порт 8081 не проксируется никогда**;
   - заголовки: HSTS, `Content-Security-Policy: default-src 'self'; img-src 'self' data:; frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: same-origin`;
   - домен из переменной окружения; локально — `localhost` с внутренним сертификатом Caddy.
8. `.env.example` (все переменные с пустыми значениями и комментариями); `.env` в `.gitignore`.
9. `.github/workflows/ci.yml`:
   - `contracts`: redocly lint;
   - `go`: `make gen` + `git diff --exit-code`, `go vet`, `go test ./...`, `govulncheck ./...`;
   - джоб фронтенда добавит T08.
10. Корневой `README.md`: что это за проект (концепт, данные вымышлены), как запустить, ссылки на `docs/`.

## Контракты
Используются все файлы `docs/contracts/*.yaml` — только для генерации; бизнес-логики здесь нет.

## Зависимости
Нет.

## Критерии готовности
- [ ] `make up` поднимает все контейнеры, все в статусе healthy.
- [ ] `make gen` генерирует код без ошибок; повторный запуск не даёт изменений в git.
- [ ] `make lint-contracts` — 0 ошибок.
- [ ] `curl -k https://localhost/api/academic/me/profile` без cookie → **401** от шлюза.
- [ ] Тот же запрос с заголовком `X-User-Id: <любой>` → всё равно **401**.
- [ ] `curl -k https://localhost/api/academic/internal/students/x` → **не** доходит до порта 8081 (401 или 404, но не ответ внутреннего API).
- [ ] `docker compose ps`: у сервисов нет опубликованных портов, кроме Caddy.
- [ ] CI зелёный на PR.

## Что не входит
Бизнес-логика сервисов (T02–T06), фронтенд (T08), деплой на VPS (T23), тестовые данные (T07).

## Оценка
1–1,5 дня.
