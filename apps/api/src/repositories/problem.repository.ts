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
export type ProblemSortField = 'newest' | 'oldest' | 'title' | 'difficulty';
export type SortOrderDirection = 'asc' | 'desc';

export interface ProblemTagItemDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
}

export interface SupportedLanguageItemDto {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly version: string;
  readonly isActive: boolean;
}

export interface ProblemCatalogueFilter {
  readonly search?: string | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly tagSlug?: string | undefined;
  readonly viewerUserId?: string | undefined;
  readonly statusFilter?: UserSolveProgressStatus | undefined;
  readonly sortBy?: ProblemSortField | undefined;
  readonly sortOrder?: SortOrderDirection | undefined;
}

export interface ProblemCatalogueItemDto {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly publishedAt: Date | null;
  readonly tags: readonly ProblemTagItemDto[];
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
  readonly comparisonMode: ComparisonMode;
  readonly floatTolerance: number | null;
  readonly publishedAt: Date | null;
  readonly tags: readonly ProblemTagItemDto[];
  readonly publicTestCases: readonly PublicTestCaseDto[];
  readonly userProgressStatus: UserSolveProgressStatus;
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

export interface AdminProblemListFilter {
  readonly search?: string | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly status?: ProblemStatus | undefined;
  readonly sortBy?: ProblemSortField | undefined;
  readonly sortOrder?: SortOrderDirection | undefined;
}

export interface AdminProblemSummaryRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly difficulty: Difficulty;
  readonly status: ProblemStatus;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly comparisonMode: ComparisonMode;
  readonly publicTestCaseCount: number;
  readonly hiddenTestCaseCount: number;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly tags: readonly ProblemTagItemDto[];
}

export interface AdminTestCaseRecord {
  readonly id: string;
  readonly sequence: number;
  readonly input: string;
  readonly expectedOutput: string;
  readonly explanation: string | null;
  readonly isPublic: boolean;
  readonly weight: number;
  readonly group: string | null;
}

export interface AdminProblemDetailRecord {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly statement: string;
  readonly inputFormat: string;
  readonly outputFormat: string;
  readonly constraints: string | null;
  readonly examples: Prisma.JsonValue;
  readonly explanation: string | null;
  readonly editorial: string | null;
  readonly difficulty: Difficulty;
  readonly status: ProblemStatus;
  readonly authorId: string | null;
  readonly timeLimitMs: number;
  readonly memoryLimitMb: number;
  readonly outputLimitBytes: number;
  readonly sourceSizeLimitBytes: number;
  readonly comparisonMode: ComparisonMode;
  readonly floatTolerance: number | null;
  readonly publishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly tags: readonly ProblemTagItemDto[];
  readonly testCases: readonly AdminTestCaseRecord[];
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
  readonly tagSlugs?: readonly string[] | undefined;
}

