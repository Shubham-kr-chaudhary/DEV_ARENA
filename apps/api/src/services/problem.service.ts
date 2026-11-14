import {
  adminProblemDetailResponseSchema,
  adminProblemLifecycleResponseSchema,
  adminProblemListResponseSchema,
  adminReplaceTestCasesResponseSchema,
  problemExampleSchema,
  problemListResponseSchema,
  problemSlugSchema,
  publicProblemDetailResponseSchema,
  type AdminProblemDetailDto,
  type AdminProblemDetailResponse,
  type AdminProblemLifecycleResponse,
  type AdminProblemListQuery,
  type AdminProblemListResponse,
  type AdminReplaceTestCasesResponse,
  type CreateProblemRequest,
  type ProblemExampleDto,
  type ProblemListQuery,
  type ProblemListResponse,
  type PublicProblemDetailResponse,
  type ReplaceProblemTestCasesRequest,
  type UpdateProblemRequest,
} from '@devarena/api-contracts';
import { z } from 'zod';
import { ApiHttpError } from '../errors/http-error.js';
import type { ProblemStatus } from '../generated/prisma/client.js';
import type {
  AdminProblemDetailRecord,
  AdminProblemListFilter,
  AdminProblemSummaryRecord,
  CreateProblemAdminInput,
  PaginatedResult,
  PaginationInput,
  ProblemCatalogueFilter,
  ProblemCatalogueItemDto,
  ProblemTagItemDto,
  PublicProblemDetailDto,
  RepositoryActor,
  SupportedLanguageItemDto,
  TestCaseAdminInput,
  UpdateProblemAdminInput,
} from '../repositories/index.js';

const uuidParamSchema = z.string().uuid('Identifier must be a valid UUID.');

export interface ProblemRepositoryPort {
  listAllTags(): Promise<readonly ProblemTagItemDto[]>;
  listActiveLanguages(): Promise<readonly SupportedLanguageItemDto[]>;
  listPublishedProblems(
    filter?: ProblemCatalogueFilter,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<ProblemCatalogueItemDto>>;
  findPublishedProblemBySlug(
    slug: string,
    options?: { readonly viewerUserId?: string | undefined },
  ): Promise<PublicProblemDetailDto | null>;
  listProblemsForAdmin(
    actor: RepositoryActor,
    filter?: AdminProblemListFilter,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<AdminProblemSummaryRecord>>;
  findProblemByIdForAdmin(
    actor: RepositoryActor,
    problemId: string,
  ): Promise<AdminProblemDetailRecord | null>;
  createProblemForAdmin(
    actor: RepositoryActor,
    input: CreateProblemAdminInput,
  ): Promise<{ id: string; slug: string; status: ProblemStatus }>;
  updateProblemForAdmin(
    actor: RepositoryActor,
    problemId: string,
    input: UpdateProblemAdminInput,
  ): Promise<AdminProblemDetailRecord>;
  replaceProblemTestCasesForAdmin(
    actor: RepositoryActor,
    problemId: string,
    testCases: readonly TestCaseAdminInput[],
  ): Promise<number>;
  transitionProblemStatusForAdmin(
    actor: RepositoryActor,
    problemId: string,
    targetStatus: ProblemStatus,
  ): Promise<{ id: string; slug: string; status: ProblemStatus; publishedAt: Date | null }>;
}

function normalizeExamplesJson(rawExamples: unknown): ProblemExampleDto[] {
  if (!Array.isArray(rawExamples)) {
    return [];
  }

  const parsed: ProblemExampleDto[] = [];
  for (const item of rawExamples) {
    const result = problemExampleSchema.safeParse(item);
    if (result.success) {
      parsed.push(result.data);
    }
  }
  return parsed;
}

function formatAdminProblemDetailDto(record: AdminProblemDetailRecord): AdminProblemDetailDto {
  return {
    id: record.id,
    slug: record.slug,
    title: record.title,
    statement: record.statement,
    inputFormat: record.inputFormat,
    outputFormat: record.outputFormat,
    constraints: record.constraints,
    examples: normalizeExamplesJson(record.examples),
    explanation: record.explanation,
    editorial: record.editorial,
    difficulty: record.difficulty,
    status: record.status,
    authorId: record.authorId,
    timeLimitMs: record.timeLimitMs,
    memoryLimitMb: record.memoryLimitMb,
    outputLimitBytes: record.outputLimitBytes,
    sourceSizeLimitBytes: record.sourceSizeLimitBytes,
    comparisonMode: record.comparisonMode,
    floatTolerance: record.floatTolerance,
    publishedAt: record.publishedAt ? record.publishedAt.toISOString() : null,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    tags: record.tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    testCases: record.testCases.map((tc) => ({
      id: tc.id,
      sequence: tc.sequence,
      input: tc.input,
      expectedOutput: tc.expectedOutput,
      explanation: tc.explanation,
      isPublic: tc.isPublic,
      weight: tc.weight,
      group: tc.group,
    })),
  };
}

export class ProblemService {
  public constructor(private readonly problemRepository: ProblemRepositoryPort) {}

  public async listPublishedProblems(
    query: ProblemListQuery,
    viewerUserId?: string,
  ): Promise<ProblemListResponse> {
    const [catalogue, availableTags] = await Promise.all([
      this.problemRepository.listPublishedProblems(
        {
          ...(query.search !== undefined && query.search.length > 0
            ? { search: query.search }
            : {}),
          ...(query.difficulty !== undefined ? { difficulty: query.difficulty } : {}),
          ...(query.tag !== undefined ? { tagSlug: query.tag } : {}),
          ...(viewerUserId !== undefined ? { viewerUserId } : {}),
          ...(query.status !== undefined ? { statusFilter: query.status } : {}),
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
        {
          page: query.page,
          pageSize: query.pageSize,
        },
      ),
      this.problemRepository.listAllTags(),
    ]);

    return problemListResponseSchema.parse({
      items: catalogue.items.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        difficulty: item.difficulty,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        tags: item.tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
        userProgressStatus: item.userProgressStatus,
      })),
      meta: catalogue.meta,
      availableTags: availableTags.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    });
  }

