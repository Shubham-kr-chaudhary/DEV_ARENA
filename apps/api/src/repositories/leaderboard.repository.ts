import type { PrismaClient } from '../generated/prisma/client.js';
import {
  buildPaginationMeta,
  mapPrismaRepositoryError,
  normalizePagination,
  type PaginatedResult,
  type PaginationInput,
} from './types.js';

export function resolveRankTitleFromRating(rating: number): string {
  if (rating >= 2400) {
    return 'Grandmaster';
  }
  if (rating >= 2100) {
    return 'Master';
  }
  if (rating >= 1900) {
    return 'Candidate Master';
  }
  if (rating >= 1600) {
    return 'Expert';
  }
  if (rating >= 1400) {
    return 'Specialist';
  }
  if (rating >= 1200) {
    return 'Pupil';
  }
  return 'Newbie';
}

export interface GlobalLeaderboardEntryDto {
  readonly rank: number;
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly rating: number;
  readonly maxRating: number;
  readonly rankTitle: string;
  readonly solvedCount: number;
  readonly contestCount: number;
}

export interface RatingUpdateEntryInput {
  readonly userId: string;
  readonly contestId?: string | null | undefined;
  readonly newRating: number;
  readonly delta: number;
  readonly reason: string;
}

export class LeaderboardRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  /**
   * Queries the global leaderboard using the indexed `(rating DESC, solvedCount DESC)`
   * columns on `Profile` to avoid expensive full-table aggregations on every request.
   */
  public async getGlobalLeaderboard(
    paginationInput?: PaginationInput,
  ): Promise<PaginatedResult<GlobalLeaderboardEntryDto>> {
    const pagination = normalizePagination(paginationInput);

    try {
      const where = {
        user: {
          status: 'ACTIVE' as const,
        },
      };

      const [profiles, totalItems] = await Promise.all([
        this.prisma.profile.findMany({
          where,
          orderBy: [{ rating: 'desc' }, { solvedCount: 'desc' }, { username: 'asc' }],
          skip: pagination.skip,
          take: pagination.take,
          select: {
            userId: true,
            username: true,
            displayName: true,
            avatarUrl: true,
            rating: true,
            maxRating: true,
            rankTitle: true,
            solvedCount: true,
            contestCount: true,
          },
        }),
        this.prisma.profile.count({ where }),
      ]);

      const items: GlobalLeaderboardEntryDto[] = profiles.map((profile, idx) => ({
        rank: pagination.skip + idx + 1,
        userId: profile.userId,
        username: profile.username,
        displayName: profile.displayName,
        avatarUrl: profile.avatarUrl,
        rating: profile.rating,
        maxRating: profile.maxRating,
        rankTitle: profile.rankTitle,
        solvedCount: profile.solvedCount,
        contestCount: profile.contestCount,
      }));

      return {
        items,
        meta: buildPaginationMeta(pagination, totalItems),
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to query global leaderboard.');
    }
  }

  /**
   * Atomically records `RatingHistory` entries and updates `Profile` rating, `maxRating`,
   * `rankTitle`, and `contestCount` inside a single PostgreSQL transaction.
   */
  public async applyRatingChangesAtomically(
    updates: readonly RatingUpdateEntryInput[],
  ): Promise<number> {
    if (updates.length === 0) {
      return 0;
    }

    try {
      return await this.prisma.$transaction(async (tx) => {
        for (const entry of updates) {
          const currentProfile = await tx.profile.findUnique({
            where: { userId: entry.userId },
            select: {
              maxRating: true,
            },
          });

          const nextMaxRating = Math.max(
            currentProfile?.maxRating ?? entry.newRating,
            entry.newRating,
          );
          const nextRankTitle = resolveRankTitleFromRating(entry.newRating);

          await tx.ratingHistory.create({
            data: {
              userId: entry.userId,
              contestId: entry.contestId ?? null,
              rating: entry.newRating,
              delta: entry.delta,
              reason: entry.reason,
            },
          });

          await tx.profile.update({
            where: { userId: entry.userId },
            data: {
              rating: entry.newRating,
              maxRating: nextMaxRating,
              rankTitle: nextRankTitle,
              ...(entry.contestId ? { contestCount: { increment: 1 } } : {}),
            },
          });
        }

        return updates.length;
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to apply rating updates.');
    }
  }
}
