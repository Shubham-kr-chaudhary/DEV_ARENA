import { describe, expect, it } from 'vitest';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import {
  AuditRepository,
  computeEffectiveContestStatus,
  ContestRepository,
  isValidSubmissionStateTransition,
  LeaderboardRepository,
  mapPrismaRepositoryError,
  normalizePagination,
  ProblemRepository,
  RepositoryError,
  resolveRankTitleFromRating,
  sanitizeAuditMetadata,
  SubmissionRepository,
  UserRepository,
} from '../src/repositories/index.js';

describe('Repository utilities and error boundaries', () => {
  it('normalizes pagination parameters and clamps out-of-range page sizes', () => {
    expect(normalizePagination()).toEqual({
      page: 1,
      pageSize: 20,
      skip: 0,
      take: 20,
    });

    expect(normalizePagination({ page: -3, pageSize: 500 })).toEqual({
      page: 1,
      pageSize: 100,
      skip: 0,
      take: 100,
    });

    expect(normalizePagination({ page: 3, pageSize: 15 })).toEqual({
      page: 3,
      pageSize: 15,
      skip: 30,
      take: 15,
    });
  });

  it('maps Prisma unique and not-found error codes to deterministic RepositoryError instances', () => {
    const uniqueErr = mapPrismaRepositoryError({ code: 'P2002' }, 'Fallback');
    expect(uniqueErr).toBeInstanceOf(RepositoryError);
    expect(uniqueErr.code).toBe('CONFLICT');

    const notFoundErr = mapPrismaRepositoryError({ code: 'P2025' }, 'Fallback');
    expect(notFoundErr.code).toBe('NOT_FOUND');

    const fkErr = mapPrismaRepositoryError({ code: 'P2003' }, 'Fallback');
    expect(fkErr.code).toBe('CONFLICT');
  });

  it('redacts sensitive secrets from audit log metadata', () => {
    const sanitized = sanitizeAuditMetadata({
      slug: 'two-sum-indices',
      password: 'plain-secret-password',
      passwordHash: '$scrypt$hash',
      nested: {
        token: 'raw-session-token',
        safeField: 42,
      },
    });

    expect(sanitized).toEqual({
      slug: 'two-sum-indices',
      password: '[REDACTED]',
      passwordHash: '[REDACTED]',
      nested: {
        token: '[REDACTED]',
        safeField: 42,
      },
    });
  });
});

describe('UserRepository', () => {
  it('evaluates active sessions and rejects expired, revoked, or suspended accounts', async () => {
    const now = new Date('2026-10-17T10:00:00.000Z');
    const future = new Date('2026-10-24T10:00:00.000Z');
    const past = new Date('2026-10-10T10:00:00.000Z');

    let mockSessionRecord: {
      id: string;
      expiresAt: Date;
      revokedAt: Date | null;
      user: {
        id: string;
        email: string;
        role: 'USER' | 'ADMIN';
        status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
        createdAt: Date;
        updatedAt: Date;
        profile: null;
      };
    } | null = {
      id: 'sess-1',
      expiresAt: future,
      revokedAt: null,
      user: {
        id: 'user-1',
        email: 'alice@dev.devarena.local',
        role: 'USER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        profile: null,
      },
    };

    const fakePrisma = {
      session: {
        findUnique: async () => mockSessionRecord,
      },
    } as unknown as PrismaClient;

    const repo = new UserRepository(fakePrisma);

    const active = await repo.findActiveSessionByTokenHash('hash-1', now);
    expect(active?.sessionId).toBe('sess-1');
    expect(active?.user.email).toBe('alice@dev.devarena.local');

    // Expired session returns null
    mockSessionRecord = { ...mockSessionRecord, expiresAt: past };
    await expect(repo.findActiveSessionByTokenHash('hash-1', now)).resolves.toBeNull();

    // Revoked session returns null
    mockSessionRecord = { ...mockSessionRecord, expiresAt: future, revokedAt: now };
    await expect(repo.findActiveSessionByTokenHash('hash-1', now)).resolves.toBeNull();

    // Suspended user throws FORBIDDEN
    mockSessionRecord = {
      ...mockSessionRecord,
      revokedAt: null,
      user: { ...mockSessionRecord.user, status: 'SUSPENDED' },
    };
    await expect(repo.findActiveSessionByTokenHash('hash-1', now)).rejects.toMatchObject({
      code: 'FORBIDDEN',
    });
  });
});

