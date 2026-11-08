# Фронтенд: соглашения для агентов и участников

React 19 + Vite + TypeScript (strict), React Router 7, TanStack Query 5, openapi-fetch, Tailwind CSS 4 + компоненты в стиле shadcn/ui (Radix), lucide-react, MSW 2. Общие правила — `AGENTS.md` (15–18), карта экранов — `docs/plan.md`.

## Команды

| Команда | Что делает |
|---|---|
| `npm run dev:mock` | Весь фронтенд без бэкенда: API отвечает MSW из `src/mocks` |
| `npm run dev` | Фронтенд с настоящим API через шлюз (`make up`, прокси `/api` → `https://localhost`; другой адрес — `VITE_API_TARGET`) |
| `npm run gen` | Типы API из `docs/contracts/*.yaml` → `src/api/*.d.ts` (руками не править) |
| `npm run typecheck` / `lint` / `test` / `build` | Проверки, как в CI (`.github/workflows/frontend.yml`) |
| `npm run msw:init` | Обновить `public/mockServiceWorker.js` после обновления `msw` |

**Вход в режиме моков:** аккаунты из `docs/contracts/seed.md` (`student.mo`, `student.meo`, `dekanat.mo`, `dekanat.meo`, `admin`), пароль у всех — `demo` (только для моков; настоящие пароли в репозитории не хранятся, D38).

**npm 12** по умолчанию не запускает install-скрипты пакетов. Для проекта это не мешает: единственный заблокированный скрипт — `postinstall` у `msw`, он копирует воркер, а воркер уже лежит в `public/` (обновляется командой `npm run msw:init`).

## Структура

```
src/
  api/            clients.ts (authApi, academicApi, …, unwrap) + сгенерированные *.d.ts — не править
  app/            оболочки, охрана маршрутов, routes.tsx, session.ts, /privacy, 404
  shared/ui/      компоненты (Button, Card, …, QueryView) — бери отсюда
  shared/lib/     format.ts (даты по Москве, plural), errors.ts (ApiError, apiErrorMessage, fieldErrors)
  features/<f>/   экраны фичи
  mocks/          fixtures/<svc>.ts, handlers/<svc>.ts, scenario.ts, browser.ts
  test/           render.tsx (renderWithProviders, server), setup.ts
```

## Структура фичи

```
features/<f>/
  routes.tsx       publicRoutes, studentRoutes, staffRoutes — роутер собирает их сам
  queries.ts       хуки TanStack Query; ключи начинаются с имени сервиса
  components/      компоненты экранов
  labels.ts        русские подписи перечислений API
  *.test.tsx       тесты рядом с кодом
```

- **Маршруты.** Пути в `routes.tsx` абсолютные (`/schedule`, `/staff/lessons`). `studentRoutes` попадают в оболочку студента (вход обязателен, роль `student`), `staffRoutes` — в оболочку сотрудника (`staff`, `admin`), `publicRoutes` — без входа, с логотипом и подвалом. Править `src/app/routes.tsx` не нужно.
- **Запросы.** Только через сгенерированный клиент и `unwrap` — он возвращает данные или бросает `ApiError`:

  ```ts
  export function useProfile() {
    return useQuery({ queryKey: ['academic', 'profile'], queryFn: () => unwrap(academicApi.GET('/me/profile')) });
  }
  ```

  Ключи: `['<svc>', <ресурс>, …параметры]`, например `['requests', 'applications', { status }]`. После изменения — `queryClient.invalidateQueries({ queryKey: ['requests', 'applications'] })`.
- **Ошибки.** Текст для человека — `apiErrorMessage(err)` (для 4xx — сообщение сервера, для 429 — «через N секунд/минут», для 5xx и сети — свой текст). Ошибки полей формы — `fieldErrors(err)` (из `details.fields`). Тосты — `toast.error(apiErrorMessage(err))` из `@/shared/ui/toast`.
- **Даты.** Только `formatDate`, `formatTime`, `formatDateTime`, `toApiDate` из `@/shared/lib/format` — всё по Москве. Склонения — `plural(n, ['день', 'дня', 'дней'])`.
- **Сессия.** `useMe()` и `useLogout()` — из `features/auth/queries.ts`. 401 от любого сервиса (кроме `auth`) завершает сессию и ведёт на `/login`.
- **Выход.** `onLogout(callback)` из `src/app/session.ts` — вызывается при выходе и при истечении сессии; возвращает функцию отписки. Каркас по нему чистит кэш TanStack Query; PWA (T16) подписывается, чтобы очистить `caches` и `localStorage`:

  ```ts
  onLogout(() => { void caches.keys().then((keys) => keys.forEach((k) => caches.delete(k))); });
  ```
- **Фильтр факультета у admin** — `FacultyFilter` и `useFacultyFilter()` из `src/app/layout/FacultyFilter.tsx` (значение в адресе `?faculty_id=`; у staff не показывается). Только там, где API принимает `faculty_id`.

