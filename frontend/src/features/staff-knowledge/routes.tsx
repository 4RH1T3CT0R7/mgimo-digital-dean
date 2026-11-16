import type { RouteObject } from 'react-router';
import { KnowledgePage } from './KnowledgePage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [{ path: '/staff/knowledge', element: <KnowledgePage /> }];
