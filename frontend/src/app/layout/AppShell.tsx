import {
  BellIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CalendarRangeIcon,
  FileTextIcon,
  GraduationCapIcon,
  HouseIcon,
  InboxIcon,
  LogOutIcon,
  MegaphoneIcon,
  MonitorIcon,
  MoonIcon,
  ShieldCheckIcon,
  SunIcon,
  UserIcon,
  type LucideIcon,
} from 'lucide-react';
import { Link, Outlet, useLocation } from 'react-router';
import { useLogout, useMe } from '@/features/auth/queries';
import { useFeedCounters } from '@/features/notifications/queries';
import { cn } from '@/shared/lib/utils';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { useTheme, type Theme } from '../theme';
import { Footer } from './Footer';
import { Logo } from './Logo';

type NavItem = {
  to: string;
  label: string;
  icon: LucideIcon;
  /** Когда пункт активен; по умолчанию — адрес совпадает или вложен */
  match?: (pathname: string) => boolean;
  /** Счётчик на значке (непрочитанные) */
  badge?: number;
};

export function StudentShell() {
  const unread = useFeedCounters().data?.unread;
  return (
    <AppShell
      profileLink="/profile"
      nav={[
        { to: '/', label: 'Сегодня', icon: HouseIcon },
        { to: '/schedule', label: 'Расписание', icon: CalendarDaysIcon },
        { to: '/grades', label: 'Учёба', icon: GraduationCapIcon },
        { to: '/requests', label: 'Заявки', icon: FileTextIcon },
        { to: '/notifications', label: 'Уведомления', icon: BellIcon, badge: unread },
      ]}
    />
  );
}

export function StaffShell() {
  return (
    <AppShell
      nav={[
        { to: '/staff', label: 'Заявки', icon: InboxIcon, match: (p) => p === '/staff' || p.startsWith('/staff/requests') },
        { to: '/staff/announcements', label: 'Объявления', icon: MegaphoneIcon },
        { to: '/staff/deadlines', label: 'Дедлайны', icon: CalendarClockIcon },
        { to: '/staff/lessons', label: 'Занятия', icon: CalendarRangeIcon },
      ]}
    />
  );
}

