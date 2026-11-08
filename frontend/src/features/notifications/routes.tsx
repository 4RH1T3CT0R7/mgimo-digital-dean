import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/notifications', element: <StubPage title="Уведомления" task="T11" /> }];
export const staffRoutes: RouteObject[] = [];
