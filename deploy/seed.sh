#!/usr/bin/env bash
# Тестовые данные всех сервисов (docs/contracts/seed.md): services/<svc>/seed/*.sql по порядку имён.
# Seed идемпотентен (ON CONFLICT DO NOTHING), повторный запуск ничего не ломает.
# Запускать после старта сервисов: таблицы создают их миграции.
set -euo pipefail
cd "$(dirname "$0")/.."

compose=(docker compose -f deploy/docker-compose.yml --env-file .env)

for svc in auth academic requests notifications; do
  for f in services/"$svc"/seed/*.sql; do
    [ -f "$f" ] || continue
    echo "seed: $f"
    "${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d "$svc" < "$f"
  done
done

# Уведомления о переносах и заявках из тестовых данных создаёт сам notifications
# по штатным событиям — команда cmd/seedevents (T07) подключится сюда, когда будут seed всех сервисов.
echo "seed: готово"
