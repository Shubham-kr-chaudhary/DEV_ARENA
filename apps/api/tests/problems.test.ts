import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { extractSessionTokenFromCookieHeader } from '../src/auth/index.js';
import type {
  ComparisonMode,
  Difficulty,
  Prisma,
  ProblemStatus,
} from '../src/generated/prisma/client.js';
import {
  buildPaginationMeta,
  normalizePagination,
  RepositoryError,
  type ActiveSessionWithUserDto,
  type AdminProblemDetailRecord,
  type AdminProblemListFilter,
  type AdminProblemSummaryRecord,
  type AdminTestCaseRecord,
  type AuthUserCredentialsRecord,
  type CreateProblemAdminInput,
  type CreateSessionInput,
  type CreateUserWithProfileInput,
  type PaginatedResult,
  type PaginationInput,
  type ProblemCatalogueFilter,
  type ProblemCatalogueItemDto,
  type ProblemTagItemDto,
  type PublicProblemDetailDto,
  type PublicTestCaseDto,
  type RepositoryActor,
  type SafeUserWithProfileDto,
  type SupportedLanguageItemDto,
  type TestCaseAdminInput,
  type UpdateProblemAdminInput,
  type UserSolveProgressStatus,
  assertAdminActor,
} from '../src/repositories/index.js';
import type { AuthUserRepositoryPort } from '../src/services/auth.service.js';
import type { ProblemRepositoryPort } from '../src/services/problem.service.js';

interface StoredUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  passwordHash: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: Date;
  updatedAt: Date;
  profileId: string;
}

interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt: Date | null;
}

interface StoredProblem {
  id: string;
  slug: string;
  title: string;
  statement: string;
  inputFormat: string;
  outputFormat: string;
  constraints: string | null;
  examples: Prisma.JsonValue;
  explanation: string | null;
  editorial: string | null;
  difficulty: Difficulty;
  status: ProblemStatus;
  authorId: string | null;
  timeLimitMs: number;
  memoryLimitMb: number;
  outputLimitBytes: number;
  sourceSizeLimitBytes: number;
  comparisonMode: ComparisonMode;
  floatTolerance: number | null;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  tagIds: string[];
  testCases: AdminTestCaseRecord[];
}

