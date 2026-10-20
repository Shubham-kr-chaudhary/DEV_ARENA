import { describe, expect, it } from 'vitest';
import {
  hashDevelopmentPassword,
  resolveSeedConfiguration,
  runDevelopmentSeed,
} from '../prisma/seed.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';

describe('Development seed script (prisma/seed.ts)', () => {
  it('refuses to run in production environments', () => {
    expect(() =>
      resolveSeedConfiguration({
        NODE_ENV: 'production',
        SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
      }),
    ).toThrow(/Refusing to execute development seed script in production/);
  });

  it('produces deterministic scrypt password hashes without storing plaintext', () => {
    const hash1 = hashDevelopmentPassword(
      'devarena-local-dev-password',
      'admin@dev.devarena.local',
    );
    const hash2 = hashDevelopmentPassword(
      'devarena-local-dev-password',
      'admin@dev.devarena.local',
    );
    const differentUserHash = hashDevelopmentPassword(
      'devarena-local-dev-password',
      'alice@dev.devarena.local',
    );

    expect(hash1).toBe(hash2);
    expect(hash1).not.toBe(differentUserHash);
    expect(hash1.startsWith('$scrypt$n=16384,r=8,p=1$')).toBe(true);
    expect(hash1).not.toContain('devarena-local-dev-password');
  });

  it('is idempotent across repeated invocations and seeds both public and hidden test cases', async () => {
    const usersByEmail = new Map<string, { id: string; email: string }>();
    const profilesByUserId = new Map<string, { id: string; username: string }>();
    const languagesBySlug = new Map<string, { id: string; slug: string }>();
    const tagsBySlug = new Map<string, { id: string; slug: string }>();
    const problemsBySlug = new Map<string, { id: string; slug: string }>();
    const problemTags = new Set<string>();
    const testCasesByKey = new Map<string, { isPublic: boolean }>();

    const mockPrisma = {
      user: {
        upsert: async ({
          where,
          create,
        }: {
          where: { email: string };
          create: { email: string };
        }) => {
          const existing = usersByEmail.get(where.email);
          if (existing) {
            return existing;
          }
          const created = { id: `user-${usersByEmail.size + 1}`, email: create.email };
          usersByEmail.set(where.email, created);
          return created;
        },
      },
      profile: {
        upsert: async ({
          where,
          create,
        }: {
          where: { userId: string };
          create: { username: string };
        }) => {
          const existing = profilesByUserId.get(where.userId);
          if (existing) {
            return existing;
          }
          const created = { id: `profile-${profilesByUserId.size + 1}`, username: create.username };
          profilesByUserId.set(where.userId, created);
          return created;
        },
      },
      language: {
        upsert: async ({
          where,
          create,
        }: {
          where: { slug: string };
          create: { slug: string };
        }) => {
          const existing = languagesBySlug.get(where.slug);
          if (existing) {
            return existing;
          }
          const created = { id: `lang-${languagesBySlug.size + 1}`, slug: create.slug };
          languagesBySlug.set(where.slug, created);
          return created;
        },
      },
      tag: {
        upsert: async ({
          where,
          create,
        }: {
          where: { slug: string };
          create: { slug: string };
        }) => {
          const existing = tagsBySlug.get(where.slug);
          if (existing) {
            return existing;
          }
          const created = { id: `tag-${tagsBySlug.size + 1}`, slug: create.slug };
          tagsBySlug.set(where.slug, created);
          return created;
        },
      },
      problem: {
        upsert: async ({
          where,
          create,
        }: {
          where: { slug: string };
          create: { slug: string };
        }) => {
          const existing = problemsBySlug.get(where.slug);
          if (existing) {
            return existing;
          }
          const created = { id: `prob-${problemsBySlug.size + 1}`, slug: create.slug };
          problemsBySlug.set(where.slug, created);
          return created;
        },
      },
      problemTag: {
        upsert: async ({
          where,
        }: {
          where: { problemId_tagId: { problemId: string; tagId: string } };
        }) => {
          const key = `${where.problemId_tagId.problemId}:${where.problemId_tagId.tagId}`;
          problemTags.add(key);
          return where.problemId_tagId;
        },
      },
      testCase: {
        upsert: async ({
          where,
          create,
        }: {
          where: { problemId_sequence: { problemId: string; sequence: number } };
          create: { isPublic: boolean };
        }) => {
          const key = `${where.problemId_sequence.problemId}:${where.problemId_sequence.sequence}`;
          testCasesByKey.set(key, { isPublic: create.isPublic });
          return { id: key };
        },
      },
    } as unknown as PrismaClient;

    const firstRun = await runDevelopmentSeed(mockPrisma, { NODE_ENV: 'development' });
    const secondRun = await runDevelopmentSeed(mockPrisma, { NODE_ENV: 'development' });

    expect(firstRun).toEqual(secondRun);
    expect(usersByEmail.size).toBe(3);
    expect(languagesBySlug.has('cpp')).toBe(true);
    expect(languagesBySlug.has('javascript')).toBe(true);
    expect(tagsBySlug.size).toBe(10);
    expect(problemsBySlug.size).toBe(4);
    expect(testCasesByKey.size).toBe(firstRun.testCasesCount);

    const allTestCases = Array.from(testCasesByKey.values());
    expect(allTestCases.some((tc) => tc.isPublic)).toBe(true);
    expect(allTestCases.some((tc) => !tc.isPublic)).toBe(true);
  });
});