  public async getPublishedProblemBySlug(
    rawSlug: string,
    viewerUserId?: string,
  ): Promise<PublicProblemDetailResponse> {
    const slug = problemSlugSchema.parse(rawSlug);

    const [problem, activeLanguages] = await Promise.all([
      this.problemRepository.findPublishedProblemBySlug(slug, {
        ...(viewerUserId !== undefined ? { viewerUserId } : {}),
      }),
      this.problemRepository.listActiveLanguages(),
    ]);

    if (!problem) {
      throw new ApiHttpError(404, 'NOT_FOUND', `Problem '${slug}' was not found.`);
    }

    return publicProblemDetailResponseSchema.parse({
      problem: {
        id: problem.id,
        slug: problem.slug,
        title: problem.title,
        statement: problem.statement,
        inputFormat: problem.inputFormat,
        outputFormat: problem.outputFormat,
        constraints: problem.constraints,
        examples: normalizeExamplesJson(problem.examples),
        explanation: problem.explanation,
        difficulty: problem.difficulty,
        timeLimitMs: problem.timeLimitMs,
        memoryLimitMb: problem.memoryLimitMb,
        outputLimitBytes: problem.outputLimitBytes,
        sourceSizeLimitBytes: problem.sourceSizeLimitBytes,
        comparisonMode: problem.comparisonMode,
        floatTolerance: problem.floatTolerance,
        publishedAt: problem.publishedAt ? problem.publishedAt.toISOString() : null,
        tags: problem.tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
        supportedLanguages: activeLanguages.map((lang) => ({
          id: lang.id,
          slug: lang.slug,
          name: lang.name,
          version: lang.version,
          isActive: lang.isActive,
        })),
        publicTestCases: problem.publicTestCases
          .filter((tc) => tc.isPublic === true)
          .map((tc) => ({
            id: tc.id,
            sequence: tc.sequence,
            input: tc.input,
            expectedOutput: tc.expectedOutput,
            explanation: tc.explanation,
            isPublic: true as const,
          })),
        userProgressStatus: problem.userProgressStatus,
      },
    });
  }

  public async listAdminProblems(
    actor: RepositoryActor,
    query: AdminProblemListQuery,
  ): Promise<AdminProblemListResponse> {
    const [result, availableTags] = await Promise.all([
      this.problemRepository.listProblemsForAdmin(
        actor,
        {
          ...(query.search !== undefined && query.search.length > 0
            ? { search: query.search }
            : {}),
          ...(query.difficulty !== undefined ? { difficulty: query.difficulty } : {}),
          ...(query.status !== undefined ? { status: query.status } : {}),
          sortBy: query.sortBy,
          sortOrder: query.sortOrder,
        },
        {
          page: query.page,
          pageSize: query.pageSize,
        },
      ),
      this.problemRepository.listAllTags(),
    ]);

    return adminProblemListResponseSchema.parse({
      items: result.items.map((item) => ({
        id: item.id,
        slug: item.slug,
        title: item.title,
        difficulty: item.difficulty,
        status: item.status,
        timeLimitMs: item.timeLimitMs,
        memoryLimitMb: item.memoryLimitMb,
        comparisonMode: item.comparisonMode,
        publicTestCaseCount: item.publicTestCaseCount,
        hiddenTestCaseCount: item.hiddenTestCaseCount,
        publishedAt: item.publishedAt ? item.publishedAt.toISOString() : null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        tags: item.tags.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
      })),
      meta: result.meta,
      availableTags: availableTags.map((t) => ({ id: t.id, slug: t.slug, name: t.name })),
    });
  }

