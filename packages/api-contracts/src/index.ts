import { z } from 'zod';

export const healthResponseSchema = z.object({
  status: z.literal('ok'),
  service: z.string().min(1),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export const dependencyStatusSchema = z.enum(['up', 'down', 'not_configured']);

export const readinessResponseSchema = z.object({
  status: z.enum(['ready', 'not_ready']),
  service: z.string().min(1),
  checks: z.object({
    database: dependencyStatusSchema.optional(),
    queue: dependencyStatusSchema.optional(),
  }),
});

export type ReadinessResponse = z.infer<typeof readinessResponseSchema>;

export const apiErrorCodeSchema = z.enum([
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'JUDGE_UNAVAILABLE',
  'INTERNAL_ERROR',
]);

export type ApiErrorCode = z.infer<typeof apiErrorCodeSchema>;

export const apiErrorDetailSchema = z.object({
  field: z.string().optional(),
  message: z.string().min(1),
});

export const apiErrorResponseSchema = z.object({
  error: z.object({
    code: apiErrorCodeSchema,
    message: z.string().min(1),
    requestId: z.string().optional(),
    details: z.array(apiErrorDetailSchema).optional(),
  }),
});

export type ApiErrorResponse = z.infer<typeof apiErrorResponseSchema>;

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
});

export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const paginationMetaSchema = z.object({
  page: z.number().int().min(1),
  pageSize: z.number().int().min(1).max(100),
  totalItems: z.number().int().min(0),
  totalPages: z.number().int().min(0),
});

export type PaginationMeta = z.infer<typeof paginationMetaSchema>;

// Phase 3: Authentication & Authorization Contracts

export const userRoleSchema = z.enum(['USER', 'ADMIN']);
export type UserRoleDto = z.infer<typeof userRoleSchema>;

export const userStatusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);
export type UserStatusDto = z.infer<typeof userStatusSchema>;

export const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .max(320, 'Email must be at most 320 characters')
  .email('Must be a valid email address');

export const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters')
  .max(32, 'Username must be at most 32 characters')
  .regex(/^[a-zA-Z0-9_]+$/, 'Username may only contain letters, numbers, and underscores');

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password must be at most 128 characters');

export const registerRequestSchema = z.object({
  email: emailSchema,
  username: usernameSchema,
  password: passwordSchema,
  displayName: z.string().trim().min(1).max(80).optional(),
});

export type RegisterRequest = z.infer<typeof registerRequestSchema>;

export const loginRequestSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required').max(128),
});

export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const authenticatedProfileSchema = z.object({
  id: z.string().uuid(),
  username: z.string(),
  displayName: z.string().nullable(),
  bio: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  rating: z.number().int(),
  maxRating: z.number().int(),
  rankTitle: z.string(),
  solvedCount: z.number().int(),
  attemptedCount: z.number().int(),
  contestCount: z.number().int(),
});

export type AuthenticatedProfileDto = z.infer<typeof authenticatedProfileSchema>;

export const authenticatedUserSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  role: userRoleSchema,
  status: userStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  profile: authenticatedProfileSchema.nullable(),
});

export type AuthenticatedUserDto = z.infer<typeof authenticatedUserSchema>;

export const authSessionResponseSchema = z.object({
  user: authenticatedUserSchema,
});

export type AuthSessionResponse = z.infer<typeof authSessionResponseSchema>;

export const logoutResponseSchema = z.object({
  status: z.literal('logged_out'),
});

export type LogoutResponse = z.infer<typeof logoutResponseSchema>;

// Phase 4: Problem System Contracts

export const problemDifficultySchema = z.enum(['EASY', 'MEDIUM', 'HARD']);
export type ProblemDifficultyDto = z.infer<typeof problemDifficultySchema>;

export const problemStatusSchema = z.enum(['DRAFT', 'REVIEW', 'PUBLISHED', 'ARCHIVED']);
export type ProblemStatusDto = z.infer<typeof problemStatusSchema>;

