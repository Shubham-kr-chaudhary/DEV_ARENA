import type {
  ComparisonMode,
  Difficulty,
  Prisma,
  PrismaClient,
  ProblemStatus,
} from '../generated/prisma/client.js';
import {
  assertAdminActor,
  buildPaginationMeta,
  mapPrismaRepositoryError,
  normalizePagination,
  RepositoryError,
  type PaginatedResult,
  type PaginationInput,
  type RepositoryActor,
} from './types.js';

export type UserSolveProgressStatus = 'SOLVED' | 'ATTEMPTED' | 'UNSOLVED';

export interface ProblemCatalogueFilter {
  readonly search?: string | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly tagSlug?: string | undefined;
  readonly viewerUserId?: string | undefined;
}

export interface ProblemCatalogueItemDto {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly publishedAt: Date | null;
  readonly tags: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  }>;
  readonly userProgressStatus: UserSolveProgressStatus;
}

export interface PublicTestCaseDto {
  readonly id: string;
  readonly sequence: number;
  readonly input: string;
  readonly expectedOutput: string;
  readonly explanation: string | null;
  readonly isPublic: true;
}

export interface PublicProblemDetailDto {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly constraints: string | null;
  readonly examples: Prisma.JsonValue;
  readonly explanation: string | null;
  readonly difficulty: Difficulty;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly outputLimitBytes: number;
  readonly sourceSizeLimitBytes: number;
  readonly publishedAt: Date | null;
  readonly tags: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly name: string;
  }>;
  readonly publicTestCases: readonly PublicTestCaseDto[];
}

export interface JudgeTestCaseDto {
  readonly id: string;
  readonly sequence: number;
  readonly input: string;
  readonly expectedOutput: string;
  readonly isPublic: boolean;
  readonly weight: number;
  readonly group: string | null;
}

export interface JudgeProblemExecutionBundle {
  readonly id: string;
  readonly slug: string;
  readonly status: ProblemStatus;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly outputLimitBytes: number;
  readonly sourceSizeLimitBytes: number;
  readonly comparisonMode: ComparisonMode;
  readonly floatTolerance: number | null;
  readonly testCases: readonly JudgeTestCaseDto[];
}

export interface CreateProblemAdminInput {
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly constraints?: string | null | undefined;
  readonly examples?: Prisma.InputJsonValue | undefined;
  readonly explanation?: string | null | undefined;
  readonly editorial?: string | null | undefined;
  readonly difficulty: Difficulty;
  readonly timeLimitMs?: number | undefined;
  readonly memoryLimitMb?: number | undefined;
  readonly outputLimitBytes?: number | undefined;
  readonly sourceSizeLimitBytes?: number | undefined;
  readonly comparisonMode?: ComparisonMode | undefined;
  readonly floatTolerance?: number | null | undefined;
  readonly tagIds?: readonly string[] | undefined;
}

export interface TestCaseAdminInput {
  readonly sequence: number;
  readonly input: string;
  readonly expectedOutput: string;
  readonly explanation?: string | null | undefined;
  readonly isPublic: boolean;
  readonly weight?: number | undefined;
  readonly group?: string | null | undefined;
}

