# Деплой на VPS (T23)

Пошаговая инструкция для капитана. Всё, кроме покупки сервера и домена, делают скрипты из `deploy/`. Время — около часа.

## 1. Сервер и домен (делает человек)

- **VPS у российского провайдера** — Timeweb Cloud, Selectel или Yandex Cloud: Ubuntu 24.04 LTS, 2 vCPU, 4 ГБ, 20+ ГБ диска. При создании добавьте свой **публичный SSH-ключ** (`~/.ssh/id_ed25519.pub`; если его нет — `ssh-keygen -t ed25519`). Сервер в России — условие доступа жюри без VPN и локализации ПДн (`security.md`).
- **Домен** `.ru` у регистратора (Reg.ru, Timeweb и т. п.). A-запись `@` (или поддомен, например `lk`) → IP сервера. Проверка: `nslookup <домен>` возвращает IP сервера.

## 2. Подготовка сервера (один раз)

```bash
ssh root@<IP>
git clone https://github.com/4RH1T3CT0R7/mgimo-digital-dean.git /home/deploy/mgimo   # репозиторий приватный: нужен токен или deploy key
cd /home/deploy/mgimo && sudo bash deploy/server-setup.sh deploy
chown -R deploy:deploy /home/deploy/mgimo
```

Скрипт: пользователь `deploy` с вашими ключами, Docker, `ufw` (открыты только 22, 80, 443), автообновления безопасности, вход только по ключу и без root. **Не закрывайте сессию root**, пока в новом окне не войдёте `ssh deploy@<IP>`.

## 3. Настройка и первая выкладка (под deploy)

```bash
ssh deploy@<IP>
cd ~/mgimo
bash deploy/gen-env.sh <домен>            # .env со случайными паролями БД, права 600
nano .env                                  # по желанию: LLM_* для ИИ-помощника (D49); без ключа он отвечает из справочника
git tag v1.0.0 && git push origin v1.0.0   # тег ставится на ноутбуке капитана, не на сервере
bash deploy/deploy.sh v1.0.0               # сборка, запуск, тестовые данные, проверка прода
bash deploy/set-demo-passwords.sh          # новые пароли тестовых аккаунтов → ~/demo-accounts.txt
```

`deploy.sh` выкладывает только по тегу и в конце запускает `deploy/prod-check.sh`: HTTPS, редирект с HTTP, заголовки безопасности, 401 без входа, закрытый внутренний API, страница проверки справки, манифест. Сертификат Let's Encrypt Caddy получает сам при первом запросе (порт 80 должен быть открыт, A-запись — уже смотреть на сервер).

Пароли из `~/demo-accounts.txt` — в комментарий к работе для жюри. В репозиторий и чаты их не копировать. Локальные пароли из `.secrets/demo-accounts.md` на проде не действуют.

## 4. Резервные копии

```bash
crontab -e
15 3 * * *  bash /home/deploy/mgimo/deploy/backup.sh >> /var/backups/mgimo/backup.log 2>&1
```

Копии всех баз — в `/var/backups/mgimo/<дата>/`, хранятся 7 дней. **Один раз проверить восстановление:** `bash deploy/backup.sh && bash deploy/restore-check.sh` — поднимает отдельный временный Postgres, восстанавливает копию и печатает число пользователей, занятий, заявок и уведомлений. Скриншот вывода — в `docs/process/security-check.md`.

## 5. Мониторинг

Бесплатный внешний пинг (например, UptimeRobot или аналог, доступный из России): главная `https://<домен>/` (ждём 200) и `https://<домен>/api/auth/me` (ждём 401 — значит, шлюз и auth живы). Уведомления — на почту капитана.

## 6. Чек-лист безопасности (`security.md` §6)

На проде пройти пункты §6 и записать результат со скриншотами в `docs/process/security-check.md`. Часть уже автоматизирована: `prod-check.sh` (заголовки, HSTS, CSP, закрытый внутренний API, подделка `X-User-*`), e2e T20 (чужая заявка → 404). Вручную: вкладка Network без сторонних доменов, `git log -p` и сканер секретов, восстановление копии (шаг 4).

## 7. Обновления и заморозка

- Новая версия: тег `v1.0.1` на ноутбуке → на сервере `bash deploy/deploy.sh v1.0.1`. Тестовые данные повторно не применяются (`seed.sh` помнит применённые файлы), пароли жюри не меняются.
- e2e на проде — с ноутбука: `cd e2e && npm ci && npx playwright install chromium`, затем `BASE_URL=https://<домен> E2E_PASSWORD_STUDENT_MO=… npx playwright test` (пароли из `~/demo-accounts.txt`, все переменные — в `e2e/README.md`). Workflow «e2e» в Actions гоняет те же сценарии на стенде внутри CI; его секреты `E2E_PASSWORD_*` — локальные пароли из `.secrets/demo-accounts.md`, а не прод.
- **22.11 — заморозка**: последний тег; до 28.11 — только исправления критичных ошибок по согласованию команды (Н10).

## 8. Новая база у сервиса на уже работающем томе

`deploy/postgres/init.sh` сам выполняется только на пустом томе PostgreSQL. Когда у сервиса появляется своя база (так было с `assistant`, D66), на сервере и на ноутбуке с уже созданным томом её нужно создать один раз вручную. Скрипт идемпотентный: существующие роли и базы не трогает, данные не теряются.

```bash
# 1. В .env добавить пароль новой базы (длинная случайная строка)
echo "ASSISTANT_DB_PASSWORD=$(openssl rand -hex 24)" >> .env
# 2. Пересоздать контейнер postgres с новой переменной (том с данными остаётся)
docker compose -f deploy/docker-compose.yml --env-file .env up -d postgres
# 3. Создать недостающие роли и базы
docker compose -f deploy/docker-compose.yml --env-file .env exec -T postgres sh /docker-entrypoint-initdb.d/init.sh
# 4. Собрать и запустить сервисы, загрузить тестовые данные новой базы (уже применённые seed пропускаются)
make up && make seed
```

На сервере вместо `make up && make seed` — обычная выкладка `bash deploy/deploy.sh <тег>` (она запускает и seed).

## Если что-то пошло не так

| Симптом | Что сделать |
|---|---|
| Браузер ругается на сертификат | A-запись ещё не обновилась или порт 80 закрыт: `nslookup <домен>`, `sudo ufw status`; `docker compose -f deploy/docker-compose.yml logs caddy` |
| `deploy.sh` ждёт и падает по таймауту | `docker compose -f deploy/docker-compose.yml --env-file .env ps` — какой сервис не healthy; его логи |
| Нужно откатиться | `bash deploy/deploy.sh <предыдущий тег>` |
| Забыли пароль жюри | `bash deploy/set-demo-passwords.sh` — выдаст новые для всех аккаунтов |
