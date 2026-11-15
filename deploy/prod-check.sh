#!/usr/bin/env bash
# Проверка прода снаружи — только чтение, ничего не меняет (в отличие от smoke.sh, который подменяет сервисы).
# Запуск: BASE=https://lk.example.ru bash deploy/prod-check.sh
set -uo pipefail
BASE=${BASE:?Укажите BASE=https://домен}
fail=0
check() { if [ "$2" = "$3" ]; then echo "ok   $1"; else echo "FAIL $1: ждали [$2], получили [$3]"; fail=1; fi; }
k=${INSECURE:+-k} # INSECURE=1 — для локального стенда с самоподписанным сертификатом
code() { curl -s $k -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }
headers=$(curl -sI $k --max-time 15 "$BASE/")

check "главная открывается по HTTPS" 200 "$(code "$BASE/")"
check "HTTP переводит на HTTPS" 308 "$(code "http://${BASE#https://}/")"
for h in strict-transport-security content-security-policy x-content-type-options referrer-policy; do
  check "заголовок $h" 1 "$(grep -ci "^$h:" <<<"$headers")"
done
check "заголовок Server скрыт" 0 "$(grep -ci '^server:' <<<"$headers")"
check "без входа API отвечает 401" 401 "$(code "$BASE/api/auth/me")"
check "поддельные X-User-* без входа — 401" 401 "$(code -H 'X-User-Id: 30000000-0000-4000-8000-000000000001' -H 'X-User-Role: admin' "$BASE/api/academic/me/profile")"
check "внутренний API снаружи закрыт" 404 "$(code "$BASE/api/auth/internal/verify")"
check "проверка справки открыта без входа" 404 "$(code "$BASE/api/requests/public/certificates/AAAAAAAAAA")"
check "страница проверки справки" 200 "$(code "$BASE/verify")"
check "манифест приложения" 200 "$(code "$BASE/manifest.webmanifest")"

[ $fail = 0 ] && echo "Прод в порядке" || echo "ЕСТЬ ОШИБКИ"
exit $fail
