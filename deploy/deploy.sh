#!/usr/bin/env bash
# Выкладка на сервер — только по тегу (T23): bash deploy/deploy.sh v1.0.0
# Сборка, запуск, тестовые данные (seed.sh применяет каждый файл один раз — повтор безопасен), проверка прода.
set -euo pipefail
cd "$(dirname "$0")/.."
tag=${1:?Укажите тег: bash deploy/deploy.sh v1.0.0}
[ -f .env ] || { echo "Нет .env: bash deploy/gen-env.sh <домен>"; exit 1; }
[ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "В рабочей копии есть изменения — выкладка только из чистого тега"; exit 1; }

git fetch --tags --quiet
git -c advice.detachedHead=false checkout --quiet "refs/tags/$tag"
echo "Выкладываю $tag ($(git rev-parse --short HEAD))"

compose=(docker compose -f deploy/docker-compose.yml --env-file .env)
"${compose[@]}" up -d --build --wait --wait-timeout 300
bash deploy/seed.sh

site=$(grep '^SITE_ADDRESS=' .env | cut -d= -f2)
BASE="https://$site" bash deploy/prod-check.sh
echo "Готово: https://$site — $tag"
