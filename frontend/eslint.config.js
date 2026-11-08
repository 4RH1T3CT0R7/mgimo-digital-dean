import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'src/api/*.d.ts', 'public/mockServiceWorker.js'] },
  js.configs.recommended,
  tseslint.configs.recommended,
  reactHooks.configs.flat.recommended,
  reactRefresh.configs.vite,
  {
    rules: {
      // security.md §3: вывод только через экранирование React
      'no-restricted-syntax': [
        'error',
        { selector: "JSXAttribute[name.name='dangerouslySetInnerHTML']", message: 'dangerouslySetInnerHTML запрещён (security.md §3)' },
      ],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Файлы маршрутов и UI-примитивы экспортируют не только компоненты — это нормально
    files: ['src/**/routes.tsx', 'src/shared/ui/**', 'src/test/**', 'src/app/layout/FacultyFilter.tsx'],
    rules: { 'react-refresh/only-export-components': 'off' },
  },
);
