#!/usr/bin/env bash
# Новые случайные пароли тестовых аккаунтов на сервере (seed.md: в репозитории — только хеши локальных паролей).
# bcrypt cost 12 считает сам Postgres (pgcrypto, формат $2a$ — его принимает auth).
# Пароли пишутся в файл с правами 600 и на экран не выводятся. Запуск: bash deploy/set-demo-passwords.sh [файл]
set -euo pipefail
cd "$(dirname "$0")/.."
out=${1:-$HOME/demo-accounts.txt}
accounts=(student.mo student.meo dekanat.mo dekanat.meo admin)
compose=(docker compose -f deploy/docker-compose.yml --env-file .env)
psql_auth() { "${compose[@]}" exec -T postgres psql -v ON_ERROR_STOP=1 -qtA -U postgres -d auth "$@"; }

# Слова через дефис: удобно диктовать жюри и вводить с телефона
pw() { printf 'Mgimo-%s-%s' "$(tr -dc 'a-z0-9' </dev/urandom | head -c 6)" "$(tr -dc 'a-z0-9' </dev/urandom | head -c 6)"; }

umask 077
: > "$out"
psql_auth -c "CREATE EXTENSION IF NOT EXISTS pgcrypto" >/dev/null
for login in "${accounts[@]}"; do
  p=$(pw)
  n=$(psql_auth -v login="$login" -v pw="$p" <<'SQL'
UPDATE users SET password_hash = crypt(:'pw', gen_salt('bf', 12)) WHERE login = :'login' RETURNING 1;
DELETE FROM sessions WHERE user_id = (SELECT id FROM users WHERE login = :'login');
SQL
  )
  [ "$(head -1 <<<"$n")" = 1 ] || { echo "Аккаунт $login не найден — сначала deploy.sh (seed)"; exit 1; }
  printf '%s\t%s\n' "$login" "$p" >> "$out"
done
chmod 600 "$out"
echo "Пароли обновлены, старые сеансы завершены. Файл: $out (права 600). Передайте их жюри в комментарии к работе."
