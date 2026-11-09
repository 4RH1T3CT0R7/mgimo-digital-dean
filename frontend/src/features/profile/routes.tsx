import type { RouteObject } from 'react-router';
import { ProfilePage } from './ProfilePage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/profile', element: <ProfilePage /> }];
export const staffRoutes: RouteObject[] = [];