## QueryView — загрузка, ошибка, пусто, данные

Каждый блок с данными показывается через `QueryView` — так все экраны одинаково ведут себя при загрузке, ошибке и пустоте (AGENTS.md, правило 16):

```tsx
const applications = useMyApplications();

<QueryView
  query={applications}
  isEmpty={(data) => data.items.length === 0}
  empty={<EmptyState title="Заявок пока нет" action={<Button asChild><Link to="/requests/new/study-certificate">Заказать справку</Link></Button>} />}
  loading={<LoadingState rows={2} />} // необязательно
>
  {(data) => <ApplicationList items={data.items} />}
</QueryView>
```

- Пока данных нет — `LoadingState`; ошибка — `ErrorState` с кнопкой «Повторить»; `isEmpty` вернул `true` — `empty`; иначе — `children(data)`.
- Если данные уже были, а фоновое обновление упало, остаются прежние данные.
- Каждый независимый блок экрана — свой `useQuery` и свой `QueryView`: упал один сервис — остальные блоки работают.

Остальные общие компоненты: `PageHeader({title, subtitle?, actions?})`, `EmptyState({title, description?, action?, illustration?})`, `ErrorState({error, onRetry})`, `LoadingState({rows?})`, `StatusBadge({tone: 'neutral'|'info'|'success'|'warning'|'danger'})` (в `children` всегда текст — цвет не единственный признак), `AsOf({date})` — «Данные актуальны на …».

## Моки (MSW)

Одни и те же обработчики работают в `npm run dev:mock` (браузер) и в тестах (`msw/node`).

Добавить мок:
1. Данные — в `src/mocks/fixtures/<svc>.ts`, с типами из `@/api/<svc>` (`components['schemas']['…']`), по `docs/contracts/seed.md`.
2. Обработчик — в `src/mocks/handlers/<svc>.ts`, в массив `<svc>Handlers`. Адрес — как его видит браузер: `/api/<svc>/<путь из контракта>`.
3. Каждый список оборачивай в `list(items)`, ответ `{ items, total }` — в `page(items, request)` из `src/mocks/scenario.ts`: так работает сценарий `empty`.

```ts
http.get('/api/requests/me/applications', ({ request }) => HttpResponse.json(page(myApplications, request))),
http.get('/api/academic/me/schedule', () => HttpResponse.json({ ...weekSchedule, lessons: list(weekSchedule.lessons) })),
```

Запрос без мока в `dev:mock` получает 404 «Мок не написан: GET /api/…». Текущий пользователь мока — `mockUser()` из `src/mocks/handlers/auth.ts`.

## Как проверить состояния

Добавь к адресу страницы параметр (в режиме моков):

| Адрес | Что делают все обработчики | Что должно быть на экране |
|---|---|---|
| `/?scenario=empty` | пустые списки | `EmptyState` |
| `/?scenario=error` | 500 | `ErrorState` с «Повторить» |
| `/?scenario=slow` | задержка 2 с | `LoadingState` |

Параметр действует, пока он есть в адресе (при переходе по вкладкам пропадает — добавь снова). Вход и `/api/auth/*` от сценария не зависят. Без моков — отключи сеть в DevTools.

## Тесты

Vitest + Testing Library + MSW. Обработчики по умолчанию — те же, что в `dev:mock`; неизвестный запрос роняет тест.

```tsx
import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { AppRoutes } from '@/app/routes';
import { renderWithProviders, server } from '@/test/render';

it('ошибка заявок не ломает экран', async () => {
  server.use(http.get('/api/requests/me/applications', () => HttpResponse.json({ code: 'internal', message: '…' }, { status: 500 })));
  const { user } = renderWithProviders(<AppRoutes />, { route: '/', login: 'student.mo' });
  expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить данные');
});
```

- `renderWithProviders(ui, { route, login })` — `route` с параметрами (`'/?scenario=empty'`), `login` — войти под аккаунтом из seed без формы. Повторы запросов в тестах выключены.
- Можно рендерить и отдельный компонент — роутер и QueryClient уже есть.
- В jsdom нет CSS: на странице одновременно и боковое меню, и нижняя панель.
- Фиксированное время: `vi.setSystemTime(new Date('2026-11-18T10:00:00+03:00'))`.

## Дизайн

Токены — CSS-переменные в `src/index.css` (`:root`): цвета (`--primary`, `--muted`, тона `--success-soft/strong` и т. д.), радиус `--radius`, отступы `--gutter`, высоты шапки и нижней панели. Классы Tailwind: `bg-primary`, `text-muted-foreground`, `bg-success-soft`, `px-gutter`. Цвета в компонентах не хардкодим. Шрифт — Golos Text (OFL) из `@fontsource-variable/golos-text`, раздаётся с нашего сервера. Сначала телефон: всё проверяй на 360 px.
