import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const css = readFileSync('src/index.css', 'utf8'); // vitest запускается из frontend/

// Контраст пар цветов обеих тем — WCAG 2.1 AA: текст 4.5:1, рамки полей и фокус 3:1 (docs/design.md)

/** Переменные блока `selector {…}`, начинающегося с новой строки (без вложенных @media) */
function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`\n${selector} {`);
  const block = start < 0 ? '' : css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]));
}

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5]
    .map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const light = tokens(':root');
const themes = { light, dark: { ...light, ...tokens('.dark') } };
const PAIRS: [string, string, number][] = [
  ['foreground', 'background', 4.5],
  ['foreground', 'card', 4.5],
  ['muted-foreground', 'background', 4.5],
  ['muted-foreground', 'card', 4.5],
  ['muted-foreground', 'muted', 4.5],
  ['primary-foreground', 'primary', 4.5],
  ['primary', 'card', 4.5],
  ['primary', 'background', 4.5],
  ['accent-foreground', 'accent', 4.5],
  ['destructive-foreground', 'destructive', 4.5],
  ['info-strong', 'info-soft', 4.5],
  ['success-strong', 'success-soft', 4.5],
  ['warning-strong', 'warning-soft', 4.5],
  ['danger-strong', 'danger-soft', 4.5],
  ['danger-strong', 'card', 4.5],
  ['input', 'card', 3],
  ['ring', 'card', 3],
];

describe('Палитра', () => {
  for (const [name, t] of Object.entries(themes)) {
    it.each(PAIRS)(`${name}: %s на %s — не меньше %s:1`, (fg, bg, min) => {
      expect(t[fg], `нет токена --${fg}`).toBeDefined();
      expect(t[bg], `нет токена --${bg}`).toBeDefined();
      expect(contrast(t[fg], t[bg])).toBeGreaterThanOrEqual(min);
    });
  }
});
