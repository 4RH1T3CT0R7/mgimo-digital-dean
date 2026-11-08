# T08. Каркас фронтенда: оболочка, вход, моки, общие состояния

**Исполнитель:** Капитан (Claude Code) · **Приоритет:** P0 · **Веха:** M0 (10.11)

## Цель
Основа всех экранов. Благодаря ей участники с первого дня работают **на моках**, а все экраны одинаково показывают загрузку, пустоту и ошибки. Критерии: К4 (цельный стиль, навигация, состояния, телефон), К3.

## Контекст
- `AGENTS.md` (правила 15–18), `docs/plan.md` — карта экранов.
- `docs/architecture.md` §7 — технологии.
- `docs/security.md` §5 — подвал и политика ПДн.
- Контракты — для генерации клиентов.

## Что сделать
1. **Проект:**
   - `frontend/`: Vite + React + TypeScript (strict), алиас `@/`;
   - ESLint;
   - Vitest + Testing Library + `msw/node`;
   - скрипты: `dev`, `dev:mock`, `build`, `typecheck`, `lint`, `test`, `gen`.
2. **Клиенты API:**
   - `npm run gen` → `src/api/<svc>.d.ts` (openapi-typescript) для всех публичных контрактов;
   - `src/api/clients.ts` — `authApi`, `academicApi`, `requestsApi`, `notificationsApi`, `assistantApi` на openapi-fetch: `baseUrl=/api/<svc>`, `credentials: 'include'`, middleware «401 → на `/login`».
3. **Дизайн-основа:** Tailwind + shadcn/ui; токены цветов, радиусов и отступов в CSS-переменных (светлая тема; тёмная — позже); шрифт с лицензией OFL **локально** (без Google Fonts). Это базовая тема: стиль доработаем отдельно.
4. **`src/shared/ui`:**
   - shadcn-компоненты: Button, Card, Badge, Input, Textarea, Select, Checkbox, Tabs, Sheet, Dialog, Skeleton, Toast;
   - свои компоненты:
     - `PageHeader({title, subtitle?, actions?})`;
     - `LoadingState({rows?})`;
     - `EmptyState({title, description?, action?, illustration?})`;
     - `ErrorState({error, onRetry})`;
     - `StatusBadge({tone: 'neutral'|'info'|'success'|'warning'|'danger', children})`;
     - `AsOf({date})` — «Данные актуальны на …»;
     - **`QueryView({query, isEmpty?, empty, children})`** — единый способ показать загрузку, ошибку, пустоту и данные. Все экраны используют его.
5. **`src/shared/lib`:** форматирование дат и времени по Москве на русском, склонения (`plural`), `apiErrorMessage(err)`, `fieldErrors(err)` (из `details.fields`).
6. **Маршрутизация:**
   - каждая фича экспортирует из `features/<f>/routes.tsx` массивы `publicRoutes`, `studentRoutes`, `staffRoutes`;
   - `src/app/routes.tsx` собирает их;
   - охрана по ролям через `useMe()`: `student` → студенческая оболочка, `staff`/`admin` → `/staff`.
7. **Оболочка:**
   - **телефон:** нижняя панель из 5 вкладок (Сегодня, Расписание, Учёба, Заявки, Уведомления со счётчиком непрочитанных);
   - **компьютер:** боковое меню;
   - шапка: логотип-заглушка, имя, переход в профиль;
   - оболочка сотрудника: Заявки, Объявления, Дедлайны, Занятия; у admin — фильтр факультета там, где он есть в API.
8. **Подвал** на всех страницах: «Концепт для конкурса „Цифровой деканат будущего“. Не является официальным сервисом МГИМО. Все данные вымышлены.» + сведения о команде + ссылка на `/privacy`. Страница `/privacy` — текст по `security.md` §2 и §5.
9. **Вход:** `/login` (логин, пароль, ошибки 401/429 с понятным текстом, блокировка кнопки во время запроса); выход.
   При выходе — сброс кэша TanStack Query и событие `onLogout(callback)` из `src/app/session.ts`: на него подписывается PWA (T16), чтобы очистить кэши браузера.
10. **Моки (MSW):**
    - `npm run dev:mock` — фронтенд целиком без бэкенда;
    - `src/mocks/fixtures/` — типизированные сгенерированными типами данные по `seed.md` (`student.mo`, `dekanat.mo`);
    - `src/mocks/handlers/{auth,academic,requests,notifications,assistant}.ts`; в T08 — вход, `GET`-эндпоинты главной (расписание недели, заявки, счётчики, дедлайны) и базовый профиль; остальное дописывают владельцы фич;
    - **сценарии:** параметр `?scenario=empty|error|slow` заставляет все обработчики вернуть пустые списки, 500 или задержку 2 с — так проверяются состояния;
    - для тестов — `src/test/render.tsx` с `renderWithProviders` и `server` из `msw/node`.
11. Каталоги фич с файлами-заглушками маршрутов: `features/{auth,today,schedule,grades,profile,requests,notifications,verify,staff-applications,staff-announcements,staff-lessons,calendar-export,pwa,assistant}` — чтобы участникам не править роутер.
12. **`frontend/README.md`** — соглашения для агентов:
    - структура фичи (`routes.tsx`, `queries.ts` с хуками TanStack Query и ключами `['<svc>', …]`, `components/`, `labels.ts` с русскими подписями перечислений, тесты рядом);
    - как пользоваться `QueryView`;
    - как добавить мок;
    - как проверить состояния.
13. CI: джоб `frontend` — `npm ci`, `gen` без изменений, `typecheck`, `lint`, `test`, `build`, `npm audit --audit-level=high`.

## Контракты
Использует все публичные контракты (генерация типов).

## Зависимости
T01.

## Критерии готовности
- [ ] `npm run dev:mock`: вход под `student.mo` → оболочка с 5 вкладками на 360 px; под `dekanat.mo` → оболочка сотрудника.
- [ ] `?scenario=error` / `empty` / `slow` дают соответственно ErrorState, EmptyState, LoadingState на главной-заглушке.
- [ ] Нет горизонтальной прокрутки на 360 px; вкладки доступны с клавиатуры, у иконок есть подписи.
- [ ] Во вкладке Network нет запросов к сторонним доменам.
- [ ] `frontend/README.md` написан.
- [ ] `typecheck`, `lint`, `test`, `build` зелёные; CI зелёный.

## Что не входит
Содержимое экранов (T09–T16, T26), окончательный дизайн и логотип (T17 и отдельное обсуждение).

## Оценка
1,5 дня.
