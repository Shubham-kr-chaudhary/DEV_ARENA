import {
  apiErrorResponseSchema,
  authSessionResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  registerRequestSchema,
  type ApiErrorCode,
  type AuthenticatedUserDto,
  type LoginRequest,
  type LogoutResponse,
  type RegisterRequest,
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
  };
}

export const apiClient = createApiClient();