export class ProblemRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Lists only PUBLISHED problems for the public problem catalogue.
   * Never returns DRAFT, REVIEW, or ARCHIVED problems or test cases.
   */
  public async listPublishedProblems(
    filter?: ProblemCatalogueFilter,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<ProblemCatalogueItemDto>> {
    const pagination = normalizePagination(paginationInput);
    const trimmedSearch = filter?.search?.trim();

    const where: Prisma.ProblemWhereInput = {
      status: 'PUBLISHED',
      ...(filter?.difficulty !== undefined ? { difficulty: filter.difficulty } : {}),
      ...(filter?.tagSlug !== undefined
        ? {
            tags: {
              some: {
                tag: {
                  slug: filter.tagSlug,
                },
              },
            },
          }
        : {}),
      ...(trimmedSearch
        ? {
            OR: [
              { title: { contains: trimmedSearch, mode: 'insensitive' } },
              { slug: { contains: trimmedSearch, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    try {
      const [problems, totalItems] = await Promise.all([
        this.prisma.problem.findMany({
          where,
          orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
          skip: pagination.skip,
          take: pagination.take,
          select: {
            id: true,
            slug: true,
            title: true,
            difficulty: true,
            publishedAt: true,
            tags: {
              select: {
                tag: {
                  select: {
                    id: true,
                    slug: true,
                    name: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.problem.count({ where }),
      ]);

      const progressMap = new Map<string, UserSolveProgressStatus>();
      if (filter?.viewerUserId && problems.length > 0) {
        const problemIds = problems.map((p) => p.id);
        const progressRows = await this.prisma.userProblemProgress.findMany({
          where: {
            userId: filter.viewerUserId,
            problemId: { in: problemIds },
          },
          select: {
            problemId: true,
            solved: true,
            attempts: true,
          },
        });

        for (const row of progressRows) {
          if (row.solved) {
            progressMap.set(row.problemId, 'SOLVED');
          } else if (row.attempts > 0) {
            progressMap.set(row.problemId, 'ATTEMPTED');
          }
        }
      }

      const items: ProblemCatalogueItemDto[] = problems.map((problem) => ({
        id: problem.id,
        slug: problem.slug,
        title: problem.title,
        difficulty: problem.difficulty,
        publishedAt: problem.publishedAt,
        tags: problem.tags.map((pt) => pt.tag),
        userProgressStatus: progressMap.get(problem.id) ?? 'UNSOLVED',
      }));

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to query published problems catalogue.');
    }
  }

  /**
   * Fetches a PUBLISHED problem by slug for public problem detail and Arena pages.
   *
   * Security invariant: Queries ONLY test cases with `isPublic: true` and never
   * exposes hidden test cases (`isPublic: false`) or unpublished problems.
   */
  public async findPublishedProblemBySlug(slug: string): Promise<PublicProblemDetailDto | null> {
    try {
      const problem = await this.prisma.problem.findFirst({
        where: {
          slug: slug.trim(),
          status: 'PUBLISHED',
        },
        select: {
          id: true,
          slug: true,
          title: true,
          statement: true,
          inputFormat: true,
          outputFormat: true,
          constraints: true,
          examples: true,
          explanation: true,
          difficulty: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          outputLimitBytes: true,
          sourceSizeLimitBytes: true,
          publishedAt: true,
          tags: {
            select: {
              tag: {
                select: {
                  id: true,
                  slug: true,
                  name: true,
                },
              },
            },
          },
          testCases: {
            where: {
              isPublic: true,
            },
            orderBy: {
              sequence: 'asc',
            },
            select: {
              id: true,
              sequence: true,
              input: true,
              expectedOutput: true,
              explanation: true,
              isPublic: true,
            },
          },
        },
      });

      if (!problem) {
        return null;
      }

      // Defensive filter in addition to database WHERE isPublic = true
      const publicTestCases: PublicTestCaseDto[] = problem.testCases
        .filter((tc): tc is typeof tc & { isPublic: true } => tc.isPublic === true)
        .map((tc) => ({
          id: tc.id,
          sequence: tc.sequence,
          input: tc.input,
          expectedOutput: tc.expectedOutput,
          explanation: tc.explanation,
          isPublic: true,
        }));

      return {
        id: problem.id,
        slug: problem.slug,
        title: problem.title,
        statement: problem.statement,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        constraints: problem.constraints,
        examples: problem.examples,
        explanation: problem.explanation,
        difficulty: problem.difficulty,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        outputLimitBytes: problem.outputLimitBytes,
        sourceSizeLimitBytes: problem.sourceSizeLimitBytes,
        publishedAt: problem.publishedAt,
        tags: problem.tags.map((pt) => pt.tag),
        publicTestCases,
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to fetch published problem detail.');
    }
  }

  /**
   * Internal judge-only method to load execution limits and test cases.
   * When `publicOnly` is true (RUN mode), loads only sample test cases (`isPublic = true`).
   * When `publicOnly` is false (SUBMIT mode), loads all public and hidden test cases.
   */
  public async findProblemForJudge(
    problemId: string,
    options: { readonly publicOnly: boolean },
  ): Promise<JudgeProblemExecutionBundle | null> {
    try {
      const problem = await this.prisma.problem.findUnique({
        where: { id: problemId },
        select: {
          id: true,
          slug: true,
          status: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          outputLimitBytes: true,
          sourceSizeLimitBytes: true,
          comparisonMode: true,
          floatTolerance: true,
          testCases: {
            where: options.publicOnly ? { isPublic: true } : {},
            orderBy: { sequence: 'asc' },
            select: {
              id: true,
              sequence: true,
              input: true,
              expectedOutput: true,
              isPublic: true,
              weight: true,
              group: true,
            },
          },
        },
      });

      return problem;
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to fetch problem bundle for judge.');
    }
  }

  public async createProblemForAdmin(
    actor: RepositoryActor,
    input: CreateProblemAdminInput,
  ): Promise<{ id: string; slug: string; status: ProblemStatus }> {
    assertAdminActor(actor, 'createProblemForAdmin');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const problem = await tx.problem.create({
          data: {
            slug: input.slug.trim(),
            title: input.title.trim(),
            statement: input.statement,
            inputFormat: input.inputFormat,
            outputFormat: input.outputFormat,
            constraints: input.constraints ?? null,
            ...(input.examples !== undefined ? { examples: input.examples } : {}),
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
            ...(input.tagIds && input.tagIds.length > 0
              ? {
                  tags: {
                    create: input.tagIds.map((tagId) => ({ tagId })),
                  },
                }
              : {}),
          },
          select: {
            id: true,
            slug: true,
            status: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: 'PROBLEM_CREATED',
            entityType: 'Problem',
            entityId: problem.id,
            metadata: { slug: problem.slug, status: problem.status },
          },
        });

        return problem;
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to create problem.');
    }
  }

  public async replaceProblemTestCasesForAdmin(
    actor: RepositoryActor,
    problemId: string,
    testCases: readonly TestCaseAdminInput[],
  ): Promise<number> {
    assertAdminActor(actor, 'replaceProblemTestCasesForAdmin');

    const seenSequences = new Set<number>();
    for (const tc of testCases) {
      if (!Number.isInteger(tc.sequence) || tc.sequence < 1) {
        throw new RepositoryError(
          'VALIDATION_ERROR',
          'Test case sequence numbers must be positive integers.',
        );
      }
      if (seenSequences.has(tc.sequence)) {
        throw new RepositoryError(
          'VALIDATION_ERROR',
          `Duplicate test case sequence number: ${tc.sequence}`,
        );
      }
      seenSequences.add(tc.sequence);
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existingProblem = await tx.problem.findUnique({
          where: { id: problemId },
          select: { id: true, slug: true },
        });

        if (!existingProblem) {
          throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
        }

        await tx.testCase.deleteMany({
          where: { problemId },
        });

        if (testCases.length > 0) {
          await tx.testCase.createMany({
            data: testCases.map((tc) => ({
              problemId,
              sequence: tc.sequence,
              input: tc.input,
              expectedOutput: tc.expectedOutput,
              explanation: tc.explanation ?? null,
              isPublic: tc.isPublic,
              weight: tc.weight ?? 1,
              group: tc.group ?? null,
            })),
          });
        }

        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: 'PROBLEM_TEST_CASES_UPDATED',
            entityType: 'Problem',
            entityId: problemId,
            metadata: {
              totalTestCases: testCases.length,
              publicCount: testCases.filter((tc) => tc.isPublic).length,
              hiddenCount: testCases.filter((tc) => !tc.isPublic).length,
            },
          },
        });

        return testCases.length;
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to update problem test cases.');
    }
  }

  /**
   * Transitions a problem's publication status (`DRAFT`, `REVIEW`, `PUBLISHED`, `ARCHIVED`).
   * Publishing a problem requires at least one public test case and one hidden test case.
   */
  public async transitionProblemStatusForAdmin(
    actor: RepositoryActor,
    problemId: string,
    targetStatus: ProblemStatus,
  ): Promise<{ id: string; slug: string; status: ProblemStatus; publishedAt: Date | null }> {
    assertAdminActor(actor, 'transitionProblemStatusForAdmin');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const problem = await tx.problem.findUnique({
          where: { id: problemId },
          select: {
            id: true,
            slug: true,
            status: true,
            publishedAt: true,
            testCases: {
              select: {
                isPublic: true,
              },
            },
          },
        });

        if (!problem) {
          throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
        }

        if (targetStatus === 'PUBLISHED') {
          const publicCount = problem.testCases.filter((tc) => tc.isPublic).length;
          const hiddenCount = problem.testCases.filter((tc) => !tc.isPublic).length;

          if (publicCount < 1 || hiddenCount < 1) {
            throw new RepositoryError(
              'VALIDATION_ERROR',
              'Publishing a problem requires at least one public test case and one hidden test case.',
            );
          }
        }

        const updated = await tx.problem.update({
          where: { id: problemId },
          data: {
            status: targetStatus,
            ...(targetStatus === 'PUBLISHED' && problem.publishedAt === null
              ? { publishedAt: new Date() }
              : {}),
          },
          select: {
            id: true,
            slug: true,
            status: true,
            publishedAt: true,
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: `PROBLEM_STATUS_${targetStatus}`,
            entityType: 'Problem',
            entityId: problemId,
            metadata: {
              previousStatus: problem.status,
              newStatus: targetStatus,
            },
          },
        });

        return updated;
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to transition problem status.');
    }
  }
}