function createInMemoryProblemTestHarness() {
  const now = new Date('2026-10-20T12:00:00.000Z');
  const usersById = new Map<string, StoredUser>();
  const sessionsByTokenHash = new Map<string, StoredSession>();
  const problemsById = new Map<string, StoredProblem>();
  const progressByUserAndProblem = new Map<string, UserSolveProgressStatus>();
  let simulateDatabaseFailure = false;

  const tags: ProblemTagItemDto[] = [
    {
      id: '11111111-1111-4111-8111-111111111111',
      slug: 'arrays',
      name: 'Arrays',
    },
    {
      id: '22222222-2222-4222-8222-222222222222',
      slug: 'hashing',
      name: 'Hashing',
    },
    {
      id: '33333333-3333-4333-8333-333333333333',
      slug: 'dynamic-programming',
      name: 'Dynamic Programming',
    },
    {
      id: '44444444-4444-4444-8444-444444444444',
      slug: 'graphs',
      name: 'Graphs',
    },
  ];

  const languages: SupportedLanguageItemDto[] = [
    {
      id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      slug: 'cpp',
      name: 'C++20 (GCC 14.2.0)',
      version: '14.2.0',
      isActive: true,
    },
    {
      id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      slug: 'javascript',
      name: 'JavaScript (Node.js 22 LTS)',
      version: '22.14.0',
      isActive: true,
    },
  ];

  // Seed published, draft, and archived problems
  const publishedEasyId = '10000000-0000-4000-8000-000000000001';
  const publishedMediumId = '10000000-0000-4000-8000-000000000002';
  const draftHardId = '10000000-0000-4000-8000-000000000003';
  const archivedEasyId = '10000000-0000-4000-8000-000000000004';

  problemsById.set(publishedEasyId, {
    id: publishedEasyId,
    slug: 'two-sum-indices',
    title: 'Two Sum Indices',
    statement: 'Given an array of n integers and target t, find 1-based indices i and j.',
    inputFormat: 'First line n and t. Second line n integers.',
    outputFormat: 'Two space-separated 1-based indices.',
    constraints: '2 <= n <= 200000',
    examples: [
      {
        input: '4 9\n2 7 11 15',
        output: '1 2',
        explanation: 'a[1] + a[2] = 9',
      },
    ],
    explanation: 'Use a hash table to look up complements in O(1).',
    editorial: 'PRIVATE_EDITORIAL_SECRET_HASH_MAP_SOLUTION',
    difficulty: 'EASY',
    status: 'PUBLISHED',
    authorId: null,
    timeLimitMs: 1500,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    floatTolerance: null,
    publishedAt: new Date('2026-10-15T10:00:00.000Z'),
    createdAt: new Date('2026-10-14T10:00:00.000Z'),
    updatedAt: new Date('2026-10-15T10:00:00.000Z'),
    tagIds: [tags[0]!.id, tags[1]!.id],
    testCases: [
      {
        id: '20000000-0000-4000-8000-000000000001',
        sequence: 1,
        input: '4 9\n2 7 11 15\n',
        expectedOutput: '1 2\n',
        explanation: 'Sample test 1',
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        id: '20000000-0000-4000-8000-000000000002',
        sequence: 2,
        input: 'SECRET_HIDDEN_INPUT_999999\n',
        expectedOutput: 'SECRET_HIDDEN_OUTPUT_888888\n',
        explanation: 'Hidden edge case',
        isPublic: false,
        weight: 1,
        group: 'hidden-edge',
      },
    ],
  });

  problemsById.set(publishedMediumId, {
    id: publishedMediumId,
    slug: 'longest-zero-sum-slice',
    title: 'Longest Zero-Sum Slice',
    statement: 'Find the length of the longest contiguous subarray summing to zero.',
    inputFormat: 'Single integer n followed by n space-separated integers.',
    outputFormat: 'Maximum length of zero-sum subarray.',
    constraints: '1 <= n <= 200000',
    examples: [
      {
        input: '6\n1 2 -2 4 -4 3',
        output: '4',
      },
    ],
    explanation: 'Prefix sums.',
    editorial: 'PRIVATE_EDITORIAL_PREFIX_SUMS',
    difficulty: 'MEDIUM',
    status: 'PUBLISHED',
    authorId: null,
    timeLimitMs: 2000,
    memoryLimitMb: 256,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    floatTolerance: null,
    publishedAt: new Date('2026-10-16T10:00:00.000Z'),
    createdAt: new Date('2026-10-16T09:00:00.000Z'),
    updatedAt: new Date('2026-10-16T10:00:00.000Z'),
    tagIds: [tags[0]!.id, tags[2]!.id],
    testCases: [
      {
        id: '20000000-0000-4000-8000-000000000003',
        sequence: 1,
        input: '6\n1 2 -2 4 -4 3\n',
        expectedOutput: '4\n',
        explanation: null,
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
      {
        id: '20000000-0000-4000-8000-000000000004',
        sequence: 2,
        input: 'HIDDEN_ZERO_SUM_INPUT\n',
        expectedOutput: '0\n',
        explanation: null,
        isPublic: false,
        weight: 1,
        group: 'hidden',
      },
    ],
  });

  problemsById.set(draftHardId, {
    id: draftHardId,
    slug: 'directed-cycle-minimum-cut',
    title: 'Directed Cycle Minimum Cut',
    statement: 'Draft problem statement that must never be visible publicly.',
    inputFormat: 'n m',
    outputFormat: 'min weight',
    constraints: 'n <= 500',
    examples: [],
    explanation: null,
    editorial: 'Secret draft editorial',
    difficulty: 'HARD',
    status: 'DRAFT',
    authorId: null,
    timeLimitMs: 3000,
    memoryLimitMb: 512,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    floatTolerance: null,
    publishedAt: null,
    createdAt: new Date('2026-10-17T10:00:00.000Z'),
    updatedAt: new Date('2026-10-17T10:00:00.000Z'),
    tagIds: [tags[3]!.id],
    testCases: [
      {
        id: '20000000-0000-4000-8000-000000000005',
        sequence: 1,
        input: '3 3\n',
        expectedOutput: '4\n',
        explanation: null,
        isPublic: true,
        weight: 1,
        group: 'sample',
      },
    ], // Note: missing hidden test case initially!
  });

  problemsById.set(archivedEasyId, {
    id: archivedEasyId,
    slug: 'legacy-fibonacci-check',
    title: 'Legacy Fibonacci Check',
    statement: 'Archived problem statement.',
    inputFormat: 'n',
    outputFormat: 'YES/NO',
    constraints: 'n <= 100',
    examples: [],
    explanation: null,
    editorial: null,
    difficulty: 'EASY',
    status: 'ARCHIVED',
    authorId: null,
    timeLimitMs: 1000,
    memoryLimitMb: 128,
    outputLimitBytes: 1048576,
    sourceSizeLimitBytes: 65536,
    comparisonMode: 'TRIM_WHITESPACE',
    floatTolerance: null,
    publishedAt: new Date('2026-09-01T10:00:00.000Z'),
    createdAt: new Date('2026-09-01T10:00:00.000Z'),
    updatedAt: new Date('2026-10-01T10:00:00.000Z'),
    tagIds: [],
    testCases: [],
  });

  const toSafeUserDto = (u: StoredUser): SafeUserWithProfileDto => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    profile: {
      id: u.profileId,
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      bio: null,
      avatarUrl: null,
      rating: 1200,
      maxRating: 1200,
      rankTitle: 'Unrated',
      solvedCount: 0,
      attemptedCount: 0,
      contestCount: 0,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    },
  });

  const userRepository: AuthUserRepositoryPort = {
    async createUserWithProfile(
      input: CreateUserWithProfileInput,
    ): Promise<SafeUserWithProfileDto> {
      const email = input.email.trim().toLowerCase();
      const stored: StoredUser = {
        id: randomUUID(),
        email,
        username: input.username.trim(),
        displayName: input.displayName ?? null,
        passwordHash: input.passwordHash ?? null,
        role: input.role ?? 'USER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        profileId: randomUUID(),
      };
      usersById.set(stored.id, stored);
      return toSafeUserDto(stored);
    },
    async findAuthUserByEmail(email: string): Promise<AuthUserCredentialsRecord | null> {
      const normalized = email.trim().toLowerCase();
      for (const u of usersById.values()) {
        if (u.email === normalized) {
          return {
            id: u.id,
            email: u.email,
            passwordHash: u.passwordHash,
            role: u.role,
            status: u.status,
            profile: { username: u.username, displayName: u.displayName },
          };
        }
      }
      return null;
    },
    async findSafeUserById(userId: string): Promise<SafeUserWithProfileDto | null> {
      const u = usersById.get(userId);
      return u ? toSafeUserDto(u) : null;
    },
    async createSession(input: CreateSessionInput): Promise<{ id: string; expiresAt: Date }> {
      const session: StoredSession = {
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        expiresAt: input.expiresAt,
        revokedAt: null,
      };
      sessionsByTokenHash.set(session.tokenHash, session);
      return { id: session.id, expiresAt: session.expiresAt };
    },
    async findActiveSessionByTokenHash(
      tokenHash: string,
      currentNow: Date = now,
    ): Promise<ActiveSessionWithUserDto | null> {
      const session = sessionsByTokenHash.get(tokenHash);
      if (!session || session.revokedAt !== null || session.expiresAt <= currentNow) {
        return null;
      }
      const user = usersById.get(session.userId);
      if (!user) {
        return null;
      }
      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        user: toSafeUserDto(user),
      };
    },
    async revokeSessionByTokenHash(tokenHash: string, revokedAt: Date = now): Promise<boolean> {
      const session = sessionsByTokenHash.get(tokenHash);
      if (!session) {
        return false;
      }
      session.revokedAt = revokedAt;
      return true;
    },
  };

  const resolveTagsByIds = (tagIds: readonly string[]): ProblemTagItemDto[] =>
    tags.filter((t) => tagIds.includes(t.id));

  const resolveTagIdsInput = (
    tagIds?: readonly string[],
    tagSlugs?: readonly string[],
  ): string[] => {
    const set = new Set<string>(tagIds ?? []);
    if (tagSlugs) {
      for (const slug of tagSlugs) {
        const found = tags.find((t) => t.slug === slug);
        if (!found) {
          throw new RepositoryError('VALIDATION_ERROR', `Unknown problem tag slug(s): ${slug}`);
        }
        set.add(found.id);
      }
    }
    return Array.from(set);
  };

  const toAdminDetailRecord = (p: StoredProblem): AdminProblemDetailRecord => ({
    id: p.id,
    slug: p.slug,
    title: p.title,
    statement: p.statement,
    inputFormat: p.inputFormat,
    outputFormat: p.outputFormat,
    constraints: p.constraints,
    examples: p.examples,
    explanation: p.explanation,
    editorial: p.editorial,
    difficulty: p.difficulty,
    status: p.status,
    authorId: p.authorId,
    timeLimitMs: p.timeLimitMs,
    memoryLimitMb: p.memoryLimitMb,
    outputLimitBytes: p.outputLimitBytes,
    sourceSizeLimitBytes: p.sourceSizeLimitBytes,
    comparisonMode: p.comparisonMode,
    floatTolerance: p.floatTolerance,
    publishedAt: p.publishedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    tags: resolveTagsByIds(p.tagIds),
    testCases: [...p.testCases].sort((a, b) => a.sequence - b.sequence),
  });

  const problemRepository: ProblemRepositoryPort = {
    async listAllTags(): Promise<readonly ProblemTagItemDto[]> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError(
          'DATABASE_ERROR',
          'Database failure on postgresql://devarena:secret_pass@10.0.1.9:5432/devarena',
        );
      }
      return [...tags].sort((a, b) => a.name.localeCompare(b.name));
    },

    async listActiveLanguages(): Promise<readonly SupportedLanguageItemDto[]> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError('DATABASE_ERROR', 'Database connection lost');
      }
      return languages.filter((l) => l.isActive);
    },

    async listPublishedProblems(
      filter?: ProblemCatalogueFilter,
      paginationInput?: PaginationInput,
    ): Promise<PaginatedResult<ProblemCatalogueItemDto>> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError(
          'DATABASE_ERROR',
          'SELECT failed on postgresql://devarena:secret_pass@10.0.1.9:5432/devarena',
        );
      }

      const pagination = normalizePagination(paginationInput);
      let list = Array.from(problemsById.values()).filter((p) => p.status === 'PUBLISHED');

      if (filter?.difficulty) {
        list = list.filter((p) => p.difficulty === filter.difficulty);
      }
      if (filter?.tagSlug) {
        list = list.filter((p) =>
          resolveTagsByIds(p.tagIds).some((t) => t.slug === filter.tagSlug),
        );
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
        );
      }

      const getStatus = (problemId: string): UserSolveProgressStatus => {
        if (!filter?.viewerUserId) {
          return 'UNSOLVED';
        }
        return progressByUserAndProblem.get(`${filter.viewerUserId}:${problemId}`) ?? 'UNSOLVED';
      };

      if (filter?.statusFilter) {
        if (!filter.viewerUserId) {
          if (filter.statusFilter === 'SOLVED' || filter.statusFilter === 'ATTEMPTED') {
            list = [];
          }
        } else {
          list = list.filter((p) => getStatus(p.id) === filter.statusFilter);
        }
      }

      const dir = filter?.sortOrder === 'asc' ? 1 : -1;
      list.sort((a, b) => {
        if (filter?.sortBy === 'title') {
          return a.title.localeCompare(b.title) * dir;
        }
        if (filter?.sortBy === 'oldest') {
          return (a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0);
        }
        if (filter?.sortBy === 'difficulty') {
          const order: Record<Difficulty, number> = { EASY: 1, MEDIUM: 2, HARD: 3 };
          return (order[a.difficulty] - order[b.difficulty]) * dir;
        }
        return ((a.publishedAt?.getTime() ?? 0) - (b.publishedAt?.getTime() ?? 0)) * dir;
      });

      const totalItems = list.length;
      const paged = list.slice(pagination.skip, pagination.skip + pagination.take);

      return {
        items: paged.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          publishedAt: p.publishedAt,
          tags: resolveTagsByIds(p.tagIds),
          userProgressStatus: getStatus(p.id),
        })),
        meta: buildPaginationMeta(pagination, totalItems),
      };
    },

    async findPublishedProblemBySlug(
      slug: string,
      options?: { readonly viewerUserId?: string | undefined },
    ): Promise<PublicProblemDetailDto | null> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError('DATABASE_ERROR', 'Database connection refused');
      }

      const found = Array.from(problemsById.values()).find(
        (p) => p.slug === slug && p.status === 'PUBLISHED',
      );
      if (!found) {
        return null;
      }

      const publicTestCases: PublicTestCaseDto[] = found.testCases
        .filter((tc) => tc.isPublic)
        .sort((a, b) => a.sequence - b.sequence)
        .map((tc) => ({
          id: tc.id,
          sequence: tc.sequence,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation,
          isPublic: true as const,
        }));

      const userProgressStatus = options?.viewerUserId
        ? (progressByUserAndProblem.get(`${options.viewerUserId}:${found.id}`) ?? 'UNSOLVED')
        : 'UNSOLVED';

      return {
        id: found.id,
        slug: found.slug,
        title: found.title,
        statement: found.statement,
        inputFormat: found.inputFormat,
        outputFormat: found.outputFormat,
        constraints: found.constraints,
        examples: found.examples,
        explanation: found.explanation,
        difficulty: found.difficulty,
        timeLimitMs: found.timeLimitMs,
        memoryLimitMb: found.memoryLimitMb,
        outputLimitBytes: found.outputLimitBytes,
        sourceSizeLimitBytes: found.sourceSizeLimitBytes,
        comparisonMode: found.comparisonMode,
        floatTolerance: found.floatTolerance,
        publishedAt: found.publishedAt,
        tags: resolveTagsByIds(found.tagIds),
        publicTestCases,
        userProgressStatus,
      };
    },

    async listProblemsForAdmin(
      actor: RepositoryActor,
      filter?: AdminProblemListFilter,
      paginationInput?: PaginationInput,
    ): Promise<PaginatedResult<AdminProblemSummaryRecord>> {
      assertAdminActor(actor, 'listProblemsForAdmin');
      const pagination = normalizePagination(paginationInput);

      let list = Array.from(problemsById.values());
      if (filter?.status) {
        list = list.filter((p) => p.status === filter.status);
      }
      if (filter?.difficulty) {
        list = list.filter((p) => p.difficulty === filter.difficulty);
      }
      if (filter?.search) {
        const q = filter.search.toLowerCase();
        list = list.filter(
          (p) => p.title.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q),
        );
      }

      const totalItems = list.length;
      const paged = list.slice(pagination.skip, pagination.skip + pagination.take);

      return {
        items: paged.map((p) => ({
          id: p.id,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          status: p.status,
          timeLimitMs: p.timeLimitMs,
          memoryLimitMb: p.memoryLimitMb,
          comparisonMode: p.comparisonMode,
          publicTestCaseCount: p.testCases.filter((tc) => tc.isPublic).length,
          hiddenTestCaseCount: p.testCases.filter((tc) => !tc.isPublic).length,
          publishedAt: p.publishedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          tags: resolveTagsByIds(p.tagIds),
        })),
        meta: buildPaginationMeta(pagination, totalItems),
      };
    },

    async findProblemByIdForAdmin(
      actor: RepositoryActor,
      problemId: string,
    ): Promise<AdminProblemDetailRecord | null> {
      assertAdminActor(actor, 'findProblemByIdForAdmin');
      const p = problemsById.get(problemId);
      return p ? toAdminDetailRecord(p) : null;
    },

    async createProblemForAdmin(
      actor: RepositoryActor,
      input: CreateProblemAdminInput,
    ): Promise<{ id: string; slug: string; status: ProblemStatus }> {
      assertAdminActor(actor, 'createProblemForAdmin');

      for (const existing of problemsById.values()) {
        if (existing.slug === input.slug.trim()) {
          throw new RepositoryError('CONFLICT', 'Resource violates a uniqueness constraint.');
        }
      }

      const resolvedTagIds = resolveTagIdsInput(input.tagIds, input.tagSlugs);
      const id = randomUUID();
      const stored: StoredProblem = {
        id,
        slug: input.slug.trim(),
        title: input.title.trim(),
        statement: input.statement,
        inputFormat: input.inputFormat,
        outputFormat: input.outputFormat,
        constraints: input.constraints ?? null,
        examples: (input.examples as Prisma.JsonValue) ?? [],
        explanation: input.explanation ?? null,
        editorial: input.editorial ?? null,
        difficulty: input.difficulty,
        status: 'DRAFT',
        authorId: actor.userId,
        timeLimitMs: input.timeLimitMs ?? 2000,
        memoryLimitMb: input.memoryLimitMb ?? 256,
        outputLimitBytes: input.outputLimitBytes ?? 1048576,
        sourceSizeLimitBytes: input.sourceSizeLimitBytes ?? 65536,
        comparisonMode: input.comparisonMode ?? 'TRIM_WHITESPACE',
        floatTolerance: input.floatTolerance ?? null,
        publishedAt: null,
        createdAt: now,
        updatedAt: now,
        tagIds: resolvedTagIds,
        testCases: [],
      };

      problemsById.set(id, stored);
      return { id: stored.id, slug: stored.slug, status: stored.status };
    },

    async updateProblemForAdmin(
      actor: RepositoryActor,
      problemId: string,
      input: UpdateProblemAdminInput,
    ): Promise<AdminProblemDetailRecord> {
      assertAdminActor(actor, 'updateProblemForAdmin');
      const existing = problemsById.get(problemId);
      if (!existing) {
        throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
      }

      if (input.slug && input.slug.trim() !== existing.slug) {
        for (const other of problemsById.values()) {
          if (other.id !== problemId && other.slug === input.slug.trim()) {
            throw new RepositoryError('CONFLICT', 'Resource violates a uniqueness constraint.');
          }
        }
      }

      if (input.tagIds !== undefined || input.tagSlugs !== undefined) {
        existing.tagIds = resolveTagIdsInput(input.tagIds, input.tagSlugs);
      }

      if (input.slug !== undefined) existing.slug = input.slug.trim();
      if (input.title !== undefined) existing.title = input.title.trim();
      if (input.statement !== undefined) existing.statement = input.statement;
      if (input.inputFormat !== undefined) existing.inputFormat = input.inputFormat;
      if (input.outputFormat !== undefined) existing.outputFormat = input.outputFormat;
      if (input.constraints !== undefined) existing.constraints = input.constraints;
      if (input.examples !== undefined) existing.examples = input.examples as Prisma.JsonValue;
      if (input.explanation !== undefined) existing.explanation = input.explanation;
      if (input.editorial !== undefined) existing.editorial = input.editorial;
      if (input.difficulty !== undefined) existing.difficulty = input.difficulty;
      if (input.status !== undefined) existing.status = input.status;
      if (input.timeLimitMs !== undefined) existing.timeLimitMs = input.timeLimitMs;
      if (input.memoryLimitMb !== undefined) existing.memoryLimitMb = input.memoryLimitMb;
      if (input.outputLimitBytes !== undefined) {
        existing.outputLimitBytes = input.outputLimitBytes;
      }
      if (input.sourceSizeLimitBytes !== undefined) {
        existing.sourceSizeLimitBytes = input.sourceSizeLimitBytes;
      }
      if (input.comparisonMode !== undefined) existing.comparisonMode = input.comparisonMode;
      if (input.floatTolerance !== undefined) existing.floatTolerance = input.floatTolerance;
      existing.updatedAt = new Date();

      return toAdminDetailRecord(existing);
    },

    async replaceProblemTestCasesForAdmin(
      actor: RepositoryActor,
      problemId: string,
      testCases: readonly TestCaseAdminInput[],
    ): Promise<number> {
      assertAdminActor(actor, 'replaceProblemTestCasesForAdmin');
      const existing = problemsById.get(problemId);
      if (!existing) {
        throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
      }

      const publicCount = testCases.filter((tc) => tc.isPublic).length;
      const hiddenCount = testCases.filter((tc) => !tc.isPublic).length;

      if (existing.status === 'PUBLISHED' && (publicCount < 1 || hiddenCount < 1)) {
        throw new RepositoryError(
          'VALIDATION_ERROR',
          'A published problem must retain at least one public test case and one hidden test case.',
        );
      }

      existing.testCases = testCases.map((tc) => ({
        id: randomUUID(),
        sequence: tc.sequence,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        explanation: tc.explanation ?? null,
        isPublic: tc.isPublic,
        weight: tc.weight ?? 1,
        group: tc.group ?? null,
      }));

      return existing.testCases.length;
    },

    async transitionProblemStatusForAdmin(
      actor: RepositoryActor,
      problemId: string,
      targetStatus: ProblemStatus,
    ): Promise<{ id: string; slug: string; status: ProblemStatus; publishedAt: Date | null }> {
      assertAdminActor(actor, 'transitionProblemStatusForAdmin');
      const existing = problemsById.get(problemId);
      if (!existing) {
        throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
      }

      if (targetStatus === 'PUBLISHED') {
        const publicCount = existing.testCases.filter((tc) => tc.isPublic).length;
        const hiddenCount = existing.testCases.filter((tc) => !tc.isPublic).length;
        if (publicCount < 1 || hiddenCount < 1) {
          throw new RepositoryError(
            'VALIDATION_ERROR',
            'Publishing a problem requires at least one public test case and one hidden test case.',
          );
        }
      }

      existing.status = targetStatus;
      if (targetStatus === 'PUBLISHED' && existing.publishedAt === null) {
        existing.publishedAt = now;
      }

      return {
        id: existing.id,
        slug: existing.slug,
        status: existing.status,
        publishedAt: existing.publishedAt,
      };
    },
  };

  return {
    userRepository,
    problemRepository,
    usersById,
    problemsById,
    progressByUserAndProblem,
    publishedEasyId,
    publishedMediumId,
    draftHardId,
    archivedEasyId,
    setSimulateDatabaseFailure(val: boolean) {
      simulateDatabaseFailure = val;
    },
  };
}

