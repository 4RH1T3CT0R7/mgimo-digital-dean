#!/usr/bin/env bash
# Подготовка чистого VPS (Ubuntu 22.04/24.04) — один раз, от root (T23, docs/deploy.md).
# Запуск: sudo bash deploy/server-setup.sh deploy
#   — создаёт пользователя deploy с вашими SSH-ключами root, ставит Docker, ufw (22/80/443),
#     автообновления безопасности, отключает вход по паролю и вход под root.
# Повторный запуск безопасен.
set -euo pipefail
user=${1:-deploy}
[ "$(id -u)" = 0 ] || { echo "Запустите от root (sudo)"; exit 1; }
[ -s /root/.ssh/authorized_keys ] || { echo "Нет /root/.ssh/authorized_keys: сначала войдите по SSH-ключу, иначе после отключения паролей сервер станет недоступен"; exit 1; }

export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get upgrade -yq
apt-get install -yq ca-certificates curl git ufw unattended-upgrades docker.io docker-compose-v2 postgresql-client

# Пользователь для деплоя: те же ключи, что у root; Docker без sudo
id "$user" >/dev/null 2>&1 || adduser --disabled-password --gecos "" "$user"
usermod -aG docker "$user"
install -d -m 700 -o "$user" -g "$user" "/home/$user/.ssh"
install -m 600 -o "$user" -g "$user" /root/.ssh/authorized_keys "/home/$user/.ssh/authorized_keys"

# SSH только по ключу, без root
cat > /etc/ssh/sshd_config.d/10-mgimo.conf <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sshd -t && systemctl reload ssh

# Наружу — только SSH и веб (security.md §3)
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

# Автоматические обновления безопасности
dpkg-reconfigure -f noninteractive unattended-upgrades

# Каталог резервных копий (deploy/backup.sh)
install -d -m 750 -o "$user" -g "$user" /var/backups/mgimo

systemctl enable --now docker
echo "Готово. Дальше: войдите как $user (ssh $user@<IP>) и следуйте docs/deploy.md, шаг 3."
