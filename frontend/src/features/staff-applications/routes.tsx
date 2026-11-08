import type { RouteObject } from 'react-router';
import { ApplicationPage } from './components/ApplicationPage';
import { ApplicationsPage } from './components/ApplicationsPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [
  { path: '/staff', element: <ApplicationsPage /> },
  { path: '/staff/requests/:id', element: <ApplicationPage /> },
];