async function registerAndExtractCookie(
  app: ReturnType<typeof createApp>,
  email: string,
  username: string,
): Promise<{ userId: string; cookieHeader: string }> {
  const res = await app.request('/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email,
      username,
      password: 'ValidPassword123!',
    }),
  });
  expect(res.status).toBe(201);
  const body = (await res.json()) as { user: { id: string } };
  const setCookie = res.headers.get('set-cookie') ?? '';
  const token = extractSessionTokenFromCookieHeader(setCookie, 'devarena_session');
  expect(token).toBeTruthy();

  return {
    userId: body.user.id,
    cookieHeader: `devarena_session=${token}`,
  };
}

describe('Phase 4 Problem System — Public Catalogue & Detail Endpoints', () => {
  it('lists only PUBLISHED problems and never exposes DRAFT or ARCHIVED problems', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    const response = await app.request('/api/v1/problems');
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      items: Array<{ slug: string; difficulty: string; userProgressStatus: string }>;
      meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
      availableTags: Array<{ slug: string; name: string }>;
    };

    expect(body.meta.totalItems).toBe(2);
    const slugs = body.items.map((item) => item.slug);
    expect(slugs).toContain('two-sum-indices');
    expect(slugs).toContain('longest-zero-sum-slice');
    expect(slugs).not.toContain('directed-cycle-minimum-cut');
    expect(slugs).not.toContain('legacy-fibonacci-check');
    expect(body.availableTags.length).toBe(4);
  });

  it('supports filtering, search, user solve status, sorting, and pagination', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    // Filter by difficulty=EASY
    const easyRes = await app.request('/api/v1/problems?difficulty=EASY');
    expect(easyRes.status).toBe(200);
    const easyBody = (await easyRes.json()) as { items: Array<{ slug: string }> };
    expect(easyBody.items.map((i) => i.slug)).toEqual(['two-sum-indices']);

    // Filter by tag=dynamic-programming
    const dpRes = await app.request('/api/v1/problems?tag=dynamic-programming');
    expect(dpRes.status).toBe(200);
    const dpBody = (await dpRes.json()) as { items: Array<{ slug: string }> };
    expect(dpBody.items.map((i) => i.slug)).toEqual(['longest-zero-sum-slice']);

    // Search by title substring
    const searchRes = await app.request('/api/v1/problems?search=zero-sum');
    expect(searchRes.status).toBe(200);
    const searchBody = (await searchRes.json()) as { items: Array<{ slug: string }> };
    expect(searchBody.items.map((i) => i.slug)).toEqual(['longest-zero-sum-slice']);

    // Sort by title ascending and paginate pageSize=1
    const page1Res = await app.request(
      '/api/v1/problems?sortBy=title&sortOrder=asc&page=1&pageSize=1',
    );
    expect(page1Res.status).toBe(200);
    const page1Body = (await page1Res.json()) as {
      items: Array<{ slug: string }>;
      meta: { page: number; pageSize: number; totalItems: number; totalPages: number };
    };
    expect(page1Body.items.map((i) => i.slug)).toEqual(['longest-zero-sum-slice']);
    expect(page1Body.meta).toEqual({
      page: 1,
      pageSize: 1,
      totalItems: 2,
      totalPages: 2,
    });

    // Authenticated solve status personalization and filtering
    const { userId, cookieHeader } = await registerAndExtractCookie(
      app,
      'solver@example.com',
      'solver_user',
    );
    harness.progressByUserAndProblem.set(`${userId}:${harness.publishedEasyId}`, 'SOLVED');

    const solvedRes = await app.request('/api/v1/problems?status=SOLVED', {
      headers: { Cookie: cookieHeader },
    });
    expect(solvedRes.status).toBe(200);
    const solvedBody = (await solvedRes.json()) as {
      items: Array<{ slug: string; userProgressStatus: string }>;
    };
    expect(solvedBody.items).toEqual([
      expect.objectContaining({
        slug: 'two-sum-indices',
        userProgressStatus: 'SOLVED',
      }),
    ]);
  });

  it('returns public problem details and ONLY public test cases (never hidden data)', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    const response = await app.request('/api/v1/problems/two-sum-indices');
    expect(response.status).toBe(200);

    const rawText = await response.text();
    // Confidential hidden test case and private editorial must never appear in the response
    expect(rawText).not.toContain('SECRET_HIDDEN_INPUT_999999');
    expect(rawText).not.toContain('SECRET_HIDDEN_OUTPUT_888888');
    expect(rawText).not.toContain('PRIVATE_EDITORIAL_SECRET_HASH_MAP_SOLUTION');

    const body = JSON.parse(rawText) as {
      problem: {
        slug: string;
        title: string;
        difficulty: string;
        timeLimitMs: number;
        memoryLimitMb: number;
        comparisonMode: string;
        supportedLanguages: Array<{ slug: string }>;
        publicTestCases: Array<{ sequence: number; isPublic: boolean; input: string }>;
        editorial?: unknown;
      };
    };

    expect(body.problem.slug).toBe('two-sum-indices');
    expect(body.problem.editorial).toBeUndefined();
    expect(body.problem.supportedLanguages.map((l) => l.slug)).toEqual(['cpp', 'javascript']);
    expect(body.problem.publicTestCases).toHaveLength(1);
    expect(body.problem.publicTestCases[0]?.isPublic).toBe(true);
    expect(body.problem.publicTestCases[0]?.sequence).toBe(1);
  });

  it('returns 404 for unpublished/unknown slugs and 400 for malformed parameters', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    // DRAFT problem slug must return 404 on public endpoint
    const draftRes = await app.request('/api/v1/problems/directed-cycle-minimum-cut');
    expect(draftRes.status).toBe(404);

    // ARCHIVED problem slug must return 404 on public endpoint
    const archivedRes = await app.request('/api/v1/problems/legacy-fibonacci-check');
    expect(archivedRes.status).toBe(404);

    // Unknown slug must return 404
    const missingRes = await app.request('/api/v1/problems/non-existent-problem');
    expect(missingRes.status).toBe(404);

    // Invalid slug format (uppercase / invalid chars) must return 400 VALIDATION_ERROR
    const invalidSlugRes = await app.request('/api/v1/problems/INVALID_SLUG!!');
    expect(invalidSlugRes.status).toBe(400);
    const invalidSlugBody = (await invalidSlugRes.json()) as { error: { code: string } };
    expect(invalidSlugBody.error.code).toBe('VALIDATION_ERROR');

    // Invalid query parameters on GET /api/v1/problems
    const badQueryRes = await app.request('/api/v1/problems?difficulty=IMPOSSIBLE&page=0');
    expect(badQueryRes.status).toBe(400);
    const badQueryBody = (await badQueryRes.json()) as { error: { code: string } };
    expect(badQueryBody.error.code).toBe('VALIDATION_ERROR');
  });
});

