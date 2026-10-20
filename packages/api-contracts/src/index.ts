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
