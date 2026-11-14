import { describe, expect, it } from 'vitest';
import { loadServerConfig, loadWorkerConfig } from '../src/index.js';

describe('server configuration', () => {
  it('provides safe development defaults', () => {
    const config = loadServerConfig({});

    expect(config.NODE_ENV).toBe('development');
    expect(config.API_HOST).toBe('127.0.0.1');
    expect(config.API_PORT).toBe(4000);
    expect(config.CORS_ORIGIN).toBe('http://localhost:3000');
    expect(config.DATABASE_URL).toBe('postgresql://devarena:devarena@localhost:5432/devarena');
    expect(config.SESSION_COOKIE_NAME).toBe('devarena_session');
    expect(config.SESSION_TTL_SECONDS).toBe(604800);
    expect(config.TRUST_PROXY).toBe(false);
    expect(config.AUTH_RATE_LIMIT_WINDOW_MS).toBe(900000);
    expect(config.AUTH_REGISTER_RATE_LIMIT_MAX).toBe(5);
    expect(config.AUTH_LOGIN_RATE_LIMIT_MAX).toBe(10);
    expect(config.AWS_REGION).toBe('ap-south-1');
    expect(config.SQS_QUEUE_URL).toBeUndefined();
    expect(config.SQS_DLQ_URL).toBeUndefined();
    expect(config.S3_BUCKET).toBeUndefined();
  });

  it('normalizes empty optional environment variables from .env.example', () => {
    const config = loadServerConfig({
      SQS_QUEUE_URL: '',
      SQS_DLQ_URL: '   ',
      S3_BUCKET: '',
      TRUST_PROXY: 'true',
    });

    expect(config.SQS_QUEUE_URL).toBeUndefined();
    expect(config.SQS_DLQ_URL).toBeUndefined();
    expect(config.S3_BUCKET).toBeUndefined();
    expect(config.TRUST_PROXY).toBe(true);
  });

  it('rejects placeholder or short SESSION_SECRET in production', () => {
    expect(() =>
      loadServerConfig({
        NODE_ENV: 'production',
        SESSION_SECRET: 'replace-with-a-local-development-secret',
      }),
    ).toThrow();

    const prodConfig = loadServerConfig({
      NODE_ENV: 'production',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
    });

    expect(prodConfig.NODE_ENV).toBe('production');
  });
});

describe('worker configuration', () => {
  it('provides safe development defaults for judge-worker', () => {
    const workerConfig = loadWorkerConfig({});

    expect(workerConfig.NODE_ENV).toBe('development');
    expect(workerConfig.AWS_REGION).toBe('ap-south-1');
    expect(workerConfig.WORKER_CONCURRENCY).toBe(2);
    expect(workerConfig.WORKER_POLL_WAIT_SECONDS).toBe(20);
    expect(workerConfig.WORKER_HEALTH_PORT).toBe(4001);
  });

  it('requires SQS_QUEUE_URL in production', () => {
    expect(() =>
      loadWorkerConfig({
        NODE_ENV: 'production',
      }),
    ).toThrow();
  });
});
