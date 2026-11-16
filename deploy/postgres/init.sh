#!/bin/sh
# Создаёт базу и пользователя для каждого сервиса (D27): сервис физически не видит чужие таблицы.
# Сам выполняется при первом запуске пустого тома PostgreSQL. Повторный запуск безопасен: роль и базу
# создаёт, только если их нет, — так на существующем томе добавляется новый сервис (docs/deploy.md §8).
set -eu

for svc in auth academic requests notifications assistant; do
  var="$(echo "$svc" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
  eval "pw=\${$var:-}"
  if [ -z "$pw" ]; then
    echo "Не задан $var" >&2
    exit 1
  fi
  psql -v ON_ERROR_STOP=1 --username "${POSTGRES_USER:-postgres}" --dbname postgres \
    -v svc="$svc" -v pw="$pw" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'svc', :'pw')
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = :'svc') \gexec
SELECT format('CREATE DATABASE %I OWNER %I', :'svc', :'svc')
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = :'svc') \gexec
REVOKE ALL ON DATABASE :"svc" FROM PUBLIC;
SQL
done
