#!/bin/sh
# Создаёт базу и пользователя для каждого сервиса (D27): сервис физически не видит чужие таблицы.
# Выполняется один раз — при первом запуске пустого тома PostgreSQL.
set -eu

for svc in auth academic requests notifications; do
  var="$(echo "$svc" | tr '[:lower:]' '[:upper:]')_DB_PASSWORD"
  eval "pw=\${$var:-}"
  if [ -z "$pw" ]; then
    echo "Не задан $var" >&2
    exit 1
  fi
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    -v svc="$svc" -v pw="$pw" <<'SQL'
CREATE ROLE :"svc" LOGIN PASSWORD :'pw';
CREATE DATABASE :"svc" OWNER :"svc";
REVOKE ALL ON DATABASE :"svc" FROM PUBLIC;
SQL
done