describe('ProblemRepository security and publication boundaries', () => {
  it('exposes only public test cases on findPublishedProblemBySlug', async () => {
    const fakePrisma = {
      problem: {
        findFirst: async () => ({
          id: 'prob-1',
          slug: 'two-sum-indices',
          title: 'Two Sum Indices',
          statement: 'Find two indices.',
          inputFormat: 'n and t',
          outputFormat: 'i and j',
          constraints: 'n <= 2e5',
          examples: [],
          explanation: 'Use hash map',
          difficulty: 'EASY' as const,
          timeLimitMs: 1500,
          memoryLimitMb: 256,
          outputLimitBytes: 1048576,
          sourceSizeLimitBytes: 65536,
          publishedAt: new Date('2026-09-22T12:00:00.000Z'),
          tags: [{ tag: { id: 'tag-1', slug: 'arrays', name: 'Arrays' } }],
          testCases: [
            {
              id: 'tc-public',
              sequence: 1,
              input: '4 9\n2 7 11 15\n',
              expectedOutput: '1 2\n',
              explanation: 'Sample 1',
              isPublic: true,
            },
            {
              id: 'tc-hidden-accidental',
              sequence: 2,
              input: 'secret-input',
              expectedOutput: 'secret-output',
              explanation: null,
              isPublic: false,
            },
          ],
        }),
      },
    } as unknown as PrismaClient;

    const repo = new ProblemRepository(fakePrisma);
    const detail = await repo.findPublishedProblemBySlug('two-sum-indices');

    expect(detail).not.toBeNull();
    expect(detail?.publicTestCases).toHaveLength(1);
    expect(detail?.publicTestCases[0]?.id).toBe('tc-public');
  });

  it('enforces admin role and requires both public and hidden test cases before publishing', async () => {
    const fakePrisma = {
      $transaction: async <T>(fn: (tx: unknown) => Promise<T>) =>
        fn({
          problem: {
            findUnique: async () => ({
              id: 'prob-1',
              slug: 'draft-prob',
              status: 'DRAFT',
              publishedAt: null,
              testCases: [{ isPublic: true }], // Missing hidden test case!
            }),
          },
        }),
    } as unknown as PrismaClient;

    const repo = new ProblemRepository(fakePrisma);

    await expect(
      repo.transitionProblemStatusForAdmin(
        { userId: 'user-1', role: 'USER' },
        'prob-1',
        'PUBLISHED',
      ),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    await expect(
      repo.transitionProblemStatusForAdmin(
        { userId: 'admin-1', role: 'ADMIN' },
        'prob-1',
        'PUBLISHED',
      ),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
  });
});

describe('SubmissionRepository state machine, idempotency, and IDOR/hidden test protection', () => {
  it('validates legal and illegal submission state transitions', () => {
    expect(isValidSubmissionStateTransition('QUEUED', 'RUNNING')).toBe(true);
    expect(isValidSubmissionStateTransition('RUNNING', 'ACCEPTED')).toBe(true);
    expect(isValidSubmissionStateTransition('RUNNING', 'COMPILATION_ERROR')).toBe(true);
    expect(isValidSubmissionStateTransition('RUNNING', 'INTERNAL_ERROR')).toBe(true);
    expect(isValidSubmissionStateTransition('RUNNING', 'QUEUED')).toBe(true);

    // Terminal verdicts cannot transition back to RUNNING or ACCEPTED
    expect(isValidSubmissionStateTransition('ACCEPTED', 'WRONG_ANSWER')).toBe(false);
    expect(isValidSubmissionStateTransition('COMPILATION_ERROR', 'RUNNING')).toBe(false);
    expect(isValidSubmissionStateTransition('QUEUED', 'ACCEPTED')).toBe(false);
  });

  it('prevents IDOR access by other users and strips hidden test details for non-admin owners', async () => {
    const now = new Date('2026-10-17T12:00:00.000Z');
    const fakePrisma = {
      submission: {
        findUnique: async () => ({
          id: 'sub-1',
          userId: 'owner-user-id',
          problemId: 'prob-1',
          languageId: 'lang-cpp',
          contestId: null,
          sourceCode: 'int main() { return 0; }',
          status: 'WRONG_ANSWER' as const,
          source: 'SUBMIT' as const,
          mode: 'PRACTICE' as const,
          score: 50,
          passedTests: 1,
          totalTests: 2,
          executionTimeMs: 12,
          memoryUsedKb: 4096,
          errorMessage: null,
          queuedAt: now,
          startedAt: now,
          finishedAt: now,
          createdAt: now,
          updatedAt: now,
          testResults: [
            {
              id: 'tr-1',
              testCaseId: 'tc-1',
              status: 'ACCEPTED' as const,
              executionTimeMs: 5,
              memoryUsedKb: 2048,
              actualOutput: '1 2\n',
              errorMessage: null,
              testCase: {
                sequence: 1,
                isPublic: true,
                input: '4 9\n2 7 11 15\n',
                expectedOutput: '1 2\n',
              },
            },
            {
              id: 'tr-2',
              testCaseId: 'tc-2',
              status: 'WRONG_ANSWER' as const,
              executionTimeMs: 7,
              memoryUsedKb: 4096,
              actualOutput: 'wrong-secret-output\n',
              errorMessage: 'Mismatch on hidden case',
              testCase: {
                sequence: 2,
                isPublic: false,
                input: 'hidden-secret-input\n',
                expectedOutput: 'hidden-secret-expected\n',
              },
            },
          ],
        }),
      },
    } as unknown as PrismaClient;

    const repo = new SubmissionRepository(fakePrisma);

    // 1. Different normal user is blocked with FORBIDDEN (IDOR protection)
    await expect(
      repo.findSubmissionByIdForActor('sub-1', { userId: 'other-user-id', role: 'USER' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // 2. Submission owner receives public test details, but hidden test case I/O is masked (null)
    const ownerView = await repo.findSubmissionByIdForActor('sub-1', {
      userId: 'owner-user-id',
      role: 'USER',
    });
    expect(ownerView?.testResults).toHaveLength(2);
    expect(ownerView?.testResults[0]?.input).toBe('4 9\n2 7 11 15\n');
    expect(ownerView?.testResults[0]?.expectedOutput).toBe('1 2\n');
    expect(ownerView?.testResults[0]?.actualOutput).toBe('1 2\n');

    expect(ownerView?.testResults[1]?.isPublic).toBe(false);
    expect(ownerView?.testResults[1]?.status).toBe('WRONG_ANSWER');
    expect(ownerView?.testResults[1]?.input).toBeNull();
    expect(ownerView?.testResults[1]?.expectedOutput).toBeNull();
    expect(ownerView?.testResults[1]?.actualOutput).toBeNull();
    expect(ownerView?.testResults[1]?.errorMessage).toBeNull();

    // 3. Admin can inspect hidden test case details for debugging
    const adminView = await repo.findSubmissionByIdForActor('sub-1', {
      userId: 'admin-id',
      role: 'ADMIN',
    });
    expect(adminView?.testResults[1]?.expectedOutput).toBe('hidden-secret-expected\n');
  });
});

describe('ContestRepository and LeaderboardRepository domain rules', () => {
  it('computes authoritative contest states server-side from schedule timestamps', () => {
    const startsAt = new Date('2026-10-20T14:00:00.000Z');
    const endsAt = new Date('2026-10-20T16:00:00.000Z');

    expect(
      computeEffectiveContestStatus(
        { status: 'UPCOMING', startsAt, endsAt },
        new Date('2026-10-20T13:59:59.000Z'),
      ),
    ).toBe('UPCOMING');

    expect(
      computeEffectiveContestStatus(
        { status: 'UPCOMING', startsAt, endsAt },
        new Date('2026-10-20T15:00:00.000Z'),
      ),
    ).toBe('RUNNING');

    expect(
      computeEffectiveContestStatus(
        { status: 'RUNNING', startsAt, endsAt },
        new Date('2026-10-20T16:00:01.000Z'),
      ),
    ).toBe('ENDED');

    expect(
      computeEffectiveContestStatus(
        { status: 'CANCELLED', startsAt, endsAt },
        new Date('2026-10-20T15:00:00.000Z'),
      ),
    ).toBe('CANCELLED');
  });

  it('conceals contest problems from non-admin users before contest startsAt', async () => {
    const startsAt = new Date('2026-10-20T14:00:00.000Z');
    const endsAt = new Date('2026-10-20T16:00:00.000Z');
    const beforeStart = new Date('2026-10-20T12:00:00.000Z');

    const fakePrisma = {
      contest: {
        findUnique: async () => ({
          id: 'contest-1',
          slug: 'weekly-arena-1',
          title: 'Weekly Arena 1',
          description: 'Competitive round',
          status: 'UPCOMING' as const,
          startsAt,
          endsAt,
          _count: { participants: 12 },
          problems: [
            {
              order: 1,
              points: 100,
              problem: {
                id: 'prob-1',
                slug: 'two-sum-indices',
                title: 'Two Sum Indices',
                difficulty: 'EASY' as const,
              },
            },
          ],
        }),
      },
      contestParticipant: {
        findUnique: async () => ({ userId: 'user-1' }),
      },
    } as unknown as PrismaClient;

    const repo = new ContestRepository(fakePrisma);

    const userUpcomingView = await repo.findContestBySlugForActor(
      'weekly-arena-1',
      { userId: 'user-1', role: 'USER' },
      beforeStart,
    );
    expect(userUpcomingView?.effectiveStatus).toBe('UPCOMING');
    expect(userUpcomingView?.problems).toEqual([]);

    const adminUpcomingView = await repo.findContestBySlugForActor(
      'weekly-arena-1',
      { userId: 'admin-1', role: 'ADMIN' },
      beforeStart,
    );
    expect(adminUpcomingView?.problems).toHaveLength(1);
  });

  it('resolves competitive rank titles from ratings and guards AuditRepository admin access', async () => {
    expect(resolveRankTitleFromRating(1150)).toBe('Newbie');
    expect(resolveRankTitleFromRating(1250)).toBe('Pupil');
    expect(resolveRankTitleFromRating(1450)).toBe('Specialist');
    expect(resolveRankTitleFromRating(1650)).toBe('Expert');
    expect(resolveRankTitleFromRating(1950)).toBe('Candidate Master');
    expect(resolveRankTitleFromRating(2150)).toBe('Master');
    expect(resolveRankTitleFromRating(2450)).toBe('Grandmaster');

    const auditRepo = new AuditRepository({} as unknown as PrismaClient);
    await expect(
      auditRepo.listAuditLogsForAdmin({ userId: 'u1', role: 'USER' }),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    const leaderboardRepo = new LeaderboardRepository({
      profile: {
        findMany: async () => [
          {
            userId: 'u1',
            username: 'alice_dev',
            displayName: 'Alice',
            avatarUrl: null,
            rating: 1520,
            maxRating: 1560,
            rankTitle: 'Specialist',
            solvedCount: 2,
            contestCount: 1,
          },
        ],
        count: async () => 1,
      },
    } as unknown as PrismaClient);

    const board = await leaderboardRepo.getGlobalLeaderboard({ page: 1, pageSize: 10 });
    expect(board.items[0]?.rank).toBe(1);
    expect(board.items[0]?.username).toBe('alice_dev');
  });
});
