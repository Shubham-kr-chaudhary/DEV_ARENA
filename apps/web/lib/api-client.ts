import {
  adminProblemDetailResponseSchema,
  adminProblemLifecycleResponseSchema,
  adminProblemListQuerySchema,
  adminProblemListResponseSchema,
  adminReplaceTestCasesResponseSchema,
  apiErrorResponseSchema,
  authSessionResponseSchema,
  createProblemRequestSchema,
  loginRequestSchema,
  logoutResponseSchema,
  problemListQuerySchema,
  problemListResponseSchema,
  problemSlugSchema,
  publicProblemDetailResponseSchema,
  registerRequestSchema,
  replaceProblemTestCasesRequestSchema,
  updateProblemRequestSchema,
  type AdminProblemDetailDto,
  type AdminProblemLifecycleResponse,
  type AdminProblemListQuery,
  type AdminProblemListResponse,
  type AdminReplaceTestCasesResponse,
  type ApiErrorCode,
  type AuthenticatedUserDto,
  type CreateProblemRequest,
  type LoginRequest,
  type LogoutResponse,
  type ProblemListQuery,
  type ProblemListResponse,
  type PublicProblemDetailContractDto,
  type RegisterRequest,
  type ReplaceProblemTestCasesRequest,
  type UpdateProblemRequest,
} from '@devarena/api-contracts';

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: ApiErrorCode;
  public readonly details?:
    ReadonlyArray<{ readonly field?: string | undefined; readonly message: string }> | undefined;

  public constructor(
    statusCode: number,
    code: ApiErrorCode,
    message: string,
    details?:
      ReadonlyArray<{ readonly field?: string | undefined; readonly message: string }> | undefined,
  ) {
    super(message);
    this.name = 'ApiClientError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

export interface ApiClientOptions {
  readonly baseUrl?: string | undefined;
  readonly fetchImpl?: typeof fetch | undefined;
}

const DEFAULT_API_BASE_URL =
  typeof process !== 'undefined' && process.env.NEXT_PUBLIC_API_BASE_URL
    ? process.env.NEXT_PUBLIC_API_BASE_URL
    : 'http://localhost:4000';

function buildQueryString(params: Record<string, string | number | undefined>): string {
  const searchParams = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && String(value).trim().length > 0) {
      searchParams.set(key, String(value).trim());
    }
  }
  const serialized = searchParams.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

/**
 * Typed HTTP client for the DevArena `/api/v1` backend.
 *
 * Security invariant: Relies exclusively on `credentials: 'include'` so the browser
 * transmits the `HttpOnly` `devarena_session` cookie automatically without persisting
 * credentials in client-readable browser storage.
 */
