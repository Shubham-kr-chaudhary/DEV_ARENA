import type { Prisma, PrismaClient } from '../generated/prisma/client.js';
import {
  assertAdminActor,
  buildPaginationMeta,
  mapPrismaRepositoryError,
  normalizePagination,
  type PaginatedResult,
  type PaginationInput,
  type RepositoryActor,
} from './types.js';

const SENSITIVE_AUDIT_KEYS = new Set([
  'password',
  'passwordhash',
  'secret',
  'sessionsecret',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'cookie',
  'authorization',
  'apikey',
]);

export function sanitizeAuditMetadata(
  metadata?: Record<string, unknown> | null | undefined,
): Prisma.InputJsonObject | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: Record<string, Prisma.InputJsonValue | null> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (SENSITIVE_AUDIT_KEYS.has(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
      continue;
    }

    if (
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      value === null
    ) {
      sanitized[key] = value;
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) => (typeof item === 'object' ? String(item) : item));
    } else if (typeof value === 'object') {
      sanitized[key] = sanitizeAuditMetadata(value as Record<string, unknown>) ?? null;
    }
  }

  return sanitized as Prisma.InputJsonObject;
}

export interface CreateAuditLogInput {
  readonly actorUserId?: string | null | undefined;
  readonly action: string;
  readonly entityType: string;
  readonly entityId?: string | null | undefined;
  readonly metadata?: Record<string, unknown> | null | undefined;
}

export interface AuditLogFilter {
  readonly actorUserId?: string | undefined;
  readonly entityType?: string | undefined;
  readonly entityId?: string | undefined;
  readonly action?: string | undefined;
}

export interface AuditLogRecord {
  readonly id: string;
  readonly actorUserId: string | null;
  readonly action: string;
  readonly entityType: string;
  readonly entityId: string | null;
  readonly metadata: Prisma.JsonValue | null;
  readonly createdAt: Date;
}

export class AuditRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createAuditLog(input: CreateAuditLogInput): Promise<AuditLogRecord> {
    try {
      const sanitizedMetadata = sanitizeAuditMetadata(input.metadata);

      return await this.prisma.auditLog.create({
        data: {
          actorUserId: input.actorUserId ?? null,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId ?? null,
          ...(sanitizedMetadata !== undefined ? { metadata: sanitizedMetadata } : {}),
        },
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to write administrative audit log.');
    }
  }

  public async listAuditLogsForAdmin(
    actor: RepositoryActor,
    filter?: AuditLogFilter,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<AuditLogRecord>> {
    assertAdminActor(actor, 'listAuditLogsForAdmin');

    const pagination = normalizePagination(paginationInput);
    const where: Prisma.AuditLogWhereInput = {
      ...(filter?.actorUserId !== undefined ? { actorUserId: filter.actorUserId } : {}),
      ...(filter?.entityType !== undefined ? { entityType: filter.entityType } : {}),
      ...(filter?.entityId !== undefined ? { entityId: filter.entityId } : {}),
      ...(filter?.action !== undefined ? { action: filter.action } : {}),
    };

    try {
      const [items, totalItems] = await Promise.all([
        this.prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
        }),
        this.prisma.auditLog.count({ where }),
      ]);

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to list audit logs.');
    }
  }
}
