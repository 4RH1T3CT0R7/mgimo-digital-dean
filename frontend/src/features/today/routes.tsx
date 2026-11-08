import type { RouteObject } from 'react-router';
import { TodayPage } from './TodayPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/', element: <TodayPage /> }];
export const staffRoutes: RouteObject[] = [];
