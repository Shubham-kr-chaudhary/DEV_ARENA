import { describe, expect, it } from 'vitest';
import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  createProblemRequestSchema,
  healthResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  paginationQuerySchema,
  problemListQuerySchema,
  publicProblemDetailResponseSchema,
  readinessResponseSchema,
  registerRequestSchema,
  replaceProblemTestCasesRequestSchema,
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

  it('validates Phase 4 problem catalogue queries, detail contracts, and admin inputs', () => {
    const query = problemListQuerySchema.parse({
      page: '2',
      pageSize: '15',
      difficulty: 'MEDIUM',
      tag: 'dynamic-programming',
      sortBy: 'difficulty',
      sortOrder: 'asc',
    });
    expect(query).toEqual({
      page: 2,
      pageSize: 15,
      difficulty: 'MEDIUM',
      tag: 'dynamic-programming',
      sortBy: 'difficulty',
      sortOrder: 'asc',
    });

    // Rejects hidden test cases in public problem detail responses
    expect(() =>
      publicProblemDetailResponseSchema.parse({
        problem: {
          id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
          slug: 'two-sum-indices',
          title: 'Two Sum Indices',
          statement: 'Find two 1-based indices that sum to target.',
          inputFormat: 'n and t',
          outputFormat: 'i and j',
          constraints: '2 <= n <= 2e5',
          examples: [{ input: '4 9\n2 7 11 15', output: '1 2' }],
          explanation: 'Use a hash map.',
          difficulty: 'EASY',
          timeLimitMs: 1500,
          memoryLimitMb: 256,
          outputLimitBytes: 1048576,
          sourceSizeLimitBytes: 65536,
          comparisonMode: 'TRIM_WHITESPACE',
          floatTolerance: null,
          publishedAt: '2026-10-17T10:00:00.000Z',
          tags: [],
          supportedLanguages: [],
          publicTestCases: [
            {
              id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
              sequence: 1,
              input: 'secret',
              expectedOutput: 'secret',
              explanation: null,
              isPublic: false,
            },
          ],
          userProgressStatus: 'UNSOLVED',
        },
      }),
    ).toThrow();

    // Requires floatTolerance when comparisonMode is FLOAT_TOLERANCE
    expect(() =>
      createProblemRequestSchema.parse({
        slug: 'circle-area',
        title: 'Circle Area',
        statement: 'Compute the area of a circle of radius r.',
        inputFormat: 'Single float r',
        outputFormat: 'Area with 1e-6 precision',
        difficulty: 'EASY',
        comparisonMode: 'FLOAT_TOLERANCE',
      }),
    ).toThrow();

    // Rejects duplicate sequence numbers in test case replacement
    expect(() =>
      replaceProblemTestCasesRequestSchema.parse({
        testCases: [
          { sequence: 1, input: '1\n', expectedOutput: '1\n', isPublic: true },
          { sequence: 1, input: '2\n', expectedOutput: '2\n', isPublic: false },
        ],
      }),
    ).toThrow();
  });
});
