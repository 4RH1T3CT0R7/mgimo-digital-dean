#!/usr/bin/env bash
# Тестовые данные всех сервисов (docs/contracts/seed.md): services/<svc>/seed/*.sql по порядку имён.
# Каждый файл применяется ровно один раз: отметка в служебной таблице _seed_applied ставится в той же
# транзакции, что и сам seed. Поэтому повторный запуск безопасен, даже если SQL в файле не идемпотентен.
# Запускать после старта сервисов: таблицы создают их миграции.
set -euo pipefail
cd "$(dirname "$0")/.."
export MSYS_NO_PATHCONV=1 # Git Bash на Windows не должен переписывать пути вида /app

compose=(docker compose -f deploy/docker-compose.yml --env-file .env)
psql_db() { "${compose[@]}" exec -T -e PGOPTIONS="-c client_min_messages=warning" postgres psql -v ON_ERROR_STOP=1 -q -U postgres -d "$1" "${@:2}"; }

for svc in auth academic requests notifications assistant; do
  psql_db "$svc" -c "CREATE TABLE IF NOT EXISTS _seed_applied (file text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())"
  for f in services/"$svc"/seed/*.sql; do
    [ -f "$f" ] || continue
    if [ "$(psql_db "$svc" -tAc "SELECT 1 FROM _seed_applied WHERE file = '$(basename "$f")'")" = 1 ]; then
      echo "seed: $f — уже применён"
      continue
    fi
    echo "seed: $f"
    { cat "$f"; printf "\nINSERT INTO _seed_applied (file) VALUES ('%s');\n" "$(basename "$f")"; } |
      psql_db "$svc" --single-transaction
  done
done

# Уведомления о заявках и переносах из тестовых данных создаёт сам notifications по штатным событиям (T07):
# сервисы публикуют их флагом -seed-events. ID событий детерминированы — повторный запуск не плодит уведомления.
# Сервисы, у которых есть флаг -seed-events.
for svc in requests academic; do
  echo "seed-events: $svc"
  "${compose[@]}" exec -T "$svc" /app -seed-events
done
echo "seed: готово"
