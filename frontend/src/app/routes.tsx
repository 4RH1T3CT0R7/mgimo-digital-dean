import { LoaderCircleIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Navigate, useLocation, useRoutes, type RouteObject } from 'react-router';
import * as adminBanners from '@/features/admin-banners/routes';
import * as assistant from '@/features/assistant/routes';
import * as auth from '@/features/auth/routes';
import { useMe } from '@/features/auth/queries';
import * as calendarExport from '@/features/calendar-export/routes';
import * as grades from '@/features/grades/routes';
import * as news from '@/features/news/routes';
import * as notifications from '@/features/notifications/routes';
import * as profile from '@/features/profile/routes';
import * as pwa from '@/features/pwa/routes';
import * as requests from '@/features/requests/routes';
import * as schedule from '@/features/schedule/routes';
import * as staffAnnouncements from '@/features/staff-announcements/routes';
import * as staffApplications from '@/features/staff-applications/routes';
import * as staffLessons from '@/features/staff-lessons/routes';
import * as today from '@/features/today/routes';
import * as verify from '@/features/verify/routes';
import { ErrorState } from '@/shared/ui/error-state';
import { StaffShell, StudentShell } from './layout/AppShell';
import { PublicLayout } from './layout/PublicLayout';
import { NotFoundPage } from './pages/NotFoundPage';
import { PrivacyPage } from './pages/PrivacyPage';
import { homePath, type Role } from './session';

// Новая фича — одна строка здесь; свои маршруты фича описывает в features/<f>/routes.tsx
const features = [
  auth,
  today,
  schedule,
  grades,
  profile,
  requests,
  notifications,
  verify,
  staffApplications,
  staffAnnouncements,
  staffLessons,
  calendarExport,
  pwa,
  assistant,
  news,
  adminBanners,
];

/** Пускает только роли `roles`; без входа — на /login, чужую роль — на её главную. */
function RequireRole({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const me = useMe();
  const location = useLocation();

  if (me.isPending) {
    return (
      <div role="status" className="flex min-h-dvh items-center justify-center text-muted-foreground">
        <LoaderCircleIcon className="size-6 animate-spin" aria-hidden />
        <span className="sr-only">Загрузка…</span>
      </div>
    );
  }
  if (me.isError) {
    return (
      <div className="mx-auto max-w-md px-gutter py-16">
        <ErrorState error={me.error} onRetry={() => void me.refetch()} />
      </div>
    );
  }
  if (!me.data) return <Navigate to="/login" state={{ from: location }} replace />;
  if (!roles.includes(me.data.role)) return <Navigate to={homePath(me.data.role)} replace />;
  return children;
}

export const routes: RouteObject[] = [
  {
    element: <PublicLayout />,
    children: [
      ...features.flatMap((f) => f.publicRoutes),
      { path: '/privacy', element: <PrivacyPage /> },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
  {
    element: (
      <RequireRole roles={['student']}>
        <StudentShell />
      </RequireRole>
    ),
    children: features.flatMap((f) => f.studentRoutes),
  },
  {
    element: (
      <RequireRole roles={['staff', 'admin']}>
        <StaffShell />
      </RequireRole>
    ),
    children: features.flatMap((f) => f.staffRoutes),
  },
];

export function AppRoutes() {
  return useRoutes(routes);
}
