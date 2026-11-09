import type { RouteObject } from 'react-router';
import { SchedulePage } from './SchedulePage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/schedule', element: <SchedulePage /> }];
export const staffRoutes: RouteObject[] = [];
