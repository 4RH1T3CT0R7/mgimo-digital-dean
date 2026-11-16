import type { RouteObject } from 'react-router';
import { UsefulPage } from './UsefulPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/useful', element: <UsefulPage /> }];
export const staffRoutes: RouteObject[] = [];
