import { describe, expect, it } from 'vitest';
import { healthResponseSchema } from '../src/index.js';

describe('API contracts', () => {
  it('validates the health response', () => {
    expect(
      healthResponseSchema.parse({
        status: 'ok',
        service: 'api',
      }),
    ).toEqual({
      status: 'ok',
      service: 'api',
    });
  });
});
