import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [
  { path: '/requests', element: <StubPage title="Заявки" task="T10" /> },
  { path: '/requests/new/:serviceTypeId', element: <StubPage title="Новая заявка" task="T10" /> },
  { path: '/requests/:id', element: <StubPage title="Заявка" task="T10" /> },
];
export const staffRoutes: RouteObject[] = [];
