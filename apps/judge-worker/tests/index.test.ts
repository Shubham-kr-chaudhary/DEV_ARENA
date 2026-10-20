import { describe, expect, it } from 'vitest';
import { createWorkerRuntime } from '../src/index.js';

describe('judge-worker foundation', () => {
  it('initializes worker runtime state with validated configuration', () => {
    const runtime = createWorkerRuntime({
      NODE_ENV: 'development',
      WORKER_CONCURRENCY: '4',
    });

    expect(runtime.config.WORKER_CONCURRENCY).toBe(4);
    expect(runtime.getHealthState()).toEqual({
      service: 'judge-worker',
      status: 'ok',
      ready: true,
      queueConfigured: false,
    });
  });

  it('transitions readiness state cleanly on shutdown', () => {
    const runtime = createWorkerRuntime({
      NODE_ENV: 'development',
      SQS_QUEUE_URL: 'https://sqs.ap-south-1.amazonaws.com/123456789012/devarena-judge',
    });

    expect(runtime.getHealthState().queueConfigured).toBe(true);
    runtime.initiateShutdown();
    expect(runtime.getHealthState()).toEqual({
      service: 'judge-worker',
      status: 'shutting_down',
      ready: false,
      queueConfigured: true,
    });
  });
});
