import type {
  ExecutionMode,
  Prisma,
  PrismaClient,
  SubmissionSource,
  SubmissionStatus,
} from '../generated/prisma/client.js';
import {
  buildPaginationMeta,
  mapPrismaRepositoryError,
  normalizePagination,
  RepositoryError,
  type PaginatedResult,
  type PaginationInput,
  type RepositoryActor,
} from './types.js';

const VALID_SUBMISSION_STATE_TRANSITIONS: Readonly<
  Record<SubmissionStatus, readonly SubmissionStatus[]>
> = {
  QUEUED: ['RUNNING', 'CANCELLED', 'INTERNAL_ERROR'],
  RUNNING: [
    'QUEUED',
    'ACCEPTED',
    'WRONG_ANSWER',
    'COMPILATION_ERROR',
    'RUNTIME_ERROR',
    'TIME_LIMIT_EXCEEDED',
    'MEMORY_LIMIT_EXCEEDED',
    'OUTPUT_LIMIT_EXCEEDED',
    'INTERNAL_ERROR',
    'CANCELLED',
  ],
  ACCEPTED: [],
  WRONG_ANSWER: [],
  COMPILATION_ERROR: [],
  RUNTIME_ERROR: [],
  TIME_LIMIT_EXCEEDED: [],
  MEMORY_LIMIT_EXCEEDED: [],
  OUTPUT_LIMIT_EXCEEDED: [],
  INTERNAL_ERROR: [],
  CANCELLED: [],
};

export function isTerminalSubmissionStatus(status: SubmissionStatus): boolean {
  return status !== 'QUEUED' && status !== 'RUNNING';
}

export function isValidSubmissionStateTransition(
  fromStatus: SubmissionStatus,
  toStatus: SubmissionStatus,
): boolean {
  const allowedTargets = VALID_SUBMISSION_STATE_TRANSITIONS[fromStatus];
  return allowedTargets.includes(toStatus);
}

export function assertValidSubmissionStateTransition(
  fromStatus: SubmissionStatus,
  toStatus: SubmissionStatus,
): void {
  if (!isValidSubmissionStateTransition(fromStatus, toStatus)) {
    throw new RepositoryError(
      'INVALID_STATE_TRANSITION',
      `Invalid submission state transition from ${fromStatus} to ${toStatus}.`,
    );
  }
}

export interface CreateSubmissionInput {
  readonly userId: string;
  readonly problemId: string;
  readonly languageId: string;
  readonly sourceCode: string;
  readonly source?: SubmissionSource | undefined;
  readonly mode?: ExecutionMode | undefined;
  readonly contestId?: string | null | undefined;
  readonly idempotencyKey?: string | null | undefined;
}

