# Цифровой деканат будущего — концепт личного кабинета студента МГИМО

> **Это концепт для конкурса «Цифровой деканат будущего», а не официальный сервис МГИМО.** Все данные вымышлены, совпадения с реальными людьми случайны. Официальная символика МГИМО не используется.

Личный кабинет студента: расписание с заметными переносами, успеваемость со «светофором», заявки и справки онлайн со статусом, уведомления и дедлайны, связь с деканатом; кабинет сотрудника деканата.

## Архитектура в двух словах
Микросервисы на Go (`auth`, `academic`, `requests`, `notifications`) за шлюзом Caddy, PostgreSQL (своя база у каждого сервиса), NATS JetStream для событий, фронтенд — React + TypeScript (PWA). Стыки между частями — OpenAPI-контракты, код по ним генерируется. Подробно — [`docs/architecture.md`](docs/architecture.md), безопасность — [`docs/security.md`](docs/security.md).

## Запуск локально
Нужны Docker и Git Bash (на Windows), Go 1.26 — для разработки.

```bash
cp .env.example .env      # заполнить пароли: openssl rand -hex 24
make up                   # или: docker compose -f deploy/docker-compose.yml --env-file .env up -d --build
```

Кабинет — https://localhost (локальный сертификат Caddy, браузер попросит подтвердить).

На Windows `make` ставится так: `winget install ezwinports.make` (или `scoop install make`).

## Команды

| Команда | Что делает |
|---|---|
| `make gen` | Генерация кода из контрактов (`docs/contracts`) и SQL |
| `make lint-contracts` | Проверка контрактов линтером OpenAPI |
| `make test` | Go-тесты (тесты с БД — при заданном `TEST_DATABASE_URL`) |
| `make up` / `make down` / `make logs` | Запуск, остановка, логи |
| `make seed` | Тестовые данные |
| `make e2e` | e2e-сценарий жюри на 360 px |

## Документация
Начните с [`docs/progress.md`](docs/progress.md) и [`docs/plan.md`](docs/plan.md). Правила для ИИ-агентов — [`AGENTS.md`](AGENTS.md) (Claude Code читает его через [`CLAUDE.md`](CLAUDE.md)). Как работать с задачей — [`docs/tasks/README.md`](docs/tasks/README.md).
