import type { RouteObject } from 'react-router';
import { AssistantPage } from './AssistantPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [{ path: '/assistant', element: <AssistantPage /> }];
export const staffRoutes: RouteObject[] = [];
