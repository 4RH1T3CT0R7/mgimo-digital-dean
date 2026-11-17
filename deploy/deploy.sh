#!/usr/bin/env bash
# Выкладка на сервер (T23, D67): bash deploy/deploy.sh <тег или коммит из main>
#   вручную — по тегу: bash deploy/deploy.sh v1.0.0
#   автоматически — по коммиту main после зелёного CI: .github/workflows/deploy.yml
# Сборка, запуск, тестовые данные (seed.sh применяет каждый файл один раз — повтор безопасен), проверка прода.
# Тело — в функции: bash читает её целиком до запуска, поэтому checkout новой версии этого же файла
# посреди выкладки её не ломает.
set -euo pipefail

main() {
  cd "$(dirname "$0")/.."
  local ref=${1:?Укажите тег или коммит: bash deploy/deploy.sh v1.0.0}
  [ -f .env ] || { echo "Нет .env: bash deploy/gen-env.sh <домен>"; exit 1; }
  [ -z "$(git status --porcelain --untracked-files=no)" ] || { echo "В рабочей копии есть изменения — выкладка только из чистого репозитория"; exit 1; }

  # Две выкладки одновременно не идут
  exec 9>"${TMPDIR:-/tmp}/mgimo-deploy.lock"
  flock -n 9 || { echo "Уже идёт другая выкладка"; exit 1; }

  git fetch --quiet --tags origin
  git fetch --quiet origin main
  local commit
  if commit=$(git rev-parse --verify --quiet "refs/tags/$ref^{commit}"); then
    :
  elif commit=$(git rev-parse --verify --quiet "$ref^{commit}") && git merge-base --is-ancestor "$commit" origin/main; then
    : # коммит — только из main: ветки на прод не попадают
  else
    echo "Нет тега $ref и такого коммита в main"
    exit 1
  fi
  git -c advice.detachedHead=false checkout --quiet "$commit"
  echo "Выкладываю $ref ($(git rev-parse --short HEAD))"

  local compose=(docker compose -f deploy/docker-compose.yml --env-file .env)
  "${compose[@]}" up -d --build --wait --wait-timeout 300
  bash deploy/seed.sh
  # Кэш сборки растёт с каждой выкладкой: оставляем последние 5 ГБ, чтобы не кончился диск
  docker builder prune -f --keep-storage 5gb >/dev/null || true

  local site
  site=$(grep '^SITE_ADDRESS=' .env | cut -d= -f2)
  BASE="https://$site" bash deploy/prod-check.sh
  echo "Готово: https://$site — $ref"
}

main "$@"
