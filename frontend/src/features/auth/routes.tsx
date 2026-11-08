import type { RouteObject } from 'react-router';
import { LoginPage } from './LoginPage';

export const publicRoutes: RouteObject[] = [{ path: '/login', element: <LoginPage /> }];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [];