export const comparisonModeSchema = z.enum([
  'EXACT',
  'TRIM_WHITESPACE',
  'TOKEN_WHITESPACE',
  'FLOAT_TOLERANCE',
  'CUSTOM_CHECKER',
]);
export type ComparisonModeDto = z.infer<typeof comparisonModeSchema>;

export const userSolveProgressStatusSchema = z.enum(['SOLVED', 'ATTEMPTED', 'UNSOLVED']);
export type UserSolveProgressStatusDto = z.infer<typeof userSolveProgressStatusSchema>;

export const problemSortFieldSchema = z.enum(['newest', 'oldest', 'title', 'difficulty']);
export type ProblemSortFieldDto = z.infer<typeof problemSortFieldSchema>;

export const sortOrderSchema = z.enum(['asc', 'desc']);
export type SortOrderDto = z.infer<typeof sortOrderSchema>;

export const problemSlugSchema = z
  .string()
  .trim()
  .min(2, 'Problem slug must be at least 2 characters')
  .max(120, 'Problem slug must be at most 120 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Problem slug must be lowercase kebab-case');

export const tagSlugSchema = z
  .string()
  .trim()
  .min(1, 'Tag slug is required')
  .max(80, 'Tag slug must be at most 80 characters')
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Tag slug must be lowercase kebab-case');

export const problemTagSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
});

export type ProblemTagDto = z.infer<typeof problemTagSchema>;

export const supportedLanguageSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  version: z.string().min(1),
  isActive: z.boolean(),
});

export type SupportedLanguageDto = z.infer<typeof supportedLanguageSchema>;

export const problemExampleSchema = z.object({
  input: z.string().min(1, 'Example input is required'),
  output: z.string().min(1, 'Example output is required'),
  explanation: z.string().nullable().optional(),
});

export type ProblemExampleDto = z.infer<typeof problemExampleSchema>;

export const publicTestCaseSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().min(1),
  input: z.string(),
  expectedOutput: z.string(),
  explanation: z.string().nullable(),
  isPublic: z.literal(true),
});

export type PublicTestCaseContractDto = z.infer<typeof publicTestCaseSchema>;

export const problemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  difficulty: problemDifficultySchema.optional(),
  tag: tagSlugSchema.optional(),
  status: userSolveProgressStatusSchema.optional(),
  sortBy: problemSortFieldSchema.default('newest'),
  sortOrder: sortOrderSchema.default('desc'),
});

export type ProblemListQuery = z.infer<typeof problemListQuerySchema>;

export const problemCatalogueItemSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  difficulty: problemDifficultySchema,
  publishedAt: z.string().nullable(),
  tags: z.array(problemTagSchema),
  userProgressStatus: userSolveProgressStatusSchema,
});

export type ProblemCatalogueItemContractDto = z.infer<typeof problemCatalogueItemSchema>;

export const problemListResponseSchema = z.object({
  items: z.array(problemCatalogueItemSchema),
  meta: paginationMetaSchema,
  availableTags: z.array(problemTagSchema),
});

export type ProblemListResponse = z.infer<typeof problemListResponseSchema>;

export const publicProblemDetailSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  statement: z.string(),
  inputFormat: z.string(),
  outputFormat: z.string(),
  constraints: z.string().nullable(),
  examples: z.array(problemExampleSchema),
  explanation: z.string().nullable(),
  difficulty: problemDifficultySchema,
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  outputLimitBytes: z.number().int().positive(),
  sourceSizeLimitBytes: z.number().int().positive(),
  comparisonMode: comparisonModeSchema,
  floatTolerance: z.number().nullable(),
  publishedAt: z.string().nullable(),
  tags: z.array(problemTagSchema),
  supportedLanguages: z.array(supportedLanguageSchema),
  publicTestCases: z.array(publicTestCaseSchema),
  userProgressStatus: userSolveProgressStatusSchema,
});

export type PublicProblemDetailContractDto = z.infer<typeof publicProblemDetailSchema>;

