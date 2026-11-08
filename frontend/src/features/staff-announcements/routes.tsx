import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [
  { path: '/staff/announcements', element: <StubPage title="Объявления" task="T13" /> },
  { path: '/staff/announcements/:id', element: <StubPage title="Объявление" task="T13" /> },
  { path: '/staff/deadlines', element: <StubPage title="Дедлайны" task="T13" /> },
];
