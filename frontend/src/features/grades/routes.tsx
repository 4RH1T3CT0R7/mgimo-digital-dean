import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/grades', element: <StubPage title="Успеваемость" task="T09" /> }];
export const staffRoutes: RouteObject[] = [];
