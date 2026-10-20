import type { ContestStatus, PrismaClient } from '../generated/prisma/client.js';
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

export interface ContestScheduleSnapshot {
  readonly status: ContestStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
}

/**
 * Computes the authoritative server-side contest state from administrative status
 * (`DRAFT`, `CANCELLED`) and schedule timestamps (`startsAt`, `endsAt`).
 */
export function computeEffectiveContestStatus(
  contest: ContestScheduleSnapshot,
  now: Date = new Date(),
): ContestStatus {
  if (contest.status === 'DRAFT' || contest.status === 'CANCELLED') {
    return contest.status;
  }

  if (now < contest.startsAt) {
    return 'UPCOMING';
  }

  if (now >= contest.startsAt && now <= contest.endsAt) {
    return 'RUNNING';
  }

  return 'ENDED';
}

export interface ContestListItemDto {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly description: string | null;
  readonly effectiveStatus: ContestStatus;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly participantCount: number;
}

export interface ContestDetailDto extends ContestListItemDto {
  readonly isRegistered: boolean;
  readonly problems: ReadonlyArray<{
    readonly order: number;
    readonly points: number;
    readonly problem: {
      readonly id: string;
      readonly slug: string;
      readonly title: string;
      readonly difficulty: 'EASY' | 'MEDIUM' | 'HARD';
    };
  }>;
}

export interface ContestLeaderboardEntryDto {
  readonly rank: number;
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly finalScore: number;
  readonly penaltyMinutes: number;
  readonly solvedCount: number;
  readonly lastAcceptedAt: Date | null;
}

export interface CreateContestAdminInput {
  readonly slug: string;
  readonly title: string;
  readonly description?: string | null | undefined;
  readonly startsAt: Date;
  readonly endsAt: Date;
  readonly status?: ContestStatus | undefined;
  readonly problems?: ReadonlyArray<{
    readonly problemId: string;
    readonly order: number;
    readonly points: number;
  }>;
}

