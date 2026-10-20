import { randomUUID } from 'node:crypto';
import {
  authSessionResponseSchema,
  healthResponseSchema,
  readinessResponseSchema,
} from '@devarena/api-contracts';
import { loadServerConfig, type ServerConfig } from '@devarena/config';
import { Hono } from 'hono';
import { checkDatabaseHealth, getPrismaClient } from './db/index.js';
import {
  ApiHttpError,
  buildApiErrorPayload,
  normalizeToApiHttpError,
} from './errors/http-error.js';
import {
  assertOwnershipOrAdmin,
  createCsrfProtectionMiddleware,
  createRequireAdminMiddleware,
  createRequireAuthMiddleware,
  InMemorySlidingWindowRateLimitStore,
  requireAuthenticatedStateFromContext,
  type RateLimitStore,
} from './middleware/index.js';
import { UserRepository } from './repositories/index.js';
import { createAuthRoutes } from './routes/v1/auth.routes.js';
import {
  AuthService,
  formatAuthenticatedUserDto,
  type AuthUserRepositoryPort,
} from './services/auth.service.js';

const MAX_REQUEST_BODY_BYTES = 128 * 1024; // 128 KB

export interface AppDependencies {
  readonly checkDatabaseReadiness?: (() => Promise<boolean>) | undefined;
  readonly userRepository?: AuthUserRepositoryPort | undefined;
  readonly config?: Partial<ServerConfig> | undefined;
  readonly rateLimitStore?: RateLimitStore | undefined;
  readonly nowFn?: (() => Date) | undefined;
}

async function defaultDatabaseReadinessCheck(): Promise<boolean> {
  const prisma = getPrismaClient();
  return checkDatabaseHealth(prisma);
}

function getDefaultUserRepository(): AuthUserRepositoryPort {
  return new UserRepository(getPrismaClient());
}

