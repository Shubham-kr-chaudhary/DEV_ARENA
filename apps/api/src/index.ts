import { serve } from '@hono/node-server';
import { loadServerConfig } from '@devarena/config';
import { createApp } from './app.js';

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

function shutdown(signal: string): void {
  console.log(`Received ${signal}; shutting down API.`);
  server.close(() => {
    process.exit(0);
  });
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
