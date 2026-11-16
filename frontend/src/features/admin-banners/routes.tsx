import type { RouteObject } from 'react-router';
import { AdminBannersPage } from './AdminBannersPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
// Оболочка сотрудника; страница и API /admin/* — только для администратора.
export const staffRoutes: RouteObject[] = [{ path: '/admin/banners', element: <AdminBannersPage /> }];
