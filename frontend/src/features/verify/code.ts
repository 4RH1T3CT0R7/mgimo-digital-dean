export const codeHint = '10 символов: латинские буквы A–Z и цифры 2–7.';

export function normalizeCode(value: string): string
{
    return value.replace(/\s+/g, '').toUpperCase();
}

export function validCode(value: string): boolean
{
    return /^[A-Z2-7]{10}$/.test(value);
}
