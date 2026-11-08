import { scenarioHandler } from '../scenario';
import { academicHandlers } from './academic';
import { assistantHandlers } from './assistant';
import { authHandlers } from './auth';
import { notificationsHandlers } from './notifications';
import { requestsHandlers } from './requests';

// Общие для браузера (dev:mock) и тестов (src/test/render.tsx)
export const handlers = [
  scenarioHandler,
  ...authHandlers,
  ...academicHandlers,
  ...requestsHandlers,
  ...notificationsHandlers,
  ...assistantHandlers,
];