export const publicProblemDetailResponseSchema = z.object({
  problem: publicProblemDetailSchema,
});

export type PublicProblemDetailResponse = z.infer<typeof publicProblemDetailResponseSchema>;

// Admin Problem Management Contracts

export const adminProblemListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(120).optional(),
  difficulty: problemDifficultySchema.optional(),
  status: problemStatusSchema.optional(),
  sortBy: problemSortFieldSchema.default('newest'),
  sortOrder: sortOrderSchema.default('desc'),
});

export type AdminProblemListQuery = z.infer<typeof adminProblemListQuerySchema>;

export const adminProblemSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  difficulty: problemDifficultySchema,
  status: problemStatusSchema,
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  comparisonMode: comparisonModeSchema,
  publicTestCaseCount: z.number().int().min(0),
  hiddenTestCaseCount: z.number().int().min(0),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(problemTagSchema),
});

export type AdminProblemSummaryDto = z.infer<typeof adminProblemSummarySchema>;

export const adminProblemListResponseSchema = z.object({
  items: z.array(adminProblemSummarySchema),
  meta: paginationMetaSchema,
  availableTags: z.array(problemTagSchema),
});

export type AdminProblemListResponse = z.infer<typeof adminProblemListResponseSchema>;

export const adminTestCaseSchema = z.object({
  id: z.string().uuid(),
  sequence: z.number().int().min(1),
  input: z.string(),
  expectedOutput: z.string(),
  explanation: z.string().nullable(),
  isPublic: z.boolean(),
  weight: z.number().int().min(1),
  group: z.string().nullable(),
});

export type AdminTestCaseDto = z.infer<typeof adminTestCaseSchema>;

export const adminProblemDetailSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  title: z.string(),
  statement: z.string(),
  inputFormat: z.string(),
  outputFormat: z.string(),
  constraints: z.string().nullable(),
  examples: z.array(problemExampleSchema),
  explanation: z.string().nullable(),
  editorial: z.string().nullable(),
  difficulty: problemDifficultySchema,
  status: problemStatusSchema,
  authorId: z.string().uuid().nullable(),
  timeLimitMs: z.number().int().positive(),
  memoryLimitMb: z.number().int().positive(),
  outputLimitBytes: z.number().int().positive(),
  sourceSizeLimitBytes: z.number().int().positive(),
  comparisonMode: comparisonModeSchema,
  floatTolerance: z.number().nullable(),
  publishedAt: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
  tags: z.array(problemTagSchema),
  testCases: z.array(adminTestCaseSchema),
});

export type AdminProblemDetailDto = z.infer<typeof adminProblemDetailSchema>;

export const adminProblemDetailResponseSchema = z.object({
  problem: adminProblemDetailSchema,
});

export type AdminProblemDetailResponse = z.infer<typeof adminProblemDetailResponseSchema>;

export const createProblemRequestSchema = z
  .object({
    slug: problemSlugSchema,
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200),
    statement: z.string().trim().min(10, 'Problem statement must be at least 10 characters'),
    inputFormat: z.string().trim().min(1, 'Input format is required'),
    outputFormat: z.string().trim().min(1, 'Output format is required'),
    constraints: z.string().trim().min(1).nullable().optional(),
    examples: z.array(problemExampleSchema).max(10).default([]),
    explanation: z.string().trim().min(1).nullable().optional(),
    editorial: z.string().trim().min(1).nullable().optional(),
    difficulty: problemDifficultySchema,
    timeLimitMs: z.number().int().min(100).max(15000).default(2000),
    memoryLimitMb: z.number().int().min(16).max(1024).default(256),
    outputLimitBytes: z.number().int().min(1024).max(16777216).default(1048576),
    sourceSizeLimitBytes: z.number().int().min(1024).max(262144).default(65536),
    comparisonMode: comparisonModeSchema.default('TRIM_WHITESPACE'),
    floatTolerance: z.number().positive().max(1).nullable().optional(),
    tagSlugs: z.array(tagSlugSchema).max(10).optional(),
    tagIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (
      data.comparisonMode === 'FLOAT_TOLERANCE' &&
      (data.floatTolerance === undefined || data.floatTolerance === null)
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['floatTolerance'],
        message: 'floatTolerance is required when comparisonMode is FLOAT_TOLERANCE.',
      });
    }
  });