export interface UpdateProblemAdminInput {
  readonly slug?: string | undefined;
  readonly title?: string | undefined;
  readonly statement?: string | undefined;
  readonly inputFormat?: string | undefined;
  readonly outputFormat?: string | undefined;
  readonly constraints?: string | null | undefined;
  readonly examples?: Prisma.InputJsonValue | undefined;
  readonly explanation?: string | null | undefined;
  readonly editorial?: string | null | undefined;
  readonly difficulty?: Difficulty | undefined;
  readonly status?: 'DRAFT' | 'REVIEW' | undefined;
  readonly timeLimitMs?: number | undefined;
  readonly memoryLimitMb?: number | undefined;
  readonly outputLimitBytes?: number | undefined;
  readonly sourceSizeLimitBytes?: number | undefined;
  readonly comparisonMode?: ComparisonMode | undefined;
  readonly floatTolerance?: number | null | undefined;
  readonly tagIds?: readonly string[] | undefined;
  readonly tagSlugs?: readonly string[] | undefined;
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

function buildProblemOrderBy(
  sortBy?: ProblemSortField | undefined,
  sortOrder?: SortOrderDirection | undefined,
): Prisma.ProblemOrderByWithRelationInput[] {
  const direction = sortOrder ?? 'desc';

  switch (sortBy) {
    case 'oldest':
      return [{ publishedAt: 'asc' }, { createdAt: 'asc' }];
    case 'title':
      return [{ title: direction }, { createdAt: 'desc' }];
    case 'difficulty':
      return [{ difficulty: direction }, { publishedAt: 'desc' }, { createdAt: 'desc' }];
    case 'newest':
    default:
      return [{ publishedAt: direction }, { createdAt: direction }];
  }
}

function buildProgressWhereFilter(
  viewerUserId?: string,
  statusFilter?: UserSolveProgressStatus,
): Prisma.ProblemWhereInput {
  if (!viewerUserId || !statusFilter) {
    return {};
  }

  if (statusFilter === 'SOLVED') {
    return {
      progress: {
        some: {
          userId: viewerUserId,
          solved: true,
        },
      },
    };
  }

  if (statusFilter === 'ATTEMPTED') {
    return {
      progress: {
        some: {
          userId: viewerUserId,
          solved: false,
          attempts: { gt: 0 },
        },
      },
    };
  }

  return {
    NOT: {
      progress: {
        some: {
          userId: viewerUserId,
          OR: [{ solved: true }, { attempts: { gt: 0 } }],
        },
      },
    },
  };
}

async function resolveTagIdsInTransaction(
  tx: Prisma.TransactionClient,
  tagIds?: readonly string[] | undefined,
  tagSlugs?: readonly string[] | undefined,
): Promise<string[] | undefined> {
  if (tagIds === undefined && tagSlugs === undefined) {
    return undefined;
  }

  const resolvedIds = new Set<string>(tagIds ?? []);

  if (tagSlugs && tagSlugs.length > 0) {
    const normalizedSlugs = Array.from(new Set(tagSlugs.map((slug) => slug.trim().toLowerCase())));
    const matchingTags = await tx.tag.findMany({
      where: {
        slug: { in: normalizedSlugs },
      },
      select: {
        id: true,
        slug: true,
      },
    });

    if (matchingTags.length !== normalizedSlugs.length) {
      const foundSlugs = new Set(matchingTags.map((t) => t.slug));
      const missingSlugs = normalizedSlugs.filter((slug) => !foundSlugs.has(slug));
      throw new RepositoryError(
        'VALIDATION_ERROR',
        `Unknown problem tag slug(s): ${missingSlugs.join(', ')}`,
      );
    }

    for (const tag of matchingTags) {
      resolvedIds.add(tag.id);
    }
  }

  return Array.from(resolvedIds);
}

export class ProblemRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listAllTags(): Promise<readonly ProblemTagItemDto[]> {
    try {
      return await this.prisma.tag.findMany({
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
        },
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to query problem tags.');
    }
  }

  public async listActiveLanguages(): Promise<readonly SupportedLanguageItemDto[]> {
    try {
      return await this.prisma.language.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: {
          id: true,
          slug: true,
          name: true,
          version: true,
          isActive: true,
        },
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to query active languages.');
    }
  }

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

    if (
      !filter?.viewerUserId &&
      (filter?.statusFilter === 'SOLVED' || filter?.statusFilter === 'ATTEMPTED')
    ) {
      return {
        items: [],
        meta: buildPaginationMeta(pagination, 0),
      };
    }

    const progressWhereFilter = buildProgressWhereFilter(
      filter?.viewerUserId,
      filter?.statusFilter,
    );

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
      ...progressWhereFilter,
    };

