#!/usr/bin/env bash
# Проверка, что резервная копия восстанавливается (T23): поднимает отдельный временный Postgres,
# восстанавливает в него все дампы за дату и считает строки в ключевых таблицах. Рабочие базы не трогает.
# Запуск: bash deploy/restore-check.sh [/var/backups/mgimo/2026-11-20]
set -euo pipefail
dir=${1:-$(ls -d "${BACKUP_DIR:-/var/backups/mgimo}"/*/ | sort | tail -1)}
name=mgimo-restore-check
docker rm -f "$name" >/dev/null 2>&1 || true
docker run -d --name "$name" -e POSTGRES_PASSWORD=check postgres:17-alpine >/dev/null
trap 'docker rm -f "$name" >/dev/null' EXIT
for i in $(seq 1 30); do docker exec "$name" pg_isready -U postgres >/dev/null 2>&1 && break; sleep 1; done

q() { docker exec -i "$name" psql -U postgres -v ON_ERROR_STOP=1 -qtA "$@"; }
for db in auth academic requests notifications; do
  q -c "CREATE DATABASE $db" >/dev/null
  docker exec -i "$name" pg_restore -U postgres -d "$db" --no-owner --no-privileges < "$dir/$db.dump"
done
echo "Восстановлено из $dir:"
echo "  пользователей: $(q -d auth -c 'SELECT count(*) FROM users')"
echo "  студентов:     $(q -d academic -c 'SELECT count(*) FROM students')"
echo "  занятий:       $(q -d academic -c 'SELECT count(*) FROM lessons')"
echo "  заявок:        $(q -d requests -c 'SELECT count(*) FROM applications')"
echo "  уведомлений:   $(q -d notifications -c 'SELECT count(*) FROM notifications')"
