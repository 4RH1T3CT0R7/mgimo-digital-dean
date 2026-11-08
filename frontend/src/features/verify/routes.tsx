import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

// Без входа: страница открывается по QR-коду со справки
export const publicRoutes: RouteObject[] = [
  { path: '/verify', element: <StubPage title="Проверка справки" task="T15" /> },
  { path: '/verify/:code', element: <StubPage title="Проверка справки" task="T15" /> },
];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [];
