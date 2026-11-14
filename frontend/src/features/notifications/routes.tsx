import type { RouteObject } from 'react-router';
import { NotificationsPage } from './NotificationsPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/notifications', element: <NotificationsPage /> }];
export const staffRoutes: RouteObject[] = [];
