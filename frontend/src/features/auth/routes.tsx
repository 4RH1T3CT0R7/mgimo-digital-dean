import type { RouteObject } from 'react-router';
import { LoginPage } from './LoginPage';
import { SessionsPage } from './SessionsPage';

export const publicRoutes: RouteObject[] = [{ path: '/login', element: <LoginPage /> }];
export const studentRoutes: RouteObject[] = [{ path: '/security', element: <SessionsPage /> }];
export const staffRoutes: RouteObject[] = [{ path: '/staff/security', element: <SessionsPage /> }];
