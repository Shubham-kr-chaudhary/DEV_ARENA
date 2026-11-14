import type { PrismaClient, Role, UserStatus } from '../generated/prisma/client.js';
import { mapPrismaRepositoryError, RepositoryError } from './types.js';

export interface CreateUserWithProfileInput {
  readonly email: string;
  readonly username: string;
  readonly passwordHash?: string | null | undefined;
  readonly displayName?: string | null | undefined;
  readonly bio?: string | null | undefined;
  readonly avatarUrl?: string | null | undefined;
  readonly role?: Role | undefined;
}

export interface SafeProfileDto {
  readonly id: string;
  readonly userId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly avatarUrl: string | null;
  readonly rating: number;
  readonly maxRating: number;
  readonly rankTitle: string;
  readonly solvedCount: number;
  readonly attemptedCount: number;
  readonly contestCount: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface SafeUserWithProfileDto {
  readonly id: string;
  readonly email: string;
  readonly role: Role;
  readonly status: UserStatus;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly profile: SafeProfileDto | null;
}

export interface AuthUserCredentialsRecord {
  readonly id: string;
  readonly email: string;
  readonly passwordHash: string | null;
  readonly role: Role;
  readonly status: UserStatus;
  readonly profile: {
    readonly username: string;
    readonly displayName: string | null;
  } | null;
}

export interface PublicUserProfileDto {
  readonly username: string;
  readonly displayName: string | null;
  readonly bio: string | null;
  readonly avatarUrl: string | null;
  readonly rating: number;
  readonly maxRating: number;
  readonly rankTitle: string;
  readonly solvedCount: number;
  readonly attemptedCount: number;
  readonly contestCount: number;
  readonly createdAt: Date;
  readonly ratingHistory: ReadonlyArray<{
    readonly id: string;
    readonly contestId: string | null;
    readonly rating: number;
    readonly delta: number;
    readonly reason: string;
    readonly createdAt: Date;
  }>;
}

export interface CreateSessionInput {
  readonly userId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

export interface ActiveSessionWithUserDto {
  readonly sessionId: string;
  readonly expiresAt: Date;
  readonly user: SafeUserWithProfileDto;
}

const SAFE_PROFILE_SELECT = {
  id: true,
  userId: true,
  username: true,
  displayName: true,
  bio: true,
  avatarUrl: true,
  rating: true,
  maxRating: true,
  rankTitle: true,
  solvedCount: true,
  attemptedCount: true,
  contestCount: true,
  createdAt: true,
  updatedAt: true,
} as const;

const SAFE_USER_SELECT = {
  id: true,
  email: true,
  role: true,
  status: true,
  createdAt: true,
  updatedAt: true,
  profile: {
    select: SAFE_PROFILE_SELECT,
  },
} as const;

export class UserRepository {
  public constructor(private readonly prisma: PrismaClient) {}

  public async createUserWithProfile(
    input: CreateUserWithProfileInput,
  ): Promise<SafeUserWithProfileDto> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedUsername = input.username.trim();

    try {
      return await this.prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
          data: {
            email: normalizedEmail,
            passwordHash: input.passwordHash ?? null,
            role: input.role ?? 'USER',
            status: 'ACTIVE',
            profile: {
              create: {
                username: normalizedUsername,
                displayName: input.displayName ?? null,
                bio: input.bio ?? null,
                avatarUrl: input.avatarUrl ?? null,
              },
            },
          },
          select: SAFE_USER_SELECT,
        });

        return user;
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to create user and profile.');
    }
  }

  public async findSafeUserById(userId: string): Promise<SafeUserWithProfileDto | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { id: userId },
        select: SAFE_USER_SELECT,
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to look up user by ID.');
    }
  }

  public async findAuthUserByEmail(email: string): Promise<AuthUserCredentialsRecord | null> {
    try {
      return await this.prisma.user.findUnique({
        where: { email: email.trim().toLowerCase() },
        select: {
          id: true,
          email: true,
          passwordHash: true,
          role: true,
          status: true,
          profile: {
            select: {
              username: true,
              displayName: true,
            },
          },
        },
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to look up user credentials by email.');
    }
  }

  public async updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
    try {
      await this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash },
        select: { id: true },
      });
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to update user password hash.');
    }
  }

  public async findPublicProfileByUsername(username: string): Promise<PublicUserProfileDto | null> {
    try {
      const profile = await this.prisma.profile.findUnique({
        where: { username: username.trim() },
        select: {
          username: true,
          displayName: true,
          bio: true,
          avatarUrl: true,
          rating: true,
          maxRating: true,
          rankTitle: true,
          solvedCount: true,
          attemptedCount: true,
          contestCount: true,
          createdAt: true,
          user: {
            select: {
              status: true,
              ratingHistory: {
                orderBy: { createdAt: 'desc' },
                take: 25,
                select: {
                  id: true,
                  contestId: true,
                  rating: true,
                  delta: true,
                  reason: true,
                  createdAt: true,
                },
              },
            },
          },
        },
      });

      if (!profile || profile.user.status === 'DELETED') {
        return null;
      }

      return {
        username: profile.username,
        displayName: profile.displayName,
        bio: profile.bio,
        avatarUrl: profile.avatarUrl,
        rating: profile.rating,
        maxRating: profile.maxRating,
        rankTitle: profile.rankTitle,
        solvedCount: profile.solvedCount,
        attemptedCount: profile.attemptedCount,
        contestCount: profile.contestCount,
        createdAt: profile.createdAt,
        ratingHistory: profile.user.ratingHistory,
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to fetch public developer profile.');
    }
  }

  public async createSession(input: CreateSessionInput): Promise<{ id: string; expiresAt: Date }> {
    try {
      const session = await this.prisma.session.create({
        data: {
          userId: input.userId,
          tokenHash: input.tokenHash,
          expiresAt: input.expiresAt,
          ipAddress: input.ipAddress ?? null,
          userAgent: input.userAgent ?? null,
        },
        select: {
          id: true,
          expiresAt: true,
        },
      });

      return session;
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to persist user session.');
    }
  }

  public async findActiveSessionByTokenHash(
    tokenHash: string,
    now: Date = new Date(),
  ): Promise<ActiveSessionWithUserDto | null> {
    try {
      const session = await this.prisma.session.findUnique({
        where: { tokenHash },
        select: {
          id: true,
          expiresAt: true,
          revokedAt: true,
          user: {
            select: SAFE_USER_SELECT,
          },
        },
      });

      if (!session) {
        return null;
      }

      if (session.revokedAt !== null || session.expiresAt <= now) {
        return null;
      }

      if (session.user.status !== 'ACTIVE') {
        throw new RepositoryError('FORBIDDEN', 'User account is not active.');
      }

      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        user: session.user,
      };
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to resolve active session.');
    }
  }

  public async revokeSessionByTokenHash(
    tokenHash: string,
    revokedAt: Date = new Date(),
  ): Promise<boolean> {
    try {
      const result = await this.prisma.session.updateMany({
        where: {
          tokenHash,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      return result.count > 0;
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to revoke session.');
    }
  }

  public async revokeAllUserSessions(
    userId: string,
    revokedAt: Date = new Date(),
  ): Promise<number> {
    try {
      const result = await this.prisma.session.updateMany({
        where: {
          userId,
          revokedAt: null,
        },
        data: {
          revokedAt,
        },
      });

      return result.count;
    } catch (error) {
      throw mapPrismaRepositoryError(error, 'Failed to revoke user sessions.');
    }
  }
}