export interface SubmissionSummaryDto {
  readonly id: string;
  readonly userId: string;
  readonly problemId: string;
  readonly languageId: string;
  readonly contestId: string | null;
  readonly status: SubmissionStatus;
  readonly source: SubmissionSource;
  readonly mode: ExecutionMode;
  readonly score: number;
  readonly passedTests: number;
  readonly totalTests: number;
  readonly executionTimeMs: number | null;
  readonly memoryUsedKb: number | null;
  readonly queuedAt: Date;
  readonly startedAt: Date | null;
  readonly finishedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SubmissionTestResultViewDto {
  readonly id: string;
  readonly testCaseId: string;
  readonly sequence: number;
  readonly isPublic: boolean;
  readonly status: SubmissionStatus;
  readonly executionTimeMs: number | null;
  readonly memoryUsedKb: number | null;
  readonly input: string | null;
  readonly expectedOutput: string | null;
  readonly actualOutput: string | null;
  readonly errorMessage: string | null;
}

export interface SubmissionDetailForActorDto extends SubmissionSummaryDto {
  readonly sourceCode: string;
  readonly errorMessage: string | null;
  readonly testResults: readonly SubmissionTestResultViewDto[];
}

export interface FinalizeTestCaseResultInput {
  readonly testCaseId: string;
  readonly status: SubmissionStatus;
  readonly executionTimeMs?: number | null | undefined;
  readonly memoryUsedKb?: number | null | undefined;
  readonly actualOutput?: string | null | undefined;
  readonly errorMessage?: string | null | undefined;
}

export interface FinalizeSubmissionVerdictInput {
  readonly submissionId: string;
  readonly finalStatus: SubmissionStatus;
  readonly score: number;
  readonly passedTests: number;
  readonly totalTests: number;
  readonly executionTimeMs?: number | null | undefined;
  readonly memoryUsedKb?: number | null | undefined;
  readonly errorMessage?: string | null | undefined;
  readonly testResults: readonly FinalizeTestCaseResultInput[];
  readonly finishedAt?: Date | undefined;
}

export interface UserSubmissionHistoryFilter {
  readonly problemId?: string | undefined;
  readonly languageId?: string | undefined;
  readonly status?: SubmissionStatus | undefined;
  readonly mode?: ExecutionMode | undefined;
  readonly contestId?: string | undefined;
}

const SUBMISSION_SUMMARY_SELECT = {
  id: true,
  userId: true,
  problemId: true,
  languageId: true,
  contestId: true,
  status: true,
  source: true,
  mode: true,
  score: true,
  passedTests: true,
  totalTests: true,
  executionTimeMs: true,
  memoryUsedKb: true,
  queuedAt: true,
  startedAt: true,
  finishedAt: true,
  createdAt: true,
  updatedAt: true,
} as const;

export class SubmissionRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Creates a queued submission idempotently.
   * When an `idempotencyKey` is supplied, duplicate requests from the same user
   * return the existing submission with `created: false`.
   */
  public async createSubmission(
    input: CreateSubmissionInput,
  ): Promise<{ readonly submission: SubmissionSummaryDto; readonly created: boolean }> {
    const normalizedIdempotencyKey = input.idempotencyKey?.trim() || null;

    try {
      return await this.prisma.$transaction(async (tx) => {
        if (normalizedIdempotencyKey !== null) {
          const existing = await tx.submission.findUnique({
            where: {
              userId_idempotencyKey: {
                userId: input.userId,
                idempotencyKey: normalizedIdempotencyKey,
              },
            },
            select: SUBMISSION_SUMMARY_SELECT,
          });

          if (existing) {
            return {
              submission: existing,
              created: false,
            };
          }
        }

        const submission = await tx.submission.create({
          data: {
            userId: input.userId,
            problemId: input.problemId,
            languageId: input.languageId,
            contestId: input.contestId ?? null,
            sourceCode: input.sourceCode,
            status: 'QUEUED',
            source: input.source ?? 'SUBMIT',
            mode: input.mode ?? 'PRACTICE',
            idempotencyKey: normalizedIdempotencyKey,
          },
          select: SUBMISSION_SUMMARY_SELECT,
        });

        return {
          submission,
          created: true,
        };
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to create submission.');
    }
  }

  /**
   * Atomically claims a submission for judging (`QUEUED | RUNNING -> RUNNING`).
   * If the submission is already in a terminal verdict or has exhausted retry attempts,
   * returns `{ claimed: false }` so duplicate SQS messages become safe no-ops.
   */
  public async claimSubmissionForJudging(
    submissionId: string,
    judgeJobId: string,
    maxAttempts = 3,
  ): Promise<{ readonly claimed: boolean; readonly status: SubmissionStatus | null }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.submission.findUnique({
          where: { id: submissionId },
          select: {
            id: true,
            status: true,
            judgeAttempts: true,
          },
        });

        if (!current) {
          return { claimed: false, status: null };
        }

        if (isTerminalSubmissionStatus(current.status) || current.judgeAttempts >= maxAttempts) {
          return { claimed: false, status: current.status };
        }

        assertValidSubmissionStateTransition(current.status, 'RUNNING');

        const updated = await tx.submission.updateMany({
          where: {
            id: submissionId,
            status: current.status,
            judgeAttempts: current.judgeAttempts,
          },
          data: {
            status: 'RUNNING',
            judgeJobId,
            judgeAttempts: { increment: 1 },
            startedAt: new Date(),
          },
        });

        return {
          claimed: updated.count === 1,
          status: updated.count === 1 ? 'RUNNING' : current.status,
        };
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to claim submission for judging.');
    }
  }

