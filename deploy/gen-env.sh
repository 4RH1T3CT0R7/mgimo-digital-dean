#!/usr/bin/env bash
# Создаёт .env для сервера из .env.example: случайные пароли БД, адрес сайта. Права 600, в git не попадает.
# Запуск: bash deploy/gen-env.sh lk.example.ru
set -euo pipefail
cd "$(dirname "$0")/.."
domain=${1:?Укажите домен: bash deploy/gen-env.sh lk.example.ru}
[ -e .env ] && { echo ".env уже есть — не перезаписываю. Удалите его вручную, если нужно создать заново."; exit 1; }

rnd() { tr -dc 'A-Za-z0-9' </dev/urandom | head -c 32; }
umask 077
sed -e "s|^SITE_ADDRESS=.*|SITE_ADDRESS=$domain|" \
    -e "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(rnd)|" \
    -e "s|^AUTH_DB_PASSWORD=.*|AUTH_DB_PASSWORD=$(rnd)|" \
    -e "s|^ACADEMIC_DB_PASSWORD=.*|ACADEMIC_DB_PASSWORD=$(rnd)|" \
    -e "s|^REQUESTS_DB_PASSWORD=.*|REQUESTS_DB_PASSWORD=$(rnd)|" \
    -e "s|^NOTIFICATIONS_DB_PASSWORD=.*|NOTIFICATIONS_DB_PASSWORD=$(rnd)|" \
    .env.example > .env
chmod 600 .env
echo ".env создан (права 600). Ключ LLM, если нужен ИИ-помощник с моделью, впишите в LLM_* вручную (D49)."
