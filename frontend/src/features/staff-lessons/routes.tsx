import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [{ path: '/staff/lessons', element: <StubPage title="Занятия" task="T14" /> }];
