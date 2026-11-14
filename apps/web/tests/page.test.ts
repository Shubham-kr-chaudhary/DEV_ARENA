import { describe, expect, it } from 'vitest';
import { ApiClientError, createApiClient } from '../lib/api-client.js';

describe('web foundation & typed API client', () => {
  it('sends credentials: include on auth requests and parses session user payloads', async () => {
    let capturedUrl = '';
    let capturedInit: RequestInit | undefined;

    const client = createApiClient({
      baseUrl: 'http://localhost:4000/',
      fetchImpl: async (input, init) => {
        capturedUrl = String(input);
        capturedInit = init;
        return new Response(
          JSON.stringify({
            user: {
              id: '9b1deb4d-3b7d-4bad-9bdd-2b0d7b3dcb6d',
              email: 'alice@dev.devarena.local',
              role: 'USER',
              status: 'ACTIVE',
              createdAt: '2026-10-17T10:00:00.000Z',
              updatedAt: '2026-10-17T10:00:00.000Z',
              profile: {
                id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
                username: 'alice_dev',
                displayName: 'Alice',
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
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const user = await client.login({
      email: 'Alice@Dev.DevArena.Local',
      password: 'valid-password-123',
    });

    expect(capturedUrl).toBe('http://localhost:4000/api/v1/auth/login');
    expect(capturedInit?.credentials).toBe('include');
    expect(user.email).toBe('alice@dev.devarena.local');
  });

  it('returns null from getCurrentUser on 401 and throws ApiClientError on errors', async () => {
    const unauthClient = createApiClient({
      baseUrl: 'http://localhost:4000',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHORIZED',
              message: 'Authentication is required.',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await expect(unauthClient.getCurrentUser()).resolves.toBeNull();

    const rateLimitedClient = createApiClient({
      baseUrl: 'http://localhost:4000',
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              code: 'RATE_LIMITED',
              message: 'Too many requests.',
            },
          }),
          { status: 429, headers: { 'Content-Type': 'application/json' } },
        ),
    });

    await expect(
      rateLimitedClient.login({ email: 'a@b.com', password: 'password123' }),
    ).rejects.toBeInstanceOf(ApiClientError);
  });

  it('fetches published problems with filters and validates problem detail contracts', async () => {
    const requestedUrls: string[] = [];

    const client = createApiClient({
      baseUrl: 'http://localhost:4000',
      fetchImpl: async (input) => {
        const url = String(input);
        requestedUrls.push(url);

        if (url.includes('/api/v1/problems/two-sum-indices')) {
          return new Response(
            JSON.stringify({
              problem: {
                id: '10000000-0000-4000-8000-000000000001',
                slug: 'two-sum-indices',
                title: 'Two Sum Indices',
                statement: 'Find two 1-based indices that sum to t.',
                inputFormat: 'n and t',
                outputFormat: 'i and j',
                constraints: '2 <= n <= 200000',
                examples: [{ input: '4 9\n2 7 11 15', output: '1 2' }],
                explanation: 'Hash map lookup.',
                difficulty: 'EASY',
                timeLimitMs: 1500,
                memoryLimitMb: 256,
                outputLimitBytes: 1048576,
                sourceSizeLimitBytes: 65536,
                comparisonMode: 'TRIM_WHITESPACE',
                floatTolerance: null,
                publishedAt: '2026-10-15T10:00:00.000Z',
                tags: [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    slug: 'arrays',
                    name: 'Arrays',
                  },
                ],
                supportedLanguages: [
                  {
                    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
                    slug: 'cpp',
                    name: 'C++20 (GCC 14.2.0)',
                    version: '14.2.0',
                    isActive: true,
                  },
                ],
                publicTestCases: [
                  {
                    id: '20000000-0000-4000-8000-000000000001',
                    sequence: 1,
                    input: '4 9\n2 7 11 15\n',
                    expectedOutput: '1 2\n',
                    explanation: 'Sample 1',
                    isPublic: true,
                  },
                ],
                userProgressStatus: 'SOLVED',
              },
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          );
        }

        return new Response(
          JSON.stringify({
            items: [
              {
                id: '10000000-0000-4000-8000-000000000001',
                slug: 'two-sum-indices',
                title: 'Two Sum Indices',
                difficulty: 'EASY',
                publishedAt: '2026-10-15T10:00:00.000Z',
                tags: [
                  {
                    id: '11111111-1111-4111-8111-111111111111',
                    slug: 'arrays',
                    name: 'Arrays',
                  },
                ],
                userProgressStatus: 'SOLVED',
              },
            ],
            meta: {
              page: 1,
              pageSize: 20,
              totalItems: 1,
              totalPages: 1,
            },
            availableTags: [
              {
                id: '11111111-1111-4111-8111-111111111111',
                slug: 'arrays',
                name: 'Arrays',
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      },
    });

    const listResponse = await client.listProblems({
      difficulty: 'EASY',
      tag: 'arrays',
      search: 'two-sum',
    });

    expect(listResponse.items).toHaveLength(1);
    expect(listResponse.items[0]?.slug).toBe('two-sum-indices');
    expect(requestedUrls[0]).toContain('difficulty=EASY');
    expect(requestedUrls[0]).toContain('tag=arrays');
    expect(requestedUrls[0]).toContain('search=two-sum');

    const detail = await client.getProblemBySlug('two-sum-indices');
    expect(detail.slug).toBe('two-sum-indices');
    expect(detail.publicTestCases).toHaveLength(1);
    expect(detail.publicTestCases[0]?.isPublic).toBe(true);
  });
});