export type CreateProblemRequest = z.infer<typeof createProblemRequestSchema>;

export const updateProblemRequestSchema = z
  .object({
    slug: problemSlugSchema.optional(),
    title: z.string().trim().min(3, 'Title must be at least 3 characters').max(200).optional(),
    statement: z
      .string()
      .trim()
      .min(10, 'Problem statement must be at least 10 characters')
      .optional(),
    inputFormat: z.string().trim().min(1, 'Input format is required').optional(),
    outputFormat: z.string().trim().min(1, 'Output format is required').optional(),
    constraints: z.string().trim().min(1).nullable().optional(),
    examples: z.array(problemExampleSchema).max(10).optional(),
    explanation: z.string().trim().min(1).nullable().optional(),
    editorial: z.string().trim().min(1).nullable().optional(),
    difficulty: problemDifficultySchema.optional(),
    status: z.enum(['DRAFT', 'REVIEW']).optional(),
    timeLimitMs: z.number().int().min(100).max(15000).optional(),
    memoryLimitMb: z.number().int().min(16).max(1024).optional(),
    outputLimitBytes: z.number().int().min(1024).max(16777216).optional(),
    sourceSizeLimitBytes: z.number().int().min(1024).max(262144).optional(),
    comparisonMode: comparisonModeSchema.optional(),
    floatTolerance: z.number().positive().max(1).nullable().optional(),
    tagSlugs: z.array(tagSlugSchema).max(10).optional(),
    tagIds: z.array(z.string().uuid()).max(10).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.comparisonMode === 'FLOAT_TOLERANCE' && data.floatTolerance === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['floatTolerance'],
        message: 'floatTolerance cannot be null when comparisonMode is FLOAT_TOLERANCE.',
      });
    }
  });

export type UpdateProblemRequest = z.infer<typeof updateProblemRequestSchema>;

export const adminTestCaseInputSchema = z.object({
  sequence: z.number().int().min(1).max(500),
  input: z.string().min(1, 'Test case input cannot be empty').max(1048576),
  expectedOutput: z.string().min(1, 'Expected output cannot be empty').max(1048576),
  explanation: z.string().trim().max(2000).nullable().optional(),
  isPublic: z.boolean(),
  weight: z.number().int().min(1).max(100).default(1),
  group: z.string().trim().max(80).nullable().optional(),
});

export type AdminTestCaseInput = z.infer<typeof adminTestCaseInputSchema>;

export const replaceProblemTestCasesRequestSchema = z
  .object({
    testCases: z.array(adminTestCaseInputSchema).min(1).max(200),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<number>();
    data.testCases.forEach((tc, index) => {
      if (seen.has(tc.sequence)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['testCases', index, 'sequence'],
          message: `Duplicate test case sequence number: ${tc.sequence}`,
        });
      }
      seen.add(tc.sequence);
    });
  });

export type ReplaceProblemTestCasesRequest = z.infer<typeof replaceProblemTestCasesRequestSchema>;

export const adminProblemLifecycleResponseSchema = z.object({
  problem: z.object({
    id: z.string().uuid(),
    slug: z.string(),
    status: problemStatusSchema,
    publishedAt: z.string().nullable(),
  }),
});

export type AdminProblemLifecycleResponse = z.infer<typeof adminProblemLifecycleResponseSchema>;

export const adminReplaceTestCasesResponseSchema = z.object({
  problemId: z.string().uuid(),
  totalTestCases: z.number().int().min(0),
  publicTestCaseCount: z.number().int().min(0),
  hiddenTestCaseCount: z.number().int().min(0),
});

export type AdminReplaceTestCasesResponse = z.infer<typeof adminReplaceTestCasesResponseSchema>;
