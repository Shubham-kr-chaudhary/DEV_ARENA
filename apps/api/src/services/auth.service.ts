import {
  authenticatedUserSchema,
  type AuthenticatedUserDto,
  type LoginRequest,
  type RegisterRequest,
} from '@devarena/api-contracts';
import {
  generateSessionToken,
  hashPassword,
  hashSessionToken,
  verifyDummyPassword,
  verifyPassword,
} from '../auth/index.js';
import { ApiHttpError } from '../errors/http-error.js';
import type {
  ActiveSessionWithUserDto,
  AuthUserCredentialsRecord,
  CreateSessionInput,
  CreateUserWithProfileInput,
  SafeUserWithProfileDto,
} from '../repositories/index.js';

export interface AuthUserRepositoryPort {
  createUserWithProfile(input: CreateUserWithProfileInput): Promise<SafeUserWithProfileDto>;
  findAuthUserByEmail(email: string): Promise<AuthUserCredentialsRecord | null>;
  findSafeUserById(userId: string): Promise<SafeUserWithProfileDto | null>;
  updateUserPasswordHash?(userId: string, passwordHash: string): Promise<void>;
  createSession(input: CreateSessionInput): Promise<{ id: string; expiresAt: Date }>;
  findActiveSessionByTokenHash(
    tokenHash: string,
    now?: Date,
  ): Promise<ActiveSessionWithUserDto | null>;
  revokeSessionByTokenHash(tokenHash: string, revokedAt?: Date): Promise<boolean>;
}

export interface SessionRequestMetadata {
  readonly ipAddress?: string | null | undefined;
  readonly userAgent?: string | null | undefined;
}

export interface AuthSessionIssuedResult {
  readonly user: AuthenticatedUserDto;
  readonly rawSessionToken: string;
  readonly expiresAt: Date;
}

export interface AuthServiceOptions {
  readonly userRepository: AuthUserRepositoryPort;
  readonly sessionTtlSeconds: number;
  readonly nowFn?: (() => Date) | undefined;
}

export function formatAuthenticatedUserDto(user: SafeUserWithProfileDto): AuthenticatedUserDto {
  return authenticatedUserSchema.parse({
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
    profile: user.profile
      ? {
          id: user.profile.id,
          username: user.profile.username,
          displayName: user.profile.displayName,
          bio: user.profile.bio,
          avatarUrl: user.profile.avatarUrl,
          rating: user.profile.rating,
          maxRating: user.profile.maxRating,
          rankTitle: user.profile.rankTitle,
          solvedCount: user.profile.solvedCount,
          attemptedCount: user.profile.attemptedCount,
          contestCount: user.profile.contestCount,
        }
      : null,
  });
}

export class AuthService {
  private readonly userRepository: AuthUserRepositoryPort;
  private readonly sessionTtlSeconds: number;
  private readonly nowFn: () => Date;

  public constructor(options: AuthServiceOptions) {
    this.userRepository = options.userRepository;
    this.sessionTtlSeconds = options.sessionTtlSeconds;
    this.nowFn = options.nowFn ?? (() => new Date());
  }

  /**
   * Registers a new developer account with an Argon2id password hash and issues an opaque session.
   *
   * Security invariants:
   * - Always assigns `role: 'USER'` regardless of any client-supplied fields.
   * - Never logs or returns plaintext passwords, password hashes, or session hashes.
   */
  public async register(
    input: RegisterRequest,
    metadata?: SessionRequestMetadata,
  ): Promise<AuthSessionIssuedResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const normalizedUsername = input.username.trim();
    const passwordHash = await hashPassword(input.password);

    const createdUser = await this.userRepository.createUserWithProfile({
      email: normalizedEmail,
      username: normalizedUsername,
      passwordHash,
      displayName: input.displayName ?? null,
      role: 'USER',
    });

    return await this.issueSessionForUser(createdUser, metadata);
  }

  /**
   * Authenticates a user by email and password and issues a database-backed session.
   *
   * Security invariants:
   * - Executes a dummy Argon2id verification when the email does not exist to prevent timing-based
   *   account enumeration.
   * - Returns an identical `401 UNAUTHORIZED` message for nonexistent accounts and wrong passwords.
   * - Rejects `SUSPENDED` or `DELETED` accounts with `403 FORBIDDEN`.
   * - Transparently upgrades legacy/seed `$scrypt$` hashes to `$argon2id$v=19$...` on valid login.
   */
  public async login(
    input: LoginRequest,
    metadata?: SessionRequestMetadata,
  ): Promise<AuthSessionIssuedResult> {
    const normalizedEmail = input.email.trim().toLowerCase();
    const credentialsRecord = await this.userRepository.findAuthUserByEmail(normalizedEmail);

    if (!credentialsRecord || !credentialsRecord.passwordHash) {
      await verifyDummyPassword(input.password);
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Invalid email or password.');
    }

    const verification = await verifyPassword(input.password, credentialsRecord.passwordHash);
    if (!verification.valid) {
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Invalid email or password.');
    }

    if (credentialsRecord.status !== 'ACTIVE') {
      throw new ApiHttpError(403, 'FORBIDDEN', 'User account is suspended or inactive.');
    }

    if (verification.needsRehash && this.userRepository.updateUserPasswordHash) {
      const upgradedHash = await hashPassword(input.password);
      await this.userRepository
        .updateUserPasswordHash(credentialsRecord.id, upgradedHash)
        .catch(() => undefined);
    }

    const safeUser = await this.userRepository.findSafeUserById(credentialsRecord.id);
    if (!safeUser || safeUser.status !== 'ACTIVE') {
      throw new ApiHttpError(403, 'FORBIDDEN', 'User account is suspended or inactive.');
    }

    return await this.issueSessionForUser(safeUser, metadata);
  }

  /**
   * Revokes an active session by hashing the raw cookie token with SHA-256.
   */
  public async logout(rawSessionToken: string): Promise<void> {
    const tokenHash = hashSessionToken(rawSessionToken);
    const now = this.nowFn();
    await this.userRepository.revokeSessionByTokenHash(tokenHash, now);
  }

  private async issueSessionForUser(
    user: SafeUserWithProfileDto,
    metadata?: SessionRequestMetadata,
  ): Promise<AuthSessionIssuedResult> {
    const rawSessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(rawSessionToken);
    const now = this.nowFn();
    const expiresAt = new Date(now.getTime() + this.sessionTtlSeconds * 1000);

    await this.userRepository.createSession({
      userId: user.id,
      tokenHash,
      expiresAt,
      ipAddress: metadata?.ipAddress ?? null,
      userAgent: metadata?.userAgent ? metadata.userAgent.slice(0, 512) : null,
    });

    return {
      user: formatAuthenticatedUserDto(user),
      rawSessionToken,
      expiresAt,
    };
  }
}
