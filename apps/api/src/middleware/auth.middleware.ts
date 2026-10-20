import type { Context, MiddlewareHandler } from 'hono';
import {
  extractSessionTokenFromCookieHeader,
  hashSessionToken,
  serializeClearedSessionCookie,
} from '../auth/index.js';
import { ApiHttpError } from '../errors/http-error.js';
import type { Role } from '../generated/prisma/client.js';
import {
  RepositoryError,
  type ActiveSessionWithUserDto,
  type RepositoryActor,
  type SafeUserWithProfileDto,
} from '../repositories/index.js';

export interface AuthenticatedContextState {
  readonly sessionId: string;
  readonly expiresAt: Date;
  readonly user: SafeUserWithProfileDto;
  readonly actor: RepositoryActor;
}

const AUTH_CONTEXT_KEY = 'devarenaAuthState';

export function getAuthenticatedStateFromContext(c: Context): AuthenticatedContextState | null {
  const value = c.get(AUTH_CONTEXT_KEY as never) as AuthenticatedContextState | undefined;
  return value ?? null;
}

export function requireAuthenticatedStateFromContext(c: Context): AuthenticatedContextState {
  const state = getAuthenticatedStateFromContext(c);
  if (!state) {
    throw new ApiHttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
  }
  return state;
}

export interface SessionResolverDependencies {
  readonly findActiveSessionByTokenHash: (
    tokenHash: string,
    now?: Date,
  ) => Promise<ActiveSessionWithUserDto | null>;
  readonly revokeSessionByTokenHash?: (tokenHash: string, now?: Date) => Promise<boolean>;
  readonly cookieName: string;
  readonly isProduction: boolean;
  readonly nowFn?: (() => Date) | undefined;
}

/**
 * Resolves the authenticated user strictly from the server-validated database session cookie.
 *
 * Security invariants:
 * - Client-supplied identity headers (`X-User-Id`, `X-User-Role`, `Authorization` role claims)
 *   and body/query fields (`userId`, `role`) are never trusted.
 * - Expired or revoked sessions are rejected with `401 UNAUTHORIZED` and clear the stale cookie.
 * - Suspended or deleted user accounts are rejected with `403 FORBIDDEN` and clear the cookie.
 */
export function createRequireAuthMiddleware(deps: SessionResolverDependencies): MiddlewareHandler {
  return async (c, next) => {
    const cookieHeader = c.req.header('cookie');
    const rawToken = extractSessionTokenFromCookieHeader(cookieHeader, deps.cookieName);

    if (!rawToken) {
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Authentication is required.');
    }

    const tokenHash = hashSessionToken(rawToken);
    const now = deps.nowFn ? deps.nowFn() : new Date();

    let activeSession: ActiveSessionWithUserDto | null;
    try {
      activeSession = await deps.findActiveSessionByTokenHash(tokenHash, now);
    } catch (error) {
      if (error instanceof RepositoryError && error.code === 'FORBIDDEN') {
        if (deps.revokeSessionByTokenHash) {
          await deps.revokeSessionByTokenHash(tokenHash, now).catch(() => false);
        }
        c.header(
          'Set-Cookie',
          serializeClearedSessionCookie({
            cookieName: deps.cookieName,
            isProduction: deps.isProduction,
          }),
        );
        throw new ApiHttpError(403, 'FORBIDDEN', 'User account is suspended or inactive.');
      }
      throw error;
    }

    if (!activeSession) {
      c.header(
        'Set-Cookie',
        serializeClearedSessionCookie({
          cookieName: deps.cookieName,
          isProduction: deps.isProduction,
        }),
      );
      throw new ApiHttpError(401, 'UNAUTHORIZED', 'Session is invalid, expired, or revoked.');
    }

    if (activeSession.user.status !== 'ACTIVE') {
      if (deps.revokeSessionByTokenHash) {
        await deps.revokeSessionByTokenHash(tokenHash, now).catch(() => false);
      }
      c.header(
        'Set-Cookie',
        serializeClearedSessionCookie({
          cookieName: deps.cookieName,
          isProduction: deps.isProduction,
        }),
      );
      throw new ApiHttpError(403, 'FORBIDDEN', 'User account is suspended or inactive.');
    }

    const authState: AuthenticatedContextState = {
      sessionId: activeSession.sessionId,
      expiresAt: activeSession.expiresAt,
      user: activeSession.user,
      actor: {
        userId: activeSession.user.id,
        role: activeSession.user.role,
      },
    };

    c.set(AUTH_CONTEXT_KEY as never, authState as never);
    await next();
  };
}

/**
 * Role-based authorization middleware (`USER`, `ADMIN`).
 * Rejects unauthenticated requests with `401 UNAUTHORIZED` and insufficient roles with `403 FORBIDDEN`.
 */
export function createRequireRoleMiddleware(
  allowedRoles: readonly Role[],
  deps: SessionResolverDependencies,
): MiddlewareHandler {
  const requireAuth = createRequireAuthMiddleware(deps);

  return async (c, next) => {
    await requireAuth(c, async () => {
      const authState = requireAuthenticatedStateFromContext(c);
      if (!allowedRoles.includes(authState.user.role)) {
        throw new ApiHttpError(
          403,
          'FORBIDDEN',
          'Insufficient permissions to perform this operation.',
        );
      }
      await next();
    });
  };
}

export function createRequireAdminMiddleware(deps: SessionResolverDependencies): MiddlewareHandler {
  return createRequireRoleMiddleware(['ADMIN'], deps);
}

/**
 * Reusable server-side IDOR ownership guard.
 * Allows access only if the authenticated actor owns the resource (`actor.userId === resourceOwnerUserId`)
 * or holds the `ADMIN` role.
 */
export function assertOwnershipOrAdmin(
  actor: RepositoryActor,
  resourceOwnerUserId: string,
  resourceDescription = 'resource',
): void {
  if (actor.userId !== resourceOwnerUserId && actor.role !== 'ADMIN') {
    throw new ApiHttpError(
      403,
      'FORBIDDEN',
      `You do not have permission to access this ${resourceDescription}.`,
    );
  }
}
