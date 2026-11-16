#!/usr/bin/env bash
# Ежедневная резервная копия всех баз (T23): /var/backups/mgimo/<дата>/<база>.dump, хранится 7 дней.
# cron (crontab -e под пользователем deploy):  15 3 * * *  bash /home/deploy/mgimo/deploy/backup.sh >> /var/backups/mgimo/backup.log 2>&1
set -euo pipefail
cd "$(dirname "$0")/.."
dir=${BACKUP_DIR:-/var/backups/mgimo}/$(date +%F)
compose=(docker compose -f deploy/docker-compose.yml --env-file .env)
umask 077
mkdir -p "$dir"
for db in auth academic requests notifications assistant; do
  "${compose[@]}" exec -T postgres pg_dump -U postgres -Fc "$db" > "$dir/$db.dump"
  [ -s "$dir/$db.dump" ] || { echo "$(date -Is) пустой дамп $db"; exit 1; }
done
find "$(dirname "$dir")" -mindepth 1 -maxdepth 1 -type d -mtime +7 -exec rm -rf {} +
echo "$(date -Is) копия: $dir ($(du -sh "$dir" | cut -f1))"
