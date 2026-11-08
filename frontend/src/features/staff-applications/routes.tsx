import type { RouteObject } from 'react-router';
import { FacultyFilter } from '@/app/layout/FacultyFilter';
import { StubPage } from '@/shared/ui/stub-page';

export const publicRoutes: RouteObject[] = [];
export const studentRoutes: RouteObject[] = [];
export const staffRoutes: RouteObject[] = [
  {
    path: '/staff',
    element: (
      <StubPage title="Заявки" task="T12">
        <div className="mb-5">
          <FacultyFilter />
        </div>
      </StubPage>
    ),
  },
  { path: '/staff/requests/:id', element: <StubPage title="Заявка" task="T12" /> },
];
