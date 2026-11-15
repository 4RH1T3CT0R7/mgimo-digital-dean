import type { components } from '@/api/notifications';

type Audience = components['schemas']['Audience'];

export function fieldState(name: string, error?: string) {
  return { 'aria-invalid': !!error, 'aria-describedby': error ? `${name}-error` : undefined };
}

export function validateAudience(audience: Audience, admin: boolean) {
  if (audience.kind === 'all') return admin ? undefined : 'Выберите адресата на своём факультете.';
  if (admin && !audience.faculty_id) return 'Выберите факультет.';
  if (audience.kind === 'group' && !audience.group_id) return 'Выберите группу.';
}