  /**
   * Finalizes a submission's verdict, test results, user problem progress, and profile counters
   * inside a single atomic transaction guarded by `status === 'RUNNING'`.
   */
  public async finalizeSubmissionVerdict(
    input: FinalizeSubmissionVerdictInput,
  ): Promise<{ readonly finalized: boolean; readonly submission: SubmissionSummaryDto | null }> {
    if (!isTerminalSubmissionStatus(input.finalStatus)) {
      throw new RepositoryError(
        'INVALID_STATE_TRANSITION',
        `Final submission verdict must be a terminal status, received: ${input.finalStatus}`,
      );
    }

    const finishedAt = input.finishedAt ?? new Date();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const current = await tx.submission.findUnique({
          where: { id: input.submissionId },
          select: {
            id: true,
            userId: true,
            problemId: true,
            status: true,
            source: true,
            mode: true,
          },
        });

        if (!current) {
          throw new RepositoryError('NOT_FOUND', `Submission not found: ${input.submissionId}`);
        }

        if (isTerminalSubmissionStatus(current.status)) {
          const existingSummary = await tx.submission.findUnique({
            where: { id: input.submissionId },
            select: SUBMISSION_SUMMARY_SELECT,
          });
          return {
            finalized: false,
            submission: existingSummary,
          };
        }

        assertValidSubmissionStateTransition(current.status, input.finalStatus);

        for (const testResult of input.testResults) {
          await tx.submissionTestResult.upsert({
            where: {
              submissionId_testCaseId: {
                submissionId: input.submissionId,
                testCaseId: testResult.testCaseId,
              },
            },
            update: {
              status: testResult.status,
              executionTimeMs: testResult.executionTimeMs ?? null,
              memoryUsedKb: testResult.memoryUsedKb ?? null,
              actualOutput: testResult.actualOutput ?? null,
              errorMessage: testResult.errorMessage ?? null,
            },
            create: {
              submissionId: input.submissionId,
              testCaseId: testResult.testCaseId,
              status: testResult.status,
              executionTimeMs: testResult.executionTimeMs ?? null,
              memoryUsedKb: testResult.memoryUsedKb ?? null,
              actualOutput: testResult.actualOutput ?? null,
              errorMessage: testResult.errorMessage ?? null,
            },
          });
        }

        const updatedSubmission = await tx.submission.update({
          where: { id: input.submissionId },
          data: {
            status: input.finalStatus,
            score: input.score,
            passedTests: input.passedTests,
            totalTests: input.totalTests,
            executionTimeMs: input.executionTimeMs ?? null,
            memoryUsedKb: input.memoryUsedKb ?? null,
            errorMessage: input.errorMessage ?? null,
            finishedAt,
          },
          select: SUBMISSION_SUMMARY_SELECT,
        });

        // Official SUBMIT executions update UserProblemProgress and Profile statistics
        if (current.source === 'SUBMIT') {
          const existingProgress = await tx.userProblemProgress.findUnique({
            where: {
              userId_problemId: {
                userId: current.userId,
                problemId: current.problemId,
              },
            },
          });

          const isAccepted = input.finalStatus === 'ACCEPTED';
          const wasAlreadySolved = existingProgress?.solved === true;
          const wasAlreadyAttempted = existingProgress !== null;

          const runtimeCandidate = input.executionTimeMs ?? null;
          const memoryCandidate = input.memoryUsedKb ?? null;

          const nextBestRuntime =
            isAccepted && runtimeCandidate !== null
              ? existingProgress?.bestRuntimeMs !== null &&
                existingProgress?.bestRuntimeMs !== undefined
                ? Math.min(existingProgress.bestRuntimeMs, runtimeCandidate)
                : runtimeCandidate
              : (existingProgress?.bestRuntimeMs ?? null);

          const nextBestMemory =
            isAccepted && memoryCandidate !== null
              ? existingProgress?.bestMemoryKb !== null &&
                existingProgress?.bestMemoryKb !== undefined
                ? Math.min(existingProgress.bestMemoryKb, memoryCandidate)
                : memoryCandidate
              : (existingProgress?.bestMemoryKb ?? null);

          const improvedBestSubmissionId =
            isAccepted &&
            (existingProgress?.bestSubmissionId === null ||
              existingProgress?.bestSubmissionId === undefined ||
              nextBestRuntime === runtimeCandidate)
              ? input.submissionId
              : (existingProgress?.bestSubmissionId ?? null);

          await tx.userProblemProgress.upsert({
            where: {
              userId_problemId: {
                userId: current.userId,
                problemId: current.problemId,
              },
            },
            update: {
              solved: wasAlreadySolved || isAccepted,
              attempts: { increment: 1 },
              bestRuntimeMs: nextBestRuntime,
              bestMemoryKb: nextBestMemory,
              bestSubmissionId: improvedBestSubmissionId,
              firstSolvedAt:
                wasAlreadySolved && existingProgress?.firstSolvedAt
                  ? existingProgress.firstSolvedAt
                  : isAccepted
                    ? finishedAt
                    : null,
              lastAttemptAt: finishedAt,
            },
            create: {
              userId: current.userId,
              problemId: current.problemId,
              solved: isAccepted,
              attempts: 1,
              bestRuntimeMs: isAccepted ? runtimeCandidate : null,
              bestMemoryKb: isAccepted ? memoryCandidate : null,
              bestSubmissionId: isAccepted ? input.submissionId : null,
              firstSolvedAt: isAccepted ? finishedAt : null,
              lastAttemptAt: finishedAt,
            },
          });

          const solvedIncrement = !wasAlreadySolved && isAccepted ? 1 : 0;
          const attemptedIncrement = !wasAlreadyAttempted ? 1 : 0;

          if (solvedIncrement > 0 || attemptedIncrement > 0) {
            await tx.profile.updateMany({
              where: { userId: current.userId },
              data: {
                ...(solvedIncrement > 0 ? { solvedCount: { increment: solvedIncrement } } : {}),
                ...(attemptedIncrement > 0
                  ? { attemptedCount: { increment: attemptedIncrement } }
                  : {}),
              },
            });
          }
        }

        return {
          finalized: true,
          submission: updatedSubmission,
        };
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to finalize submission verdict.');
    }
  }

  /**
   * Retrieves a submission by ID with strict IDOR ownership protection and hidden testcase masking.
   *
   * - Only the submission owner or an ADMIN can inspect a submission.
   * - For non-admin users, any test result belonging to a hidden test case (`isPublic: false`)
   *   has `input`, `expectedOutput`, and `actualOutput` stripped (`null`).
   */
  public async findSubmissionByIdForActor(
    submissionId: string,
    actor: RepositoryActor,
  ): Promise<SubmissionDetailForActorDto | null> {
    try {
      const submission = await this.prisma.submission.findUnique({
        where: { id: submissionId },
        select: {
          ...SUBMISSION_SUMMARY_SELECT,
          sourceCode: true,
          errorMessage: true,
          testResults: {
            orderBy: {
              testCase: {
                sequence: 'asc',
              },
            },
            select: {
              id: true,
              testCaseId: true,
              status: true,
              executionTimeMs: true,
              memoryUsedKb: true,
              actualOutput: true,
              errorMessage: true,
              testCase: {
                select: {
                  sequence: true,
                  isPublic: true,
                  input: true,
                  expectedOutput: true,
                },
              },
            },
          },
        },
      });

      if (!submission) {
        return null;
      }

      if (submission.userId !== actor.userId && actor.role !== 'ADMIN') {
        throw new RepositoryError(
          'FORBIDDEN',
          'You do not have permission to view another user’s submission.',
        );
      }

      const isAdmin = actor.role === 'ADMIN';

      const sanitizedTestResults: SubmissionTestResultViewDto[] = submission.testResults.map(
        (tr) => {
          const canRevealDetails = isAdmin || tr.testCase.isPublic === true;

          return {
            id: tr.id,
            testCaseId: tr.testCaseId,
            sequence: tr.testCase.sequence,
            isPublic: tr.testCase.isPublic,
            status: tr.status,
            executionTimeMs: tr.executionTimeMs,
            memoryUsedKb: tr.memoryUsedKb,
            input: canRevealDetails ? tr.testCase.input : null,
            expectedOutput: canRevealDetails ? tr.testCase.expectedOutput : null,
            actualOutput: canRevealDetails ? tr.actualOutput : null,
            errorMessage: canRevealDetails ? tr.errorMessage : null,
          };
        },
      );

      return {
        id: submission.id,
        userId: submission.userId,
        problemId: submission.problemId,
        languageId: submission.languageId,
        contestId: submission.contestId,
        status: submission.status,
        source: submission.source,
        mode: submission.mode,
        score: submission.score,
        passedTests: submission.passedTests,
        totalTests: submission.totalTests,
        executionTimeMs: submission.executionTimeMs,
        memoryUsedKb: submission.memoryUsedKb,
        queuedAt: submission.queuedAt,
        startedAt: submission.startedAt,
        finishedAt: submission.finishedAt,
        createdAt: submission.createdAt,
        updatedAt: submission.updatedAt,
        sourceCode: submission.sourceCode,
        errorMessage: submission.errorMessage,
        testResults: sanitizedTestResults,
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to fetch submission details.');
    }
  }

  public async listSubmissionsForUser(
    userId: string,
    filter?: UserSubmissionHistoryFilter,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<SubmissionSummaryDto>> {
    const pagination = normalizePagination(paginationInput);
    const where: Prisma.SubmissionWhereInput = {
      userId,
      source: 'SUBMIT',
      ...(filter?.problemId !== undefined ? { problemId: filter.problemId } : {}),
      ...(filter?.languageId !== undefined ? { languageId: filter.languageId } : {}),
      ...(filter?.status !== undefined ? { status: filter.status } : {}),
      ...(filter?.mode !== undefined ? { mode: filter.mode } : {}),
      ...(filter?.contestId !== undefined ? { contestId: filter.contestId } : {}),
    };

    try {
      const [items, totalItems] = await Promise.all([
        this.prisma.submission.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
          select: SUBMISSION_SUMMARY_SELECT,
        }),
        this.prisma.submission.count({ where }),
      ]);

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to list user submissions.');
    }
  }
}
