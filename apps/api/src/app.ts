import { healthResponseSchema } from '@devarena/api-contracts';
import { Hono } from 'hono';

export function createApp(): Hono {
  const app = new Hono();

  app.get('/health', (c) => {
    const response = healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
    });

    return c.json(response);
  });

  app.get('/ready', (c) => {
    return c.json({
      status: 'ready',
      service: 'api',
    });
  });

  return app;
}
