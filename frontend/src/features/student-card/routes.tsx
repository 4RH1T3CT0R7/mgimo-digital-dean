import type { RouteObject } from 'react-router';
import { StudentCardPage } from './StudentCardPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/student-card', element: <StudentCardPage /> }];
export const staffRoutes: RouteObject[] = [];
