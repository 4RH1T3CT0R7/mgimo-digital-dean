import type { RouteObject } from 'react-router';
import { ApplicationPage } from './components/ApplicationPage';
import { NewRequestPage } from './components/NewRequestPage';
import { RequestsPage } from './components/RequestsPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [
  { path: '/requests', element: <RequestsPage /> },
  { path: '/requests/new/:serviceTypeId', element: <NewRequestPage /> },
  { path: '/requests/:id', element: <ApplicationPage /> },
];
export const staffRoutes: RouteObject[] = [];