    try {
      const [problems, totalItems] = await Promise.all([
        this.prisma.problem.findMany({
          where,
          orderBy: buildProblemOrderBy(filter?.sortBy, filter?.sortOrder),
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
   * exposes hidden test cases (`isPublic: false`), private editorials, or unpublished problems.
   */
  public async findPublishedProblemBySlug(
    slug: string,
    options?: { readonly viewerUserId?: string | undefined },
  ): Promise<PublicProblemDetailDto | null> {
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
          comparisonMode: true,
          floatTolerance: true,
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

      let userProgressStatus: UserSolveProgressStatus = 'UNSOLVED';
      if (options?.viewerUserId && this.prisma.userProblemProgress) {
        const progress = await this.prisma.userProblemProgress.findUnique({
          where: {
            userId_problemId: {
              userId: options.viewerUserId,
              problemId: problem.id,
            },
          },
          select: {
            solved: true,
            attempts: true,
          },
        });

        if (progress?.solved) {
          userProgressStatus = 'SOLVED';
        } else if (progress && progress.attempts > 0) {
          userProgressStatus = 'ATTEMPTED';
        }
      }

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
        comparisonMode: problem.comparisonMode ?? 'TRIM_WHITESPACE',
        floatTolerance: problem.floatTolerance ?? null,
        publishedAt: problem.publishedAt,
        tags: problem.tags.map((pt) => pt.tag),
        publicTestCases,
        userProgressStatus,
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

  public async listProblemsForAdmin(
    actor: RepositoryActor,
    filter?: AdminProblemListFilter,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<AdminProblemSummaryRecord>> {
    assertAdminActor(actor, 'listProblemsForAdmin');

    const pagination = normalizePagination(paginationInput);
    const trimmedSearch = filter?.search?.trim();

    const where: Prisma.ProblemWhereInput = {
      ...(filter?.status !== undefined ? { status: filter.status } : {}),
      ...(filter?.difficulty !== undefined ? { difficulty: filter.difficulty } : {}),
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
          orderBy: buildProblemOrderBy(filter?.sortBy, filter?.sortOrder),
          skip: pagination.skip,
          take: pagination.take,
          select: {
            id: true,
            slug: true,
            title: true,
            difficulty: true,
            status: true,
            timeLimitMs: true,
            memoryLimitMb: true,
            comparisonMode: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
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
              select: {
                isPublic: true,
              },
            },
          },
        }),
        this.prisma.problem.count({ where }),
      ]);

      const items: AdminProblemSummaryRecord[] = problems.map((p) => {
        const publicTestCaseCount = p.testCases.filter((tc) => tc.isPublic).length;
        const hiddenTestCaseCount = p.testCases.filter((tc) => !tc.isPublic).length;

        return {
          id: p.id,
          slug: p.slug,
          title: p.title,
          difficulty: p.difficulty,
          status: p.status,
          timeLimitMs: p.timeLimitMs,
          memoryLimitMb: p.memoryLimitMb,
          comparisonMode: p.comparisonMode ?? 'TRIM_WHITESPACE',
          publicTestCaseCount,
          hiddenTestCaseCount,
          publishedAt: p.publishedAt,
          createdAt: p.createdAt,
          updatedAt: p.updatedAt,
          tags: p.tags.map((pt) => pt.tag),
        };
      });

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to list problems for administrator.');
    }
  }

  public async findProblemByIdForAdmin(
    actor: RepositoryActor,
    problemId: string,
  ): Promise<AdminProblemDetailRecord | null> {
    assertAdminActor(actor, 'findProblemByIdForAdmin');

    try {
      const problem = await this.prisma.problem.findUnique({
        where: { id: problemId },
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
          editorial: true,
          difficulty: true,
          status: true,
          authorId: true,
          timeLimitMs: true,
          memoryLimitMb: true,
          outputLimitBytes: true,
          sourceSizeLimitBytes: true,
          comparisonMode: true,
          floatTolerance: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
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
            orderBy: { sequence: 'asc' },
            select: {
              id: true,
              sequence: true,
              input: true,
              expectedOutput: true,
              explanation: true,
              isPublic: true,
              weight: true,
              group: true,
            },
          },
        },
      });

      if (!problem) {
        return null;
      }

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
        editorial: problem.editorial,
        difficulty: problem.difficulty,
        status: problem.status,
        authorId: problem.authorId,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        outputLimitBytes: problem.outputLimitBytes,
        sourceSizeLimitBytes: problem.sourceSizeLimitBytes,
        comparisonMode: problem.comparisonMode ?? 'TRIM_WHITESPACE',
        floatTolerance: problem.floatTolerance ?? null,
        publishedAt: problem.publishedAt,
        createdAt: problem.createdAt,
        updatedAt: problem.updatedAt,
        tags: problem.tags.map((pt) => pt.tag),
        testCases: problem.testCases,
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to fetch problem detail for administrator.');
    }
  }

