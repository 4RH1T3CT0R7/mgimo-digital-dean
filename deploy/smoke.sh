#!/usr/bin/env bash
# Smoke-проверка шлюза и изоляции (security.md §3, §6). Запуск: после `make up` (и в CI).
# Создаёт временных пользователей и на время подменяет academic эхо-сервером; в конце всё возвращает.
set -uo pipefail
cd "$(dirname "$0")/.."

compose=(docker compose -f deploy/docker-compose.yml --env-file .env)
BASE=${BASE:-https://localhost}
fail=0

check() { # имя ожидаемое фактическое
  if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: ждали [$2], получили [$3]"; fail=1; fi
}
code() { curl -sk -o /dev/null -w '%{http_code}' "$@"; }
psql_auth() { "${compose[@]}" exec -T postgres psql -U postgres -d auth -qtAc "$1"; }

# 1. Наружу открыт только Caddy
published=$("${compose[@]}" ps --format '{{.Service}} {{.Publishers}}' | awk '$1 != "caddy" && /0\.0\.0\.0|\[::\]:/ {print $1}')
check "наружу опубликованы только порты caddy" "" "$published"

# 2–3. Без сессии и с поддельными заголовками — 401
forged=(-H "X-User-Id: 30000000-0000-4000-8000-000000000001" -H "X-User-Role: admin" -H "X-Faculty-Id: 10000000-0000-4000-8000-000000000001")
for svc in auth academic requests notifications assistant; do
  check "$svc: без сессии → 401" 401 "$(code "$BASE/api/$svc/me")"
  check "$svc: поддельные X-User-* без сессии → 401" 401 "$(code "${forged[@]}" "$BASE/api/$svc/me")"
  # 4. Внутренний API снаружи недоступен
  check "$svc: /internal через шлюз → 404" 404 "$(code "$BASE/api/$svc/internal/x")"
done

# 5. Заголовки безопасности — на обычных ответах и на ошибках
for path in / /api/academic/me /api/nope; do
  n=$(curl -sk -o /dev/null -D - "$BASE$path" | grep -ciE '^(strict-transport-security|content-security-policy|x-content-type-options|referrer-policy):')
  check "заголовки безопасности на $path" 4 "$n"
  check "заголовок Server скрыт на $path" 0 "$(curl -sk -o /dev/null -D - "$BASE$path" | grep -ci '^server:')"
done

# 6. HTTP → HTTPS
check "http → https" 308 "$(code "${BASE/https:/http:}/")"

# 7. CSRF: вход простой формой (text/plain) не принимается
check "вход с Content-Type text/plain → 415" 415 \
  "$(code -H 'Content-Type: text/plain' -d '{"login":"x","password":"y"}' "$BASE/api/auth/login")"

# 8. Изоляция БД: сервис не подключается к чужой базе
pw=$(grep '^ACADEMIC_DB_PASSWORD=' .env | cut -d= -f2)
out=$("${compose[@]}" exec -T -e PGPASSWORD="$pw" postgres psql -h 127.0.0.1 -U academic -d auth -c 'select 1' 2>&1)
check "пользователь academic не подключается к базе auth" 1 "$(echo "$out" | grep -c 'CONNECT privilege')"

# 9. Что реально получает сервис: academic временно подменяется эхо-сервером
S_ID=30000000-0000-4000-8000-0000000000fa
T_ID=40000000-0000-4000-8000-0000000000fa
T_FAC=10000000-0000-4000-8000-000000000002
S_PW="Smoke-S-$RANDOM$RANDOM"
T_PW="Smoke-T-$RANDOM$RANDOM"
cleanup() {
  docker rm -f smoke-echo >/dev/null 2>&1
  "${compose[@]}" start academic >/dev/null 2>&1
  psql_auth "DELETE FROM users WHERE login IN ('smoke.s','smoke.t')" >/dev/null
}
trap cleanup EXIT

S_HASH=$(printf '%s\n' "$S_PW" | go run ./cmd/hashpw)
T_HASH=$(printf '%s\n' "$T_PW" | go run ./cmd/hashpw)
psql_auth "DELETE FROM users WHERE login IN ('smoke.s','smoke.t');
  INSERT INTO users (id, login, password_hash, role, display_name, faculty_id) VALUES
  ('$S_ID','smoke.s','$S_HASH','student','Smoke',NULL), ('$T_ID','smoke.t','$T_HASH','staff','Smoke','$T_FAC');" >/dev/null

"${compose[@]}" stop academic >/dev/null 2>&1
net=$(docker network ls --format '{{.Name}}' | grep -m1 '^mgimo_default$')
docker run -d --rm --name smoke-echo --network "$net" --network-alias academic caddy:2-alpine sh -c \
  'printf ":8080 {\n\trespond \"id=[{header.X-User-Id}] role=[{header.X-User-Role}] fac=[{header.X-Faculty-Id}]\"\n}\n" > /tmp/C && caddy run --config /tmp/C --adapter caddyfile' >/dev/null
for _ in $(seq 1 20); do
  docker exec smoke-echo wget -q -O /dev/null http://127.0.0.1:8080/ 2>/dev/null && break
  sleep 0.5
done

login() { # логин пароль файл-cookie
  curl -sk -c "$3" -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' \
    -d "{\"login\":\"$1\",\"password\":\"$2\"}" "$BASE/api/auth/login"
}
jar_s=$(mktemp)
jar_t=$(mktemp)
check "вход временного студента" 200 "$(login smoke.s "$S_PW" "$jar_s")"
check "вход временного сотрудника" 200 "$(login smoke.t "$T_PW" "$jar_t")"
check "студент с поддельными заголовками: сервис видит его настоящую личность" \
  "id=[$S_ID] role=[student] fac=[]" "$(curl -sk -b "$jar_s" "${forged[@]}" "$BASE/api/academic/me/profile")"
check "сотрудник с поддельными заголовками: сервис видит его факультет" \
  "id=[$T_ID] role=[staff] fac=[$T_FAC]" "$(curl -sk -b "$jar_t" "${forged[@]}" "$BASE/api/academic/me/profile")"
rm -f "$jar_s" "$jar_t"

if [ "$fail" -ne 0 ]; then
  echo "SMOKE: ЕСТЬ ОШИБКИ"
  exit 1
fi
echo "SMOKE: всё в порядке"
