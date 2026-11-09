import type { RouteObject } from 'react-router';
import { GradesPage } from './GradesPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/grades', element: <GradesPage /> }];
export const staffRoutes: RouteObject[] = [];
