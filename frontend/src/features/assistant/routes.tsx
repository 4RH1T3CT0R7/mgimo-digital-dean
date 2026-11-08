import type { RouteObject } from 'react-router';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/assistant', element: <StubPage title="ИИ-помощник" task="T26" /> }];
export const staffRoutes: RouteObject[] = [];
