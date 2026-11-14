import { serve } from '@hono/node-server';
import { loadServerConfig } from '@devarena/config';
import { createApp } from './app.js';
import { disconnectPrisma } from './db/index.js';

const SHUTDOWN_TIMEOUT_MS = 10_000;

const config = loadServerConfig();
const app = createApp();

const server = serve(
  {
    fetch: app.fetch,
    hostname: config.API_HOST,
    port: config.API_PORT,
  },
  (info) => {
    console.log(`DevArena API listening on http://${info.address}:${info.port}`);
  },
);

let isShuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (isShuttingDown) {
    return;
  }
  isShuttingDown = true;

  console.log(`Received ${signal}; shutting down API gracefully.`);

  const forceExitTimer = setTimeout(() => {
    console.error('Forced API shutdown after timeout.');
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS);
  forceExitTimer.unref();

  try {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve();
      });
    });

    await disconnectPrisma();
    clearTimeout(forceExitTimer);
    process.exit(0);
  } catch (error) {
    console.error('Error during API shutdown:', error);
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

process.on('SIGTERM', () => {
  void shutdown('SIGTERM');
});
process.on('SIGINT', () => {
  void shutdown('SIGINT');
});
