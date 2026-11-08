import type { RouteObject } from 'react-router';
import { StaffLessonsPage } from './StaffLessonsPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [{ path: '/staff/lessons', element: <StaffLessonsPage /> }];
