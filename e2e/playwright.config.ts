import { defineConfig } from '@playwright/test';

const mock = process.env.E2E_MOCK === '1';
const baseURL = process.env.BASE_URL || (mock ? 'http://127.0.0.1:4183' : undefined);
if (!baseURL && !process.argv.includes('--list')) {
  throw new Error('Укажите BASE_URL тестового стенда или E2E_MOCK=1 для прогона на моках.');
}

const browserEnv = { ...process.env };
for (const key of Object.keys(browserEnv)) {
  if (key.startsWith('E2E_PASSWORD_')) delete browserEnv[key];
}

export default defineConfig({
  testDir: './tests',
  reporter: [['list'], ['html', { open: 'never' }]],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  workers: 1,
  retries: 0,
  use: {
    browserName: 'chromium',
    baseURL,
    acceptDownloads: true,
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
    ignoreHTTPSErrors: process.env.E2E_LOCAL_HTTPS === '1' && /^https:\/\/(localhost|127\.0\.0\.1)(:\d+)?\/?$/.test(baseURL ?? ''),
    launchOptions: { env: browserEnv, executablePath: process.env.E2E_CHROMIUM_PATH },
    // Трейсы и видео могут записать поля входа и cookie.
    trace: 'off',
    screenshot: 'off',
    video: 'off',
  },
  webServer: mock ? {
    cwd: process.env.E2E_FRONTEND_DIR || '../frontend',
    command: 'npm run dev:mock -- --host 127.0.0.1 --port 4183 --strictPort',
    url: baseURL,
    env: Object.fromEntries(Object.keys(process.env).filter((key) => key.startsWith('E2E_PASSWORD_')).map((key) => [key, ''])),
    reuseExistingServer: !process.env.CI,
  } : undefined,
  projects: [
    { name: 'mobile', use: { viewport: { width: 360, height: 740 }, isMobile: true, hasTouch: true } },
    { name: 'desktop', testIgnore: ['**/layout.spec.ts', '**/security.spec.ts'], use: { viewport: { width: 1280, height: 800 } } },
  ],
});
