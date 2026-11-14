import { loadWorkerConfig, type WorkerConfig } from '@devarena/config';

/**
 * Phase 1 worker runtime foundation.
 *
 * Deliberately does not consume SQS or execute source code yet.
 * Validates worker environment configuration and establishes health/readiness
 * state and graceful shutdown hooks for the Phase 7 judge worker.
 */

export interface WorkerRuntimeState {
  readonly service: 'judge-worker';
  readonly status: 'ok' | 'shutting_down';
  readonly ready: boolean;
  readonly queueConfigured: boolean;
}

export function createWorkerRuntime(env: NodeJS.ProcessEnv = process.env): {
  config: WorkerConfig;
  getHealthState: () => WorkerRuntimeState;
  initiateShutdown: () => void;
} {
  const config = loadWorkerConfig(env);
  let shuttingDown = false;

  return {
    config,
    getHealthState(): WorkerRuntimeState {
      return {
        service: 'judge-worker',
        status: shuttingDown ? 'shutting_down' : 'ok',
        ready: !shuttingDown,
        queueConfigured: Boolean(config.SQS_QUEUE_URL),
      };
    },
    initiateShutdown(): void {
      shuttingDown = true;
    },
  };
}

const isMainModule =
  typeof process !== 'undefined' &&
  Array.isArray(process.argv) &&
  Boolean(process.argv[1]?.endsWith('index.ts') || process.argv[1]?.endsWith('index.js'));

if (isMainModule) {
  const runtime = createWorkerRuntime();
  console.log(
    `DevArena judge-worker foundation ready (env=${runtime.config.NODE_ENV}, concurrency=${runtime.config.WORKER_CONCURRENCY}).`,
  );

  const handleSignal = (signal: string): void => {
    console.log(`Received ${signal}; shutting down judge-worker.`);
    runtime.initiateShutdown();
    process.exit(0);
  };

  process.on('SIGTERM', () => handleSignal('SIGTERM'));
  process.on('SIGINT', () => handleSignal('SIGINT'));
}