function isActive(item: NavItem, pathname: string) {
  return item.match ? item.match(pathname) : pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function badgeText(n: number) {
  return n > 99 ? '99+' : String(n);
}

function AppShell({ nav, profileLink }: { nav: NavItem[]; profileLink?: string }) {
  const { pathname } = useLocation();

  return (
    // Фон колонки меню — на всю высоту страницы (само меню закреплено и короче длинной страницы)
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_minmax(0,1fr)] lg:bg-[linear-gradient(to_right,var(--card)_calc(16rem-1px),var(--border)_calc(16rem-1px),var(--border)_16rem,transparent_16rem)]">
      <a
        href="#main"
        className="sr-only z-50 rounded-md bg-card px-4 py-2 shadow focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Перейти к содержимому
      </a>

      {/* Компьютер: боковое меню */}
      <aside className="sticky top-0 hidden h-dvh flex-col gap-8 border-r bg-card px-3 py-5 lg:flex">
        <Logo className="px-2" />
        <nav aria-label="Разделы">
          <ul className="flex flex-col gap-1">
            {nav.map((item) => {
              const active = isActive(item, pathname);
              return (
                <li key={item.to}>
                  <Link
                    to={item.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-11 items-center gap-3 rounded-lg px-3 text-[0.9375rem] font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none',
                      active && 'bg-accent text-accent-foreground hover:bg-accent hover:text-accent-foreground',
                    )}
                  >
                    <item.icon className="size-5" aria-hidden />
                    {item.label}
                    {!!item.badge && (
                      <span className="ml-auto rounded-full bg-destructive px-1.5 text-xs leading-5 text-destructive-foreground">
                        {badgeText(item.badge)}
                        <span className="sr-only"> непрочитанных</span>
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <div className="flex min-h-dvh min-w-0 flex-col pb-[calc(var(--tabbar-h)+env(safe-area-inset-bottom))] lg:pb-0">
        <header className="sticky top-0 z-30 flex h-header shrink-0 items-center gap-2 border-b bg-background/85 px-gutter backdrop-blur">
          <Logo compact className="lg:hidden" />
          <UserMenu profileLink={profileLink} />
        </header>
        <main id="main" tabIndex={-1} className="relative isolate mx-auto min-h-[calc(100dvh-var(--spacing-header))] w-full max-w-6xl flex-1 px-gutter py-6 outline-none md:py-10">
          <div aria-hidden className="skyline skyline-page" />
          {/* key: при переходе на другую страницу она плавно появляется; обновление данных внутри страницы — без анимации */}
          <div key={pathname} className="animate-[rise_200ms_ease-out]">
            <Outlet />
          </div>
        </main>
        <Footer />
      </div>

      {/* Телефон: нижняя панель вкладок */}
      <nav aria-label="Разделы" className="fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {/* Равные колонки по числу вкладок (5 у студента, 4 у сотрудника) и кегль 10 px: «Уведомления» (~60 px) помещается в колонку (69 px при 345 px
            с полосой прокрутки) с запасом. Раньше ширина шла по подписи и запас был 2 px — при активной
            «Заявки» подпись обрезалась. */}
        <ul className="grid h-tabbar auto-cols-fr grid-flow-col">
          {nav.map((item) => {
            const active = isActive(item, pathname);
            return (
              <li key={item.to} className="min-w-0">
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'flex h-full flex-col items-center justify-center gap-1 px-0.5 text-[10px] leading-none font-medium tracking-tight text-muted-foreground transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none focus-visible:ring-inset',
                    active && 'text-accent-foreground',
                  )}
                >
                  <span className={cn('relative flex h-7 w-12 items-center justify-center rounded-full transition-colors', active && 'bg-accent')}>
                    <item.icon className="size-5" aria-hidden />
                    {!!item.badge && (
                      <span
                        aria-hidden
                        className="absolute -top-1 left-[calc(50%+0.375rem)] min-w-[1.125rem] rounded-full bg-destructive px-1 text-center text-[10px] leading-[1.125rem] text-destructive-foreground"
                      >
                        {badgeText(item.badge)}
                      </span>
                    )}
                  </span>
                  <span className="whitespace-nowrap">{item.label}</span>
                  {!!item.badge && <span className="sr-only">, непрочитанных: {item.badge}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
}

const ROLE_LABEL = { student: 'Студент', staff: 'Сотрудник деканата', admin: 'Администратор' } as const;

const THEMES: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'system', label: 'Как в системе', icon: MonitorIcon },
  { value: 'light', label: 'Светлая', icon: SunIcon },
  { value: 'dark', label: 'Тёмная', icon: MoonIcon },
];

/** Аватар → меню: профиль, безопасность, тема, выход. На телефоне в шапке только аватар. */
function UserMenu({ profileLink }: { profileLink?: string }) {
  const me = useMe().data;
  const logout = useLogout();
  const [theme, setTheme] = useTheme();
  if (!me) return null;

  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        aria-label={`Меню пользователя: ${me.display_name}`}
        className="ml-auto flex min-w-0 items-center gap-2.5 rounded-full py-1 pr-1 pl-1 outline-none hover:bg-muted focus-visible:ring-[3px] focus-visible:ring-ring/50 data-[state=open]:bg-muted sm:pr-3"
      >
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-semibold text-primary-foreground" aria-hidden>
          {initials(me.display_name)}
        </span>
        <span className="hidden max-w-[12rem] truncate text-[0.9375rem] font-medium sm:block">{me.display_name}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        <div className="px-2.5 pt-1.5 pb-2">
          <p className="font-medium">{me.display_name}</p>
          <p className="text-sm text-muted-foreground">{ROLE_LABEL[me.role]}</p>
        </div>
        <DropdownMenuSeparator />
        {profileLink && (
          <DropdownMenuItem asChild>
            <Link to={profileLink}>
              <UserIcon aria-hidden />
              Профиль
            </Link>
          </DropdownMenuItem>
        )}
        <DropdownMenuItem asChild>
          <Link to={me.role === 'student' ? '/security' : '/staff/security'}>
            <ShieldCheckIcon aria-hidden />
            Безопасность
          </Link>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Тема</DropdownMenuLabel>
        <DropdownMenuRadioGroup value={theme} onValueChange={(v) => setTheme(v as Theme)}>
          {THEMES.map((t) => (
            <DropdownMenuRadioItem key={t.value} value={t.value}>
              <t.icon aria-hidden />
              {t.label}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={logout.isPending} onSelect={() => logout.mutate()}>
          <LogOutIcon aria-hidden />
          Выйти
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
