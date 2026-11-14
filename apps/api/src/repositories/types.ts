import type { PaginationMeta } from '@devarena/api-contracts';
import type { Role } from '../generated/prisma/client.js';

export type RepositoryErrorCode =
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'FORBIDDEN'
  | 'VALIDATION_ERROR'
  | 'INVALID_STATE_TRANSITION'
  | 'DATABASE_ERROR';

export class RepositoryError extends Error {
  public readonly code: RepositoryErrorCode;

  public constructor(code: RepositoryErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'RepositoryError';
    this.code = code;
  }
}

export interface RepositoryActor {
  readonly userId: string;
  readonly role: Role;
}

export interface PaginationInput {
  readonly page?: number | undefined;
  readonly pageSize?: number | undefined;
}

export interface NormalizedPagination {
  readonly page: number;
  readonly pageSize: number;
  readonly skip: number;
  readonly take: number;
}

export interface PaginatedResult<T> {
  readonly items: readonly T[];
  readonly meta: PaginationMeta;
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(input?: PaginationInput): NormalizedPagination {
  const rawPage = input?.page ?? DEFAULT_PAGE;
  const rawPageSize = input?.pageSize ?? DEFAULT_PAGE_SIZE;

  const page = Number.isInteger(rawPage) && rawPage >= 1 ? rawPage : DEFAULT_PAGE;
  const boundedPageSize =
    Number.isInteger(rawPageSize) && rawPageSize >= 1
      ? Math.min(rawPageSize, MAX_PAGE_SIZE)
      : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize: boundedPageSize,
    skip: (page - 1) * boundedPageSize,
    take: boundedPageSize,
  };
}

export function buildPaginationMeta(
  pagination: NormalizedPagination,
  totalItems: number,
): PaginationMeta {
  const safeTotal = Math.max(0, totalItems);
  const totalPages = safeTotal === 0 ? 0 : Math.ceil(safeTotal / pagination.pageSize);

  return {
    page: pagination.page,
    pageSize: pagination.pageSize,
    totalItems: safeTotal,
    totalPages,
  };
}

export function assertAdminActor(actor: RepositoryActor, operation: string): void {
  if (actor.role !== 'ADMIN') {
    throw new RepositoryError(
      'FORBIDDEN',
      `Administrator role is required to perform operation: ${operation}`,
    );
  }
}

export function mapPrismaRepositoryError(error: unknown, fallbackMessage: string): RepositoryError {
  if (error instanceof RepositoryError) {
    return error;
  }

  if (typeof error === 'object' && error !== null && 'code' in error) {
    const prismaCode = (error as { code?: unknown }).code;
    if (prismaCode === 'P2002') {
      return new RepositoryError('CONFLICT', 'Resource violates a uniqueness constraint.', {
        cause: error,
      });
    }
    if (prismaCode === 'P2025') {
      return new RepositoryError('NOT_FOUND', 'Requested database record was not found.', {
        cause: error,
      });
    }
    if (prismaCode === 'P2003') {
      return new RepositoryError(
        'CONFLICT',
        'Operation violates a foreign-key integrity constraint.',
        { cause: error },
      );
    }
  }

  return new RepositoryError('DATABASE_ERROR', fallbackMessage, { cause: error });
}