  public async getAdminProblemById(
    actor: RepositoryActor,
    rawProblemId: string,
  ): Promise<AdminProblemDetailResponse> {
    const problemId = uuidParamSchema.parse(rawProblemId);
    const record = await this.problemRepository.findProblemByIdForAdmin(actor, problemId);
    if (!record) {
      throw new ApiHttpError(404, 'NOT_FOUND', `Problem '${problemId}' was not found.`);
    }

    return adminProblemDetailResponseSchema.parse({
      problem: formatAdminProblemDetailDto(record),
    });
  }

  public async createProblem(
    actor: RepositoryActor,
    input: CreateProblemRequest,
  ): Promise<AdminProblemDetailResponse> {
    const created = await this.problemRepository.createProblemForAdmin(actor, {
      slug: input.slug,
      title: input.title,
      statement: input.statement,
      inputFormat: input.inputFormat,
      outputFormat: input.outputFormat,
      constraints: input.constraints ?? null,
      examples: input.examples,
      explanation: input.explanation ?? null,
      editorial: input.editorial ?? null,
      difficulty: input.difficulty,
      timeLimitMs: input.timeLimitMs,
      memoryLimitMb: input.memoryLimitMb,
      outputLimitBytes: input.outputLimitBytes,
      sourceSizeLimitBytes: input.sourceSizeLimitBytes,
      comparisonMode: input.comparisonMode,
      floatTolerance: input.floatTolerance ?? null,
      ...(input.tagIds !== undefined ? { tagIds: input.tagIds } : {}),
      ...(input.tagSlugs !== undefined ? { tagSlugs: input.tagSlugs } : {}),
    });

    const record = await this.problemRepository.findProblemByIdForAdmin(actor, created.id);
    if (!record) {
      throw new ApiHttpError(
        500,
        'INTERNAL_ERROR',
        'Created problem could not be reloaded after persistence.',
      );
    }

    return adminProblemDetailResponseSchema.parse({
      problem: formatAdminProblemDetailDto(record),
    });
  }

  public async updateProblem(
    actor: RepositoryActor,
    rawProblemId: string,
    input: UpdateProblemRequest,
  ): Promise<AdminProblemDetailResponse> {
    const problemId = uuidParamSchema.parse(rawProblemId);

    const updated = await this.problemRepository.updateProblemForAdmin(actor, problemId, {
      ...(input.slug !== undefined ? { slug: input.slug } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
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
      ...(input.outputLimitBytes !== undefined ? { outputLimitBytes: input.outputLimitBytes } : {}),
      ...(input.sourceSizeLimitBytes !== undefined
        ? { sourceSizeLimitBytes: input.sourceSizeLimitBytes }
        : {}),
      ...(input.comparisonMode !== undefined ? { comparisonMode: input.comparisonMode } : {}),
      ...(input.floatTolerance !== undefined ? { floatTolerance: input.floatTolerance } : {}),
      ...(input.tagIds !== undefined ? { tagIds: input.tagIds } : {}),
      ...(input.tagSlugs !== undefined ? { tagSlugs: input.tagSlugs } : {}),
    });

    return adminProblemDetailResponseSchema.parse({
      problem: formatAdminProblemDetailDto(updated),
    });
  }

  public async replaceProblemTestCases(
    actor: RepositoryActor,
    rawProblemId: string,
    input: ReplaceProblemTestCasesRequest,
  ): Promise<AdminReplaceTestCasesResponse> {
    const problemId = uuidParamSchema.parse(rawProblemId);

    const totalTestCases = await this.problemRepository.replaceProblemTestCasesForAdmin(
      actor,
      problemId,
      input.testCases.map((tc) => ({
        sequence: tc.sequence,
        input: tc.input,
        expectedOutput: tc.expectedOutput,
        explanation: tc.explanation ?? null,
        isPublic: tc.isPublic,
        weight: tc.weight,
        group: tc.group ?? null,
      })),
    );

    const publicTestCaseCount = input.testCases.filter((tc) => tc.isPublic).length;
    const hiddenTestCaseCount = input.testCases.filter((tc) => !tc.isPublic).length;

    return adminReplaceTestCasesResponseSchema.parse({
      problemId,
      totalTestCases,
      publicTestCaseCount,
      hiddenTestCaseCount,
    });
  }

  public async transitionProblemStatus(
    actor: RepositoryActor,
    rawProblemId: string,
    targetStatus: ProblemStatus,
  ): Promise<AdminProblemLifecycleResponse> {
    const problemId = uuidParamSchema.parse(rawProblemId);
    const updated = await this.problemRepository.transitionProblemStatusForAdmin(
      actor,
      problemId,
      targetStatus,
    );

    return adminProblemLifecycleResponseSchema.parse({
      problem: {
        id: updated.id,
        slug: updated.slug,
        status: updated.status,
        publishedAt: updated.publishedAt ? updated.publishedAt.toISOString() : null,
      },
    });
  }
}
