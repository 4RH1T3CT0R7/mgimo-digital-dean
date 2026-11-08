import '@fontsource-variable/golos-text';
import './index.css';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { createQueryClient } from './app/query-client';
import { Providers } from './app/providers';
import { AppRoutes } from './app/routes';

// npm run dev:mock — API отвечает MSW из src/mocks; в сборку для прода моки не попадают
async function enableMocks() {
  if (import.meta.env.MODE !== 'mock') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

void enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Providers client={createQueryClient()}>
        <BrowserRouter>
          <AppRoutes />
        </BrowserRouter>
      </Providers>
    </StrictMode>,
  );
});
