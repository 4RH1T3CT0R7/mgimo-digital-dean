import type { RouteObject } from 'react-router';
import { NewsPage } from './NewsPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/news', element: <NewsPage /> }];
export const staffRoutes: RouteObject[] = [];
