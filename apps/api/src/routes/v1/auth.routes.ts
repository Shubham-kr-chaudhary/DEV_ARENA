import {
  authSessionResponseSchema,
  loginRequestSchema,
  logoutResponseSchema,
  registerRequestSchema,
} from '@devarena/api-contracts';
import { Hono, type Context, type MiddlewareHandler } from 'hono';
import {
  extractSessionTokenFromCookieHeader,
  serializeClearedSessionCookie,
  serializeSessionCookie,
} from '../../auth/index.js';
import { ApiHttpError } from '../../errors/http-error.js';
import {
  createRateLimitMiddleware,
  requireAuthenticatedStateFromContext,
  resolveClientIp,
  type RateLimitStore,
} from '../../middleware/index.js';
import { AuthService, formatAuthenticatedUserDto } from '../../services/auth.service.js';

export interface AuthRoutesDependencies {
  readonly authService: AuthService;
  readonly requireAuthMiddleware: MiddlewareHandler;
  readonly rateLimitStore: RateLimitStore;
  readonly cookieName: string;
  readonly sessionTtlSeconds: number;
  readonly isProduction: boolean;
  readonly trustProxy: boolean;
  readonly rateLimitWindowMs: number;
  readonly registerRateLimitMax: number;
  readonly loginRateLimitMax: number;
  readonly nowFn?: (() => Date) | undefined;
}

async function parseJsonRequestBody(c: Context): Promise<unknown> {
  const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('application/json')) {
    throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Content-Type must be application/json.');
  }

  try {
    return await c.req.json();
  } catch {
    throw new ApiHttpError(400, 'VALIDATION_ERROR', 'Malformed JSON request body.');
  }
}

export function createAuthRoutes(deps: AuthRoutesDependencies): Hono {
  const router = new Hono();
  const customNowFn = deps.nowFn;
  const nowMsFn = customNowFn ? () => customNowFn().getTime() : () => Date.now();

  const registerIpRateLimit = createRateLimitMiddleware({
    namespace: 'auth:register',
    maxRequests: deps.registerRateLimitMax,
    windowMs: deps.rateLimitWindowMs,
    trustProxy: deps.trustProxy,
    store: deps.rateLimitStore,
    nowFn: nowMsFn,
  });

  const loginIpRateLimit = createRateLimitMiddleware({
    namespace: 'auth:login',
    maxRequests: deps.loginRateLimitMax,
    windowMs: deps.rateLimitWindowMs,
    trustProxy: deps.trustProxy,
    store: deps.rateLimitStore,
    nowFn: nowMsFn,
  });

  router.post('/register', registerIpRateLimit, async (c) => {
    const rawBody = await parseJsonRequestBody(c);
    const parsedInput = registerRequestSchema.parse(rawBody);

    const ipAddress = resolveClientIp(c, deps.trustProxy);
    const userAgent = c.req.header('user-agent') ?? null;

    const issued = await deps.authService.register(parsedInput, {
      ipAddress,
      userAgent,
    });

    c.header(
      'Set-Cookie',
      serializeSessionCookie(issued.rawSessionToken, {
        cookieName: deps.cookieName,
        maxAgeSeconds: deps.sessionTtlSeconds,
        expiresAt: issued.expiresAt,
        isProduction: deps.isProduction,
      }),
    );

    const response = authSessionResponseSchema.parse({
      user: issued.user,
    });

    return c.json(response, 201);
  });

  router.post('/login', loginIpRateLimit, async (c) => {
    const rawBody = await parseJsonRequestBody(c);
    const parsedInput = loginRequestSchema.parse(rawBody);

    const accountRateLimit = deps.rateLimitStore.consume(
      `auth:login:account:${parsedInput.email}`,
      deps.loginRateLimitMax,
      deps.rateLimitWindowMs,
      nowMsFn(),
    );

    if (!accountRateLimit.allowed) {
      c.header('Retry-After', String(accountRateLimit.retryAfterSeconds));
      throw new ApiHttpError(
        429,
        'RATE_LIMITED',
        'Too many login attempts for this account. Please wait before trying again.',
      );
    }

    const ipAddress = resolveClientIp(c, deps.trustProxy);
    const userAgent = c.req.header('user-agent') ?? null;

    const issued = await deps.authService.login(parsedInput, {
      ipAddress,
      userAgent,
    });

    c.header(
      'Set-Cookie',
      serializeSessionCookie(issued.rawSessionToken, {
        cookieName: deps.cookieName,
        maxAgeSeconds: deps.sessionTtlSeconds,
        expiresAt: issued.expiresAt,
        isProduction: deps.isProduction,
      }),
    );

    const response = authSessionResponseSchema.parse({
      user: issued.user,
    });

    return c.json(response, 200);
  });

  router.post('/logout', deps.requireAuthMiddleware, async (c) => {
    const cookieHeader = c.req.header('cookie');
    const rawToken = extractSessionTokenFromCookieHeader(cookieHeader, deps.cookieName);

    if (rawToken) {
      await deps.authService.logout(rawToken);
    }

    c.header(
      'Set-Cookie',
      serializeClearedSessionCookie({
        cookieName: deps.cookieName,
        isProduction: deps.isProduction,
      }),
    );

    const response = logoutResponseSchema.parse({
      status: 'logged_out',
    });

    return c.json(response, 200);
  });

  router.get('/me', deps.requireAuthMiddleware, (c) => {
    const authState = requireAuthenticatedStateFromContext(c);
    const response = authSessionResponseSchema.parse({
      user: formatAuthenticatedUserDto(authState.user),
    });

    return c.json(response, 200);
  });

  return router;
}
