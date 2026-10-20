import { describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  healthResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  paginationQuerySchema,
  readinessResponseSchema,
  registerRequestSchema,
} from '../src/index.js';

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

  it('validates readiness responses for ready and not_ready states', () => {
    expect(
      readinessResponseSchema.parse({
        status: 'ready',
        service: 'api',
        checks: {
          database: 'up',
        },
      }),
    ).toEqual({
      status: 'ready',
      service: 'api',
      checks: {
        database: 'up',
      },
    });

    expect(
      readinessResponseSchema.parse({
        status: 'not_ready',
        service: 'api',
        checks: {
          database: 'down',
        },
      }),
    ).toEqual({
      status: 'not_ready',
      service: 'api',
      checks: {
        database: 'down',
      },
    });
  });

  it('validates standardized error envelopes and pagination defaults', () => {
    expect(paginationQuerySchema.parse({})).toEqual({
      page: 1,
      pageSize: 20,
    });

    expect(
      apiErrorResponseSchema.parse({
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request payload',
          details: [{ field: 'slug', message: 'Required' }],
        },
      }),
    ).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Invalid request payload',
        details: [{ field: 'slug', message: 'Required' }],
      },
    });
  });

  it('normalizes and validates registration, login, and authenticated session payloads', () => {
    const parsedRegister = registerRequestSchema.parse({
      email: '  Alice.Dev@Example.COM ',
      username: 'alice_dev_01',
      password: 'correct-horse-battery-staple',
      displayName: 'Alice Developer',
    });

    expect(parsedRegister.email).toBe('alice.dev@example.com');
    expect(parsedRegister.username).toBe('alice_dev_01');

    expect(() =>
      registerRequestSchema.parse({
        email: 'not-an-email',
        username: 'ab',
        password: 'short',
      }),
    ).toThrow();

    const parsedLogin = loginRequestSchema.parse({
      email: ' BOB@Example.com ',
      password: 'secret-password-123',
    });
    expect(parsedLogin.email).toBe('bob@example.com');

    const sessionPayload = authSessionResponseSchema.parse({
      user: {
        id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
        email: 'alice.dev@example.com',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: '2026-10-17T10:00:00.000Z',
        updatedAt: '2026-10-17T10:00:00.000Z',
        profile: {
          id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
          username: 'alice_dev_01',
          displayName: 'Alice Developer',
          bio: null,
          avatarUrl: null,
          rating: 1200,
          maxRating: 1200,
          rankTitle: 'Unrated',
          solvedCount: 0,
          attemptedCount: 0,
          contestCount: 0,
        },
      },
    });
    expect(sessionPayload.user.role).toBe('USER');
    expect(logoutResponseSchema.parse({ status: 'logged_out' })).toEqual({
      status: 'logged_out',
    });
  });
});
