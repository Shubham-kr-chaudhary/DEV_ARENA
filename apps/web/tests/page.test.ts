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

  it('returns null from getCurrentUser on 401 and throws ApiClientError on other errors', async () => {
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
});
