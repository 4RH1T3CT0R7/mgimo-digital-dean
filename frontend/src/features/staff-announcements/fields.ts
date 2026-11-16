import { useState } from 'react';
import type { components } from '@/api/notifications';
import { apiErrorMessage, fieldErrors } from '@/shared/lib/errors';

type Audience = components['schemas']['Audience'];

/** Длина в символах, а не в UTF-16: так же считает сервер. */
export function length(value: string) {
  return Array.from(value).length;
}

export function fieldState(name: string, error?: string) {
  return { 'aria-invalid': !!error, 'aria-describedby': error ? `${name}-error` : undefined };
}

export function validateAudience(audience: Audience, admin: boolean) {
  if (audience.kind === 'all') return admin ? undefined : 'Выберите адресата на своём факультете.';
  if (admin && !audience.faculty_id) return 'Выберите факультет.';
  if (audience.kind === 'group' && !audience.group_id) return 'Выберите группу.';
}

/** Ошибки формы: свои проверки до отправки и ошибки сервера по полям после. */
export function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string>();
  function validate(errors: Record<string, string | undefined>) {
    const present = Object.fromEntries(Object.entries(errors).flatMap(([key, value]) => (value ? [[key, value]] : [])));
    setFields(present);
    setMessage(undefined);
    return Object.keys(present).length === 0;
  }
  function fail(error: unknown) {
    const details = fieldErrors(error);
    setFields(details);
    if (Object.keys(details).length === 0) setMessage(apiErrorMessage(error));
  }
  return { fields, message, validate, fail };
}