export class ContestRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async listPublicContests(
    paginationInput?: PaginationInput,
    now: Date = new Date(),
  ): Promise<PaginatedResult<ContestListItemDto>> {
    const pagination = normalizePagination(paginationInput);

    try {
      const [contests, totalItems] = await Promise.all([
        this.prisma.contest.findMany({
          where: {
            status: { not: 'DRAFT' },
          },
          orderBy: { startsAt: 'desc' },
          skip: pagination.skip,
          take: pagination.take,
          select: {
            id: true,
            slug: true,
            title: true,
            description: true,
            status: true,
            startsAt: true,
            endsAt: true,
            _count: {
              select: {
                participants: true,
              },
            },
          },
        }),
        this.prisma.contest.count({
          where: {
            status: { not: 'DRAFT' },
          },
        }),
      ]);

      const items: ContestListItemDto[] = contests.map((contest) => ({
        id: contest.id,
        slug: contest.slug,
        title: contest.title,
        description: contest.description,
        effectiveStatus: computeEffectiveContestStatus(contest, now),
        startsAt: contest.startsAt,
        endsAt: contest.endsAt,
        participantCount: contest._count.participants,
      }));

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to list public contests.');
    }
  }

  /**
   * Fetches contest details by slug.
   * Security invariant: Contest problems are concealed from non-admin users while
   * the contest is in `UPCOMING` state (`now < startsAt`).
   */
  public async findContestBySlugForActor(
    slug: string,
    actor?: RepositoryActor | undefined,
    now: Date = new Date(),
  ): Promise<ContestDetailDto | null> {
    try {
      const contest = await this.prisma.contest.findUnique({
        where: { slug: slug.trim() },
        select: {
          id: true,
          slug: true,
          title: true,
          description: true,
          status: true,
          startsAt: true,
          endsAt: true,
          _count: {
            select: {
              participants: true,
            },
          },
          problems: {
            orderBy: { order: 'asc' },
            select: {
              order: true,
              points: true,
              problem: {
                select: {
                  id: true,
                  slug: true,
                  title: true,
                  difficulty: true,
                },
              },
            },
          },
        },
      });

      if (!contest) {
        return null;
      }

      if (contest.status === 'DRAFT' && actor?.role !== 'ADMIN') {
        return null;
      }

      const effectiveStatus = computeEffectiveContestStatus(contest, now);
      const canViewProblems =
        actor?.role === 'ADMIN' || effectiveStatus === 'RUNNING' || effectiveStatus === 'ENDED';

      let isRegistered = false;
      if (actor?.userId) {
        const participant = await this.prisma.contestParticipant.findUnique({
          where: {
            contestId_userId: {
              contestId: contest.id,
              userId: actor.userId,
            },
          },
          select: { userId: true },
        });
        isRegistered = participant !== null;
      }

      return {
        id: contest.id,
        slug: contest.slug,
        title: contest.title,
        description: contest.description,
        effectiveStatus,
        startsAt: contest.startsAt,
        endsAt: contest.endsAt,
        participantCount: contest._count.participants,
        isRegistered,
        problems: canViewProblems ? contest.problems : [],
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to fetch contest details.');
    }
  }

  public async registerParticipant(
    contestId: string,
    userId: string,
    now: Date = new Date(),
  ): Promise<{ readonly registered: boolean; readonly registeredAt: Date }> {
    try {
      return await this.prisma.$transaction(async (tx) => {
        const contest = await tx.contest.findUnique({
          where: { id: contestId },
          select: {
            id: true,
            status: true,
            startsAt: true,
            endsAt: true,
          },
        });

        if (!contest) {
          throw new RepositoryError('NOT_FOUND', `Contest not found: ${contestId}`);
        }

        const effectiveStatus = computeEffectiveContestStatus(contest, now);
        if (effectiveStatus !== 'UPCOMING' && effectiveStatus !== 'RUNNING') {
          throw new RepositoryError(
            'VALIDATION_ERROR',
            `Cannot register for contest in state: ${effectiveStatus}`,
          );
        }

        const participant = await tx.contestParticipant.upsert({
          where: {
            contestId_userId: {
              contestId,
              userId,
            },
          },
          update: {},
          create: {
            contestId,
            userId,
          },
          select: {
            registeredAt: true,
          },
        });

        return {
          registered: true,
          registeredAt: participant.registeredAt,
        };
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to register contest participant.');
    }
  }

  public async getContestLeaderboard(
    contestId: string,
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<ContestLeaderboardEntryDto>> {
    const pagination = normalizePagination(paginationInput);

    try {
      const [rows, totalItems] = await Promise.all([
        this.prisma.contestParticipant.findMany({
          where: { contestId },
          orderBy: [
            { finalScore: 'desc' },
            { penaltyMinutes: 'asc' },
            { lastAcceptedAt: 'asc' },
            { registeredAt: 'asc' },
          ],
          skip: pagination.skip,
          take: pagination.take,
          select: {
            userId: true,
            finalScore: true,
            penaltyMinutes: true,
            solvedCount: true,
            lastAcceptedAt: true,
            rank: true,
            user: {
              select: {
                profile: {
                  select: {
                    username: true,
                    displayName: true,
                  },
                },
              },
            },
          },
        }),
        this.prisma.contestParticipant.count({ where: { contestId } }),
      ]);

      const items: ContestLeaderboardEntryDto[] = rows.map((row, idx) => ({
        rank: row.rank ?? pagination.skip + idx + 1,
        userId: row.userId,
        username: row.user.profile?.username ?? 'unknown',
        displayName: row.user.profile?.displayName ?? null,
        finalScore: row.finalScore,
        penaltyMinutes: row.penaltyMinutes,
        solvedCount: row.solvedCount,
        lastAcceptedAt: row.lastAcceptedAt,
      }));

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to query contest leaderboard.');
    }
  }

  public async createContestForAdmin(
    actor: RepositoryActor,
    input: CreateContestAdminInput,
  ): Promise<{ id: string; slug: string; status: ContestStatus }> {
    assertAdminActor(actor, 'createContestForAdmin');

    if (input.endsAt <= input.startsAt) {
      throw new RepositoryError('VALIDATION_ERROR', 'Contest endsAt must be after startsAt.');
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        const contest = await tx.contest.create({
          data: {
            slug: input.slug.trim(),
            title: input.title.trim(),
            description: input.description ?? null,
            startsAt: input.startsAt,
            endsAt: input.endsAt,
            status: input.status ?? 'DRAFT',
            ...(input.problems && input.problems.length > 0
              ? {
                  problems: {
                    create: input.problems.map((cp) => ({
                      problemId: cp.problemId,
                      order: cp.order,
                      points: cp.points,
                    })),
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
            action: 'CONTEST_CREATED',
            entityType: 'Contest',
            entityId: contest.id,
            metadata: {
              slug: contest.slug,
              startsAt: input.startsAt.toISOString(),
              endsAt: input.endsAt.toISOString(),
            },
          },
        });

        return contest;
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to create contest.');
    }
  }
}
