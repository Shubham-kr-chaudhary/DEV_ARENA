import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('API foundation', () => {
  it('serves a health endpoint', async () => {
    const app = createApp({
      checkDatabaseReadiness: async () => true,
    });
    const response = await app.request('/health');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ok',
      service: 'api',
    });
  });

  it('returns 200 on /ready when the database dependency is healthy', async () => {
    const app = createApp({
      checkDatabaseReadiness: async () => true,
    });
    const response = await app.request('/ready');

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      service: 'api',
      checks: {
        database: 'up',
      },
    });
  });

  it('returns 503 on /ready when the database check returns false or throws', async () => {
    const unhealthyApp = createApp({
      checkDatabaseReadiness: async () => false,
    });
    const unhealthyResponse = await unhealthyApp.request('/ready');

    expect(unhealthyResponse.status).toBe(503);
    await expect(unhealthyResponse.json()).resolves.toEqual({
      status: 'not_ready',
      service: 'api',
      checks: {
        database: 'down',
      },
    });

    const throwingApp = createApp({
      checkDatabaseReadiness: async () => {
        throw new Error('Connection refused');
      },
    });
    const throwingResponse = await throwingApp.request('/ready');

    expect(throwingResponse.status).toBe(503);
    await expect(throwingResponse.json()).resolves.toEqual({
      status: 'not_ready',
      service: 'api',
      checks: {
        database: 'down',
      },
    });
  });
});
