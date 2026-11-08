import type { components } from '@/api/auth';

type Me = components['schemas']['Me'];

/** Пароль всех тестовых аккаунтов в режиме моков. Настоящие пароли в репозиторий не кладём (D38). */
export const MOCK_PASSWORD = 'demo';

const FMO = '10000000-0000-4000-8000-000000000001';
const MEO = '10000000-0000-4000-8000-000000000002';

// Аккаунты — docs/contracts/seed.md
export const users: Record<string, Me> = {
  'student.mo': {
    id: '30000000-0000-4000-8000-000000000001',
    login: 'student.mo',
    role: 'student',
    display_name: 'Лебедева А. В.',
    faculty_id: null,
  },
  'student.meo': {
    id: '30000000-0000-4000-8000-000000000002',
    login: 'student.meo',
    role: 'student',
    display_name: 'Соколов М. О.',
    faculty_id: null,
  },
  'dekanat.mo': { id: '40000000-0000-4000-8000-000000000001', login: 'dekanat.mo', role: 'staff', display_name: 'Деканат ФМО', faculty_id: FMO },
  'dekanat.meo': { id: '40000000-0000-4000-8000-000000000002', login: 'dekanat.meo', role: 'staff', display_name: 'Деканат МЭО', faculty_id: MEO },
  admin: { id: '40000000-0000-4000-8000-000000000003', login: 'admin', role: 'admin', display_name: 'Администратор', faculty_id: null },
};