describe('Phase 4 Problem System — Administrative Authorization & Lifecycle Operations', () => {
  it('blocks unauthenticated (401) and non-admin (403) requests from admin endpoints', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    const { cookieHeader: normalUserCookie } = await registerAndExtractCookie(
      app,
      'normal.user@example.com',
      'normal_user',
    );

    const endpoints: Array<{ method: string; path: string; body?: unknown }> = [
      { method: 'GET', path: '/api/v1/admin/problems' },
      {
        method: 'POST',
        path: '/api/v1/admin/problems',
        body: {
          slug: 'unauthorized-problem',
          title: 'Unauthorized Problem',
          statement: 'Should never be created by a normal user.',
          inputFormat: 'n',
          outputFormat: 'n',
          difficulty: 'EASY',
        },
      },
      { method: 'GET', path: `/api/v1/admin/problems/${harness.draftHardId}` },
      {
        method: 'PATCH',
        path: `/api/v1/admin/problems/${harness.draftHardId}`,
        body: { title: 'Tampered Title' },
      },
      {
        method: 'PUT',
        path: `/api/v1/admin/problems/${harness.draftHardId}/test-cases`,
        body: {
          testCases: [{ sequence: 1, input: '1\n', expectedOutput: '1\n', isPublic: true }],
        },
      },
      { method: 'POST', path: `/api/v1/admin/problems/${harness.draftHardId}/publish` },
      { method: 'POST', path: `/api/v1/admin/problems/${harness.publishedEasyId}/unpublish` },
      { method: 'POST', path: `/api/v1/admin/problems/${harness.publishedEasyId}/archive` },
    ];

    for (const ep of endpoints) {
      // Unauthenticated -> 401
      const unauthRes = await app.request(ep.path, {
        method: ep.method,
        headers: ep.body ? { 'Content-Type': 'application/json' } : {},
        ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
      });
      expect(unauthRes.status).toBe(401);

      // Normal USER (even if spoofing X-User-Role: ADMIN) -> 403
      const userRes = await app.request(ep.path, {
        method: ep.method,
        headers: {
          Cookie: normalUserCookie,
          'X-User-Role': 'ADMIN',
          ...(ep.body ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(ep.body ? { body: JSON.stringify(ep.body) } : {}),
      });
      expect(userRes.status).toBe(403);
    }
  });

  it('allows ADMIN to create, edit, manage tests, publish, unpublish, and archive', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    const { userId: adminId, cookieHeader: adminCookie } = await registerAndExtractCookie(
      app,
      'admin@example.com',
      'admin_user',
    );
    // Elevate user role on the server side
    const storedAdmin = harness.usersById.get(adminId);
    expect(storedAdmin).toBeDefined();
    storedAdmin!.role = 'ADMIN';

    // 1. Admin creates a new draft problem
    const createRes = await app.request('/api/v1/admin/problems', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'binary-search-lower-bound',
        title: 'Binary Search Lower Bound',
        statement: 'Given a sorted array of n integers, find the first index >= target.',
        inputFormat: 'n and target on line 1, sorted array on line 2.',
        outputFormat: '1-based index or -1.',
        constraints: '1 <= n <= 200000',
        examples: [{ input: '5 4\n1 2 4 4 9', output: '3' }],
        editorial: 'Standard binary search invariant over [lo, hi].',
        difficulty: 'EASY',
        timeLimitMs: 1000,
        memoryLimitMb: 256,
        comparisonMode: 'TRIM_WHITESPACE',
        tagSlugs: ['arrays'],
      }),
    });
    expect(createRes.status).toBe(201);
    const createdBody = (await createRes.json()) as {
      problem: { id: string; slug: string; status: string; editorial: string | null };
    };
    expect(createdBody.problem.status).toBe('DRAFT');
    expect(createdBody.problem.editorial).toBe('Standard binary search invariant over [lo, hi].');
    const newProblemId = createdBody.problem.id;

    // 2. Attempting to publish before adding public + hidden test cases fails with 400
    const prematurePublishRes = await app.request(
      `/api/v1/admin/problems/${newProblemId}/publish`,
      {
        method: 'POST',
        headers: { Cookie: adminCookie },
      },
    );
    expect(prematurePublishRes.status).toBe(400);

    // 3. Replace test cases with 1 public and 2 hidden test cases
    const replaceTcRes = await app.request(`/api/v1/admin/problems/${newProblemId}/test-cases`, {
      method: 'PUT',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        testCases: [
          {
            sequence: 1,
            input: '5 4\n1 2 4 4 9\n',
            expectedOutput: '3\n',
            explanation: 'Sample test',
            isPublic: true,
            weight: 1,
            group: 'sample',
          },
          {
            sequence: 2,
            input: '4 10\n1 2 3 4\n',
            expectedOutput: '-1\n',
            isPublic: false,
            weight: 1,
            group: 'hidden-not-found',
          },
          {
            sequence: 3,
            input: '3 1\n1 1 1\n',
            expectedOutput: '1\n',
            isPublic: false,
            weight: 1,
            group: 'hidden-duplicates',
          },
        ],
      }),
    });
    expect(replaceTcRes.status).toBe(200);
    const replaceTcBody = (await replaceTcRes.json()) as {
      totalTestCases: number;
      publicTestCaseCount: number;
      hiddenTestCaseCount: number;
    };
    expect(replaceTcBody).toEqual({
      problemId: newProblemId,
      totalTestCases: 3,
      publicTestCaseCount: 1,
      hiddenTestCaseCount: 2,
    });

    // 4. Publish problem -> 200 OK and now visible on public GET /api/v1/problems/:slug
    const publishRes = await app.request(`/api/v1/admin/problems/${newProblemId}/publish`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    expect(publishRes.status).toBe(200);
    const publishBody = (await publishRes.json()) as {
      problem: { status: string; publishedAt: string | null };
    };
    expect(publishBody.problem.status).toBe('PUBLISHED');
    expect(publishBody.problem.publishedAt).toBeTruthy();

    const publicViewRes = await app.request('/api/v1/problems/binary-search-lower-bound');
    expect(publicViewRes.status).toBe(200);
    const publicViewBody = (await publicViewRes.json()) as {
      problem: { publicTestCases: Array<{ sequence: number }> };
    };
    expect(publicViewBody.problem.publicTestCases).toHaveLength(1);

    // 5. Removing hidden test cases while problem is PUBLISHED is rejected with 400
    const invalidTcUpdateRes = await app.request(
      `/api/v1/admin/problems/${newProblemId}/test-cases`,
      {
        method: 'PUT',
        headers: {
          Cookie: adminCookie,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          testCases: [
            {
              sequence: 1,
              input: '5 4\n1 2 4 4 9\n',
              expectedOutput: '3\n',
              isPublic: true,
              weight: 1,
            },
          ],
        }),
      },
    );
    expect(invalidTcUpdateRes.status).toBe(400);

    // 6. Unpublish problem -> transitions back to DRAFT and disappears from public endpoint
    const unpublishRes = await app.request(`/api/v1/admin/problems/${newProblemId}/unpublish`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    expect(unpublishRes.status).toBe(200);
    const afterUnpublishPublicRes = await app.request('/api/v1/problems/binary-search-lower-bound');
    expect(afterUnpublishPublicRes.status).toBe(404);

    // 7. Archive problem -> transitions to ARCHIVED
    const archiveRes = await app.request(`/api/v1/admin/problems/${newProblemId}/archive`, {
      method: 'POST',
      headers: { Cookie: adminCookie },
    });
    expect(archiveRes.status).toBe(200);
    const archiveBody = (await archiveRes.json()) as { problem: { status: string } };
    expect(archiveBody.problem.status).toBe('ARCHIVED');
  });

  it('handles duplicate slugs (409), unknown IDs (404), and DB errors (500)', async () => {
    const harness = createInMemoryProblemTestHarness();
    const app = createApp({
      userRepository: harness.userRepository,
      problemRepository: harness.problemRepository,
    });

    const { userId: adminId, cookieHeader: adminCookie } = await registerAndExtractCookie(
      app,
      'admin2@example.com',
      'admin_two',
    );
    harness.usersById.get(adminId)!.role = 'ADMIN';

    // Duplicate slug -> 409 CONFLICT
    const dupRes = await app.request('/api/v1/admin/problems', {
      method: 'POST',
      headers: {
        Cookie: adminCookie,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        slug: 'two-sum-indices',
        title: 'Duplicate Slug Problem',
        statement: 'Statement with at least 10 characters.',
        inputFormat: 'n',
        outputFormat: 'n',
        difficulty: 'EASY',
      }),
    });
    expect(dupRes.status).toBe(409);

    // Non-existent UUID on admin GET -> 404 NOT_FOUND
    const missingAdminRes = await app.request(
      '/api/v1/admin/problems/99999999-9999-4999-8999-999999999999',
      {
        headers: { Cookie: adminCookie },
      },
    );
    expect(missingAdminRes.status).toBe(404);

    // Database failure -> 500 INTERNAL_ERROR with zero secret leakage
    harness.setSimulateDatabaseFailure(true);
    const dbFailRes = await app.request('/api/v1/problems');
    expect(dbFailRes.status).toBe(500);
    const dbFailText = await dbFailRes.text();
    expect(dbFailText).not.toContain('postgresql://');
    expect(dbFailText).not.toContain('secret_pass');
  });
});
