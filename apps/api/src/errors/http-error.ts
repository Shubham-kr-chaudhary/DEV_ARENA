import {
  apiErrorResponseSchema,
  type ApiErrorCode,
  type ApiErrorResponse,
} from '@devarena/api-contracts';
import { ZodError } from 'zod';
import { RepositoryError } from '../repositories/index.js';

export type HttpErrorStatusCode = 400 | 401 | 403 | 404 | 409 | 413 | 429 | 500 | 503;

export interface ApiErrorDetailItem {
  readonly field?: string | undefined;
  readonly message: string;
}

export class ApiHttpError extends Error {
  public readonly statusCode: HttpErrorStatusCode;
  public readonly code: ApiErrorCode;
  public readonly details?: readonly ApiErrorDetailItem[] | undefined;

  public constructor(
    statusCode: HttpErrorStatusCode,
    code: ApiErrorCode,
    message: string,
    options?: {
      readonly details?: readonly ApiErrorDetailItem[] | undefined;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ApiHttpError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = options?.details;
  }
}

export function normalizeToApiHttpError(error: unknown): ApiHttpError {
  if (error instanceof ApiHttpError) {
    return error;
  }

  if (error instanceof ZodError) {
    const details: ApiErrorDetailItem[] = error.issues.map((issue) => {
      const pathString = issue.path.map(String).join('.');
      return {
        ...(pathString.length > 0 ? { field: pathString } : {}),
        message: issue.message,
      };
    });

    return new ApiHttpError(400, 'VALIDATION_ERROR', 'Request validation failed.', {
      details,
      cause: error,
    });
  }

  if (error instanceof RepositoryError) {
    switch (error.code) {
      case 'NOT_FOUND':
        return new ApiHttpError(404, 'NOT_FOUND', error.message, { cause: error });
      case 'CONFLICT':
        return new ApiHttpError(409, 'CONFLICT', error.message, { cause: error });
      case 'FORBIDDEN':
        return new ApiHttpError(403, 'FORBIDDEN', error.message, { cause: error });
      case 'VALIDATION_ERROR':
        return new ApiHttpError(400, 'VALIDATION_ERROR', error.message, { cause: error });
      case 'INVALID_STATE_TRANSITION':
        return new ApiHttpError(409, 'CONFLICT', error.message, { cause: error });
      case 'DATABASE_ERROR':
      default:
        return new ApiHttpError(
          500,
          'INTERNAL_ERROR',
          'An unexpected internal server error occurred.',
          { cause: error },
        );
    }
  }

  return new ApiHttpError(500, 'INTERNAL_ERROR', 'An unexpected internal server error occurred.', {
    cause: error,
  });
}

export function buildApiErrorPayload(
  httpError: ApiHttpError,
  requestId?: string | undefined,
): ApiErrorResponse {
  const normalizedDetails = httpError.details?.map((detail) => ({
    ...(detail.field !== undefined ? { field: detail.field } : {}),
    message: detail.message,
  }));

  return apiErrorResponseSchema.parse({
    error: {
      code: httpError.code,
      message: httpError.message,
      ...(requestId !== undefined ? { requestId } : {}),
      ...(normalizedDetails !== undefined && normalizedDetails.length > 0
        ? { details: normalizedDetails }
        : {}),
    },
  });
}