export function createApiClient(options: ApiClientOptions = {}) {
  const baseUrl = (options.baseUrl ?? DEFAULT_API_BASE_URL).replace(/\/+$/, '');
  const fetchFn = options.fetchImpl ?? fetch;

  async function requestJson<T>(
    path: string,
    init: RequestInit,
    parseResponse: (data: unknown) => T,
  ): Promise<T> {
    const response = await fetchFn(`${baseUrl}${path}`, {
      ...init,
      credentials: 'include',
      headers: {
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    });

    const rawBody: unknown = await response.json().catch(() => null);

    if (!response.ok) {
      const parsedError = apiErrorResponseSchema.safeParse(rawBody);
      if (parsedError.success) {
        throw new ApiClientError(
          response.status,
          parsedError.data.error.code,
          parsedError.data.error.message,
          parsedError.data.error.details,
        );
      }

      throw new ApiClientError(
        response.status,
        'INTERNAL_ERROR',
        `Request failed with HTTP status ${response.status}.`,
      );
    }

    return parseResponse(rawBody);
  }

  return {
    async register(input: RegisterRequest): Promise<AuthenticatedUserDto> {
      const validated = registerRequestSchema.parse(input);
      const result = await requestJson(
        '/api/v1/auth/register',
        {
          method: 'POST',
          body: JSON.stringify(validated),
        },
        (data) => authSessionResponseSchema.parse(data),
      );
      return result.user;
    },

    async login(input: LoginRequest): Promise<AuthenticatedUserDto> {
      const validated = loginRequestSchema.parse(input);
      const result = await requestJson(
        '/api/v1/auth/login',
        {
          method: 'POST',
          body: JSON.stringify(validated),
        },
        (data) => authSessionResponseSchema.parse(data),
      );
      return result.user;
    },

    async logout(): Promise<LogoutResponse> {
      return await requestJson(
        '/api/v1/auth/logout',
        {
          method: 'POST',
        },
        (data) => logoutResponseSchema.parse(data),
      );
    },

    async getCurrentUser(cookieHeader?: string): Promise<AuthenticatedUserDto | null> {
      try {
        const result = await requestJson(
          '/api/v1/auth/me',
          {
            method: 'GET',
            ...(cookieHeader ? { headers: { Cookie: cookieHeader } } : {}),
          },
          (data) => authSessionResponseSchema.parse(data),
        );
        return result.user;
      } catch (error) {
        if (error instanceof ApiClientError && error.statusCode === 401) {
          return null;
        }
        throw error;
      }
    },

    async listProblems(
      query: Partial<ProblemListQuery> = {},
      cookieHeader?: string,
    ): Promise<ProblemListResponse> {
      const validatedQuery = problemListQuerySchema.parse(query);
      const qs = buildQueryString({
        page: validatedQuery.page,
        pageSize: validatedQuery.pageSize,
        search: validatedQuery.search,
        difficulty: validatedQuery.difficulty,
        tag: validatedQuery.tag,
        status: validatedQuery.status,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder,
      });

      return await requestJson(
        `/api/v1/problems${qs}`,
        {
          method: 'GET',
          ...(cookieHeader ? { headers: { Cookie: cookieHeader } } : {}),
        },
        (data) => problemListResponseSchema.parse(data),
      );
    },

    async getProblemBySlug(
      slug: string,
      cookieHeader?: string,
    ): Promise<PublicProblemDetailContractDto> {
      const validatedSlug = problemSlugSchema.parse(slug);
      const result = await requestJson(
        `/api/v1/problems/${encodeURIComponent(validatedSlug)}`,
        {
          method: 'GET',
          ...(cookieHeader ? { headers: { Cookie: cookieHeader } } : {}),
        },
        (data) => publicProblemDetailResponseSchema.parse(data),
      );
      return result.problem;
    },

    async listAdminProblems(
      query: Partial<AdminProblemListQuery> = {},
      cookieHeader?: string,
    ): Promise<AdminProblemListResponse> {
      const validatedQuery = adminProblemListQuerySchema.parse(query);
      const qs = buildQueryString({
        page: validatedQuery.page,
        pageSize: validatedQuery.pageSize,
        search: validatedQuery.search,
        difficulty: validatedQuery.difficulty,
        status: validatedQuery.status,
        sortBy: validatedQuery.sortBy,
        sortOrder: validatedQuery.sortOrder,
      });

      return await requestJson(
        `/api/v1/admin/problems${qs}`,
        {
          method: 'GET',
          ...(cookieHeader ? { headers: { Cookie: cookieHeader } } : {}),
        },
        (data) => adminProblemListResponseSchema.parse(data),
      );
    },

    async getAdminProblemById(
      problemId: string,
      cookieHeader?: string,
    ): Promise<AdminProblemDetailDto> {
      const result = await requestJson(
        `/api/v1/admin/problems/${encodeURIComponent(problemId)}`,
        {
          method: 'GET',
          ...(cookieHeader ? { headers: { Cookie: cookieHeader } } : {}),
        },
        (data) => adminProblemDetailResponseSchema.parse(data),
      );
      return result.problem;
    },

    async createAdminProblem(input: CreateProblemRequest): Promise<AdminProblemDetailDto> {
      const validated = createProblemRequestSchema.parse(input);
      const result = await requestJson(
        '/api/v1/admin/problems',
        {
          method: 'POST',
          body: JSON.stringify(validated),
        },
        (data) => adminProblemDetailResponseSchema.parse(data),
      );
      return result.problem;
    },

    async updateAdminProblem(
      problemId: string,
      input: UpdateProblemRequest,
    ): Promise<AdminProblemDetailDto> {
      const validated = updateProblemRequestSchema.parse(input);
      const result = await requestJson(
        `/api/v1/admin/problems/${encodeURIComponent(problemId)}`,
        {
          method: 'PATCH',
          body: JSON.stringify(validated),
        },
        (data) => adminProblemDetailResponseSchema.parse(data),
      );
      return result.problem;
    },

    async replaceAdminProblemTestCases(
      problemId: string,
      input: ReplaceProblemTestCasesRequest,
    ): Promise<AdminReplaceTestCasesResponse> {
      const validated = replaceProblemTestCasesRequestSchema.parse(input);
      return await requestJson(
        `/api/v1/admin/problems/${encodeURIComponent(problemId)}/test-cases`,
        {
          method: 'PUT',
          body: JSON.stringify(validated),
        },
        (data) => adminReplaceTestCasesResponseSchema.parse(data),
      );
    },

    async publishAdminProblem(
      problemId: string,
    ): Promise<AdminProblemLifecycleResponse['problem']> {
      const result = await requestJson(
        `/api/v1/admin/problems/${encodeURIComponent(problemId)}/publish`,
        {
          method: 'POST',
        },
        (data) => adminProblemLifecycleResponseSchema.parse(data),
      );
      return result.problem;
    },

    async unpublishAdminProblem(
      problemId: string,
    ): Promise<AdminProblemLifecycleResponse['problem']> {
      const result = await requestJson(
        `/api/v1/admin/problems/${encodeURIComponent(problemId)}/unpublish`,
        {
          method: 'POST',
        },
        (data) => adminProblemLifecycleResponseSchema.parse(data),
      );
      return result.problem;
    },

    async archiveAdminProblem(
      problemId: string,
    ): Promise<AdminProblemLifecycleResponse['problem']> {
      const result = await requestJson(
        `/api/v1/admin/problems/${encodeURIComponent(problemId)}/archive`,
        {
          method: 'POST',
        },
        (data) => adminProblemLifecycleResponseSchema.parse(data),
      );
      return result.problem;
    },
  };
}

export const apiClient = createApiClient();