export function createApp(dependencies: AppDependencies = {}): Hono {
  const app = new Hono();
  const baseConfig = loadServerConfig({});
  const config: ServerConfig = {
    ...baseConfig,
    ...dependencies.config,
  };

  const verifyDatabase = dependencies.checkDatabaseReadiness ?? defaultDatabaseReadinessCheck;
  const isProduction = config.NODE_ENV === 'production';
  const rateLimitStore =
    dependencies.rateLimitStore ?? new InMemorySlidingWindowRateLimitStore({ maxKeys: 10_000 });

  let resolvedUserRepository: AuthUserRepositoryPort | undefined = dependencies.userRepository;
  const getUserRepo = (): AuthUserRepositoryPort => {
    if (!resolvedUserRepository) {
      resolvedUserRepository = getDefaultUserRepository();
    }
    return resolvedUserRepository;
  };

  const lazyUserRepositoryPort: AuthUserRepositoryPort = {
    createUserWithProfile: (input) => getUserRepo().createUserWithProfile(input),
    findAuthUserByEmail: (email) => getUserRepo().findAuthUserByEmail(email),
    findSafeUserById: (userId) => getUserRepo().findSafeUserById(userId),
    updateUserPasswordHash: async (userId, passwordHash) => {
      const repo = getUserRepo();
      if (repo.updateUserPasswordHash) {
        await repo.updateUserPasswordHash(userId, passwordHash);
      }
    },
    createSession: (input) => getUserRepo().createSession(input),
    findActiveSessionByTokenHash: (tokenHash, now) =>
      getUserRepo().findActiveSessionByTokenHash(tokenHash, now),
    revokeSessionByTokenHash: (tokenHash, revokedAt) =>
      getUserRepo().revokeSessionByTokenHash(tokenHash, revokedAt),
  };

  const authService = new AuthService({
    userRepository: lazyUserRepositoryPort,
    sessionTtlSeconds: config.SESSION_TTL_SECONDS,
    nowFn: dependencies.nowFn,
  });

  const sessionResolverDeps = {
    findActiveSessionByTokenHash: (tokenHash: string, now?: Date) =>
      lazyUserRepositoryPort.findActiveSessionByTokenHash(tokenHash, now),
    revokeSessionByTokenHash: (tokenHash: string, now?: Date) =>
      lazyUserRepositoryPort.revokeSessionByTokenHash(tokenHash, now),
    cookieName: config.SESSION_COOKIE_NAME,
    isProduction,
    nowFn: dependencies.nowFn,
  };

  const requireAuthMiddleware = createRequireAuthMiddleware(sessionResolverDeps);
  const requireAdminMiddleware = createRequireAdminMiddleware(sessionResolverDeps);
  const csrfMiddleware = createCsrfProtectionMiddleware({
    allowedOrigin: config.CORS_ORIGIN,
  });

  app.use('*', async (c, next) => {
    const requestId = randomUUID();
    c.set('requestId' as never, requestId as never);
    c.header('X-Request-Id', requestId);
    c.header('X-Content-Type-Options', 'nosniff');
    c.header('X-Frame-Options', 'DENY');
    c.header('Referrer-Policy', 'strict-origin-when-cross-origin');

    const requestOrigin = c.req.header('origin');
    if (requestOrigin && requestOrigin === config.CORS_ORIGIN) {
      c.header('Access-Control-Allow-Origin', config.CORS_ORIGIN);
      c.header('Access-Control-Allow-Credentials', 'true');
      c.header('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
      c.header('Access-Control-Allow-Headers', 'Content-Type, Idempotency-Key');
      c.header('Vary', 'Origin');
    }

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    const contentLengthHeader = c.req.header('content-length');
    if (contentLengthHeader) {
      const contentLength = Number.parseInt(contentLengthHeader, 10);
      if (Number.isInteger(contentLength) && contentLength > MAX_REQUEST_BODY_BYTES) {
        throw new ApiHttpError(
          413,
          'VALIDATION_ERROR',
          `Request body exceeds maximum size of ${MAX_REQUEST_BODY_BYTES} bytes.`,
        );
      }
    }

    await next();
  });

  app.get('/health', (c) => {
    const response = healthResponseSchema.parse({
      status: 'ok',
      service: 'api',
    });

    return c.json(response, 200);
  });

  app.get('/ready', async (c) => {
    try {
      const databaseHealthy = await verifyDatabase();

      if (!databaseHealthy) {
        const notReadyResponse = readinessResponseSchema.parse({
          status: 'not_ready',
          service: 'api',
          checks: {
            database: 'down',
          },
        });

        return c.json(notReadyResponse, 503);
      }

      const readyResponse = readinessResponseSchema.parse({
        status: 'ready',
        service: 'api',
        checks: {
          database: 'up',
        },
      });

      return c.json(readyResponse, 200);
    } catch {
      const notReadyResponse = readinessResponseSchema.parse({
        status: 'not_ready',
        service: 'api',
        checks: {
          database: 'down',
        },
      });

      return c.json(notReadyResponse, 503);
    }
  });

  app.use('/api/v1/*', csrfMiddleware);

  app.route(
    '/api/v1/auth',
    createAuthRoutes({
      authService,
      requireAuthMiddleware,
      rateLimitStore,
      cookieName: config.SESSION_COOKIE_NAME,
      sessionTtlSeconds: config.SESSION_TTL_SECONDS,
      isProduction,
      trustProxy: config.TRUST_PROXY,
      rateLimitWindowMs: config.AUTH_RATE_LIMIT_WINDOW_MS,
      registerRateLimitMax: config.AUTH_REGISTER_RATE_LIMIT_MAX,
      loginRateLimitMax: config.AUTH_LOGIN_RATE_LIMIT_MAX,
      nowFn: dependencies.nowFn,
    }),
  );

  app.get('/api/v1/users/:userId/account', requireAuthMiddleware, async (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const targetUserId = c.req.param('userId');

    assertOwnershipOrAdmin(authState.actor, targetUserId, 'user account');

    const targetUser = await lazyUserRepositoryPort.findSafeUserById(targetUserId);
    if (!targetUser) {
      throw new ApiHttpError(404, 'NOT_FOUND', 'User account not found.');
    }

    const response = authSessionResponseSchema.parse({
      user: formatAuthenticatedUserDto(targetUser),
    });

    return c.json(response, 200);
  });

  app.use('/api/v1/admin/*', requireAdminMiddleware);
  app.get('/api/v1/admin/session', (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    return c.json(
      {
        status: 'authorized' as const,
        user: formatAuthenticatedUserDto(authState.user),
      },
      200,
    );
  });

  app.notFound((c) => {
    const requestId = c.get('requestId' as never) as string | undefined;
    const notFoundError = new ApiHttpError(404, 'NOT_FOUND', 'Requested endpoint was not found.');
    return c.json(buildApiErrorPayload(notFoundError, requestId), 404);
  });

  app.onError((error, c) => {
    const requestId = c.get('requestId' as never) as string | undefined;
    const httpError = normalizeToApiHttpError(error);
    return c.json(buildApiErrorPayload(httpError, requestId), httpError.statusCode);
  });

  return app;
}