  public async createProblemForAdmin(
    actor: RepositoryActor,
    input: CreateProblemAdminInput,
  ): Promise<{ id: string; slug: string; status: ProblemStatus }> {
    assertAdminActor(actor, 'createProblemForAdmin');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const resolvedTagIds = await resolveTagIdsInTransaction(tx, input.tagIds, input.tagSlugs);

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
            ...(resolvedTagIds && resolvedTagIds.length > 0
              ? {
                  tags: {
                    create: resolvedTagIds.map((tagId) => ({ tagId })),
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

  public async updateProblemForAdmin(
    actor: RepositoryActor,
    problemId: string,
    input: UpdateProblemAdminInput,
  ): Promise<AdminProblemDetailRecord> {
    assertAdminActor(actor, 'updateProblemForAdmin');

    try {
      return await this.prisma.$transaction(async (tx) => {
        const existing = await tx.problem.findUnique({
          where: { id: problemId },
          select: {
            id: true,
            slug: true,
            status: true,
            comparisonMode: true,
            floatTolerance: true,
          },
        });

        if (!existing) {
          throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
        }

        const effectiveComparisonMode = input.comparisonMode ?? existing.comparisonMode;
        const effectiveFloatTolerance =
          input.floatTolerance !== undefined ? input.floatTolerance : existing.floatTolerance;

        if (
          effectiveComparisonMode === 'FLOAT_TOLERANCE' &&
          (effectiveFloatTolerance === null || effectiveFloatTolerance === undefined)
        ) {
          throw new RepositoryError(
            'VALIDATION_ERROR',
            'floatTolerance is required when comparisonMode is FLOAT_TOLERANCE.',
          );
        }

        const resolvedTagIds = await resolveTagIdsInTransaction(tx, input.tagIds, input.tagSlugs);

        if (resolvedTagIds !== undefined) {
          await tx.problemTag.deleteMany({
            where: { problemId },
          });

          if (resolvedTagIds.length > 0) {
            await tx.problemTag.createMany({
              data: resolvedTagIds.map((tagId) => ({
                problemId,
                tagId,
              })),
            });
          }
        }

        const updated = await tx.problem.update({
          where: { id: problemId },
          data: {
            ...(input.slug !== undefined ? { slug: input.slug.trim() } : {}),
            ...(input.title !== undefined ? { title: input.title.trim() } : {}),
            ...(input.statement !== undefined ? { statement: input.statement } : {}),
            ...(input.inputFormat !== undefined ? { inputFormat: input.inputFormat } : {}),
            ...(input.outputFormat !== undefined ? { outputFormat: input.outputFormat } : {}),
            ...(input.constraints !== undefined ? { constraints: input.constraints } : {}),
            ...(input.examples !== undefined ? { examples: input.examples } : {}),
            ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
            ...(input.editorial !== undefined ? { editorial: input.editorial } : {}),
            ...(input.difficulty !== undefined ? { difficulty: input.difficulty } : {}),
            ...(input.status !== undefined ? { status: input.status } : {}),
            ...(input.timeLimitMs !== undefined ? { timeLimitMs: input.timeLimitMs } : {}),
            ...(input.memoryLimitMb !== undefined ? { memoryLimitMb: input.memoryLimitMb } : {}),
            ...(input.outputLimitBytes !== undefined
              ? { outputLimitBytes: input.outputLimitBytes }
              : {}),
            ...(input.sourceSizeLimitBytes !== undefined
              ? { sourceSizeLimitBytes: input.sourceSizeLimitBytes }
              : {}),
            ...(input.comparisonMode !== undefined ? { comparisonMode: input.comparisonMode } : {}),
            ...(input.floatTolerance !== undefined ? { floatTolerance: input.floatTolerance } : {}),
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
            editorial: true,
            difficulty: true,
            status: true,
            authorId: true,
            timeLimitMs: true,
            memoryLimitMb: true,
            outputLimitBytes: true,
            sourceSizeLimitBytes: true,
            comparisonMode: true,
            floatTolerance: true,
            publishedAt: true,
            createdAt: true,
            updatedAt: true,
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
              orderBy: { sequence: 'asc' },
              select: {
                id: true,
                sequence: true,
                input: true,
                expectedOutput: true,
                explanation: true,
                isPublic: true,
                weight: true,
                group: true,
              },
            },
          },
        });

        await tx.auditLog.create({
          data: {
            actorUserId: actor.userId,
            action: 'PROBLEM_UPDATED',
            entityType: 'Problem',
            entityId: problemId,
            metadata: {
              slug: updated.slug,
              status: updated.status,
            },
          },
        });

        return {
          id: updated.id,
          slug: updated.slug,
          title: updated.title,
          statement: updated.statement,
          inputFormat: updated.inputFormat,
          outputFormat: updated.outputFormat,
          constraints: updated.constraints,
          examples: updated.examples,
          explanation: updated.explanation,
          editorial: updated.editorial,
          difficulty: updated.difficulty,
          status: updated.status,
          authorId: updated.authorId,
          timeLimitMs: updated.timeLimitMs,
          memoryLimitMb: updated.memoryLimitMb,
          outputLimitBytes: updated.outputLimitBytes,
          sourceSizeLimitBytes: updated.sourceSizeLimitBytes,
          comparisonMode: updated.comparisonMode ?? 'TRIM_WHITESPACE',
          floatTolerance: updated.floatTolerance ?? null,
          publishedAt: updated.publishedAt,
          createdAt: updated.createdAt,
          updatedAt: updated.updatedAt,
          tags: updated.tags.map((pt) => pt.tag),
          testCases: updated.testCases,
        };
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to update problem.');
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
          select: { id: true, slug: true, status: true },
        });

        if (!existingProblem) {
          throw new RepositoryError('NOT_FOUND', `Problem not found: ${problemId}`);
        }

        const publicCount = testCases.filter((tc) => tc.isPublic).length;
        const hiddenCount = testCases.filter((tc) => !tc.isPublic).length;

        if (existingProblem.status === 'PUBLISHED' && (publicCount < 1 || hiddenCount < 1)) {
          const message =
            'A published problem must retain at least one public test case and one hidden test case.';
          throw new RepositoryError('VALIDATION_ERROR', message);
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
              publicCount,
              hiddenCount,
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
            const message =
              'Publishing a problem requires at least one public test case and one hidden test case.';
            throw new RepositoryError('VALIDATION_ERROR', message);
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
