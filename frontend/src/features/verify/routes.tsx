import type { RouteObject } from 'react-router';
import { VerifyFormPage, VerifyResultPage } from './VerifyPage';

// Без входа: страница открывается по QR-коду со справки
export const publicRoutes: RouteObject[] = [
  { path: '/verify', element: <VerifyFormPage /> },
  { path: '/verify/:code', element: <VerifyResultPage /> },
];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [];
