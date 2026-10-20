# Phase 3 Validation — Authentication & Authorization

## Scope Implemented in Phase 3

Phase 3 implements working, tested authentication, database-backed opaque sessions, CSRF defenses, rate limiting, and role-based / ownership-based authorization:

1. **Versioned Authentication Endpoints (`/api/v1/auth`)**:
   - `POST /api/v1/auth/register` (`201 Created`): Validates payload via `registerRequestSchema`, normalizes email, hashes password with **RFC 9106 Argon2id** (`$argon2id$v=19$...`), creates `User` (`role: 'USER'`) and `Profile` transactionally, persists SHA-256 session token digest in PostgreSQL `Session`, and sets the `HttpOnly` `devarena_session` cookie.
   - `POST /api/v1/auth/login` (`200 OK`): Normalizes email, verifies password in constant time (`crypto.timingSafeEqual`), executes dummy Argon2id verification on missing accounts to prevent timing enumeration, rejects `SUSPENDED`/`DELETED` accounts (`403 FORBIDDEN`), transparently upgrades development seed `$scrypt$` hashes to `$argon2id$v=19$...`, creates a new database session, and sets `devarena_session`.
   - `POST /api/v1/auth/logout` (`200 OK`): Requires an active session, revokes the session record in PostgreSQL (`revokedAt = now()`), and clears the `devarena_session` cookie (`Max-Age=0`).
   - `GET /api/v1/auth/me` (`200 OK`): Resolves the current authenticated user from the validated database session and returns `AuthenticatedUserDto` (never exposing `passwordHash` or session tokens).
2. **Authorization & IDOR Protection (`apps/api/src/middleware/auth.middleware.ts`)**:
   - `createRequireAuthMiddleware`: Rejects unauthenticated, expired, or revoked sessions with `401 UNAUTHORIZED` and suspended accounts with `403 FORBIDDEN`.
   - `createRequireRoleMiddleware` & `createRequireAdminMiddleware`: Enforces server-side role checks (`USER` vs `ADMIN`) and ignores client-supplied identity headers/fields.
   - `assertOwnershipOrAdmin`: Enforces IDOR resource ownership (`GET /api/v1/users/:userId/account`).
3. **CSRF & Abuse Protection (`csrf.middleware.ts`, `rate-limit.middleware.ts`)**:
   - Enforces `Origin` / `Referer` matching against `CORS_ORIGIN`, blocks `Sec-Fetch-Site: cross-site`, and blocks HTML form content types (`application/x-www-form-urlencoded`, `multipart/form-data`, `text/plain`) on state-changing requests.
   - Enforces sliding-window rate limiting on `/register` (by IP) and `/login` (by IP and target email account), ignoring spoofable `X-Forwarded-For` headers unless `TRUST_PROXY=true`.
   - Note on Rate-Limit Store Scope: `InMemorySlidingWindowRateLimitStore` is a bounded process-local store suitable for single-instance and development deployments; multi-instance production deployments can plug a shared PostgreSQL/distributed store into the `RateLimitStore` interface.
4. **Minimal Frontend Integration (`apps/web`)**:
   - Implemented `apps/web/lib/api-client.ts` (`credentials: 'include'`, zero `localStorage` token storage) and minimal `/login` and `/register` pages.

## Local Validation Commands

```bash
docker compose -f infra/local/postgres/compose.yml up -d
pnpm install --frozen-lockfile
pnpm validate:foundation
pnpm db:generate
pnpm db:validate
pnpm db:migrate
pnpm db:seed
pnpm format:check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```
