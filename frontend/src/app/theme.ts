import { useSyncExternalStore } from 'react';

// Тема: «как в системе» (по умолчанию), светлая или тёмная. Выбор хранится в localStorage — это настройка
// интерфейса, не персональные данные. Первую установку до отрисовки делает public/theme.js.
export type Theme = 'system' | 'light' | 'dark';

const KEY = 'theme';
const media = () => window.matchMedia('(prefers-color-scheme: dark)');
const listeners = new Set<() => void>();

export function getTheme(): Theme {
  try {
    const v = localStorage.getItem(KEY);
    return v === 'light' || v === 'dark' ? v : 'system';
  } catch {
    return 'system';
  }
}

function apply() {
  const t = getTheme();
  const dark = t === 'dark' || (t === 'system' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
}

export function setTheme(t: Theme) {
  try {
    if (t === 'system') localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, t);
  } catch {
    // приватный режим: тема действует до перезагрузки
  }
  apply();
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const m = media();
  m.addEventListener('change', apply); // «как в системе» следует за сменой темы ОС на лету
  return () => {
    listeners.delete(listener);
    m.removeEventListener('change', apply);
  };
}

export function useTheme(): [Theme, (t: Theme) => void] {
  return [useSyncExternalStore(subscribe, getTheme), setTheme];
}
