import type { RouteObject } from 'react-router';
import { AckReportPage } from './AckReportPage';
import { StaffAnnouncementsPage } from './StaffAnnouncementsPage';
import { StaffDeadlinesPage } from './StaffDeadlinesPage';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [
  { path: '/staff/announcements', element: <StaffAnnouncementsPage /> },
  { path: '/staff/announcements/:id', element: <AckReportPage /> },
  { path: '/staff/deadlines', element: <StaffDeadlinesPage /> },
];
