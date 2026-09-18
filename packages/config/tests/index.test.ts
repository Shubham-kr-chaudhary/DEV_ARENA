import { describe, expect, it } from 'vitest';
import { loadServerConfig } from '../src/index.js';

describe('server configuration', () => {
  it('provides safe development defaults', () => {
    const config = loadServerConfig({});

    expect(config.API_HOST).toBe('127.0.0.1');
    expect(config.API_PORT).toBe(4000);
    expect(config.CORS_ORIGIN).toBe('http://localhost:3000');
  });
});
