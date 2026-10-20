import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { hashDevelopmentPassword } from '../prisma/seed.js';
import { createApp } from '../src/app.js';
import {
  computeArgon2idRawTag,
  extractSessionTokenFromCookieHeader,
  hashPassword,
  hashSessionToken,
  verifyPassword,
} from '../src/auth/index.js';
import { InMemorySlidingWindowRateLimitStore } from '../src/middleware/index.js';
import {
  RepositoryError,
  type ActiveSessionWithUserDto,
  type AuthUserCredentialsRecord,
  type CreateSessionInput,
  type CreateUserWithProfileInput,
  type SafeUserWithProfileDto,
} from '../src/repositories/index.js';
import type { AuthUserRepositoryPort } from '../src/services/auth.service.js';

interface StoredUser {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  passwordHash: string | null;
  role: 'USER' | 'ADMIN';
  status: 'ACTIVE' | 'SUSPENDED' | 'DELETED';
  createdAt: Date;
  updatedAt: Date;
  profileId: string;
}

interface StoredSession {
  id: string;
  userId: string;
  tokenHash: string;
  ipAddress: string | null;
  userAgent: string | null;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

function createInMemoryAuthRepository() {
  const usersById = new Map<string, StoredUser>();
  const sessionsByTokenHash = new Map<string, StoredSession>();
  let simulateDatabaseFailure = false;

  const toSafeDto = (u: StoredUser): SafeUserWithProfileDto => ({
    id: u.id,
    email: u.email,
    role: u.role,
    status: u.status,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
    profile: {
      id: u.profileId,
      userId: u.id,
      username: u.username,
      displayName: u.displayName,
      bio: null,
      avatarUrl: null,
      rating: 1200,
      maxRating: 1200,
      rankTitle: 'Unrated',
      solvedCount: 0,
      attemptedCount: 0,
      contestCount: 0,
      createdAt: u.createdAt,
      updatedAt: u.updatedAt,
    },
  });

  const port: AuthUserRepositoryPort = {
    async createUserWithProfile(
      input: CreateUserWithProfileInput,
    ): Promise<SafeUserWithProfileDto> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError(
          'DATABASE_ERROR',
          'Database failure on postgresql://devarena:secret_db_pass@10.0.0.12:5432/devarena',
        );
      }

      const email = input.email.trim().toLowerCase();
      const username = input.username.trim();

      for (const existing of usersById.values()) {
        if (
          existing.email === email ||
          existing.username.toLowerCase() === username.toLowerCase()
        ) {
          throw new RepositoryError('CONFLICT', 'Email or username is already registered.');
        }
      }

      const now = new Date('2026-10-17T12:00:00.000Z');
      const stored: StoredUser = {
        id: randomUUID(),
        email,
        username,
        displayName: input.displayName ?? null,
        passwordHash: input.passwordHash ?? null,
        role: input.role ?? 'USER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
        profileId: randomUUID(),
      };

      usersById.set(stored.id, stored);
      return toSafeDto(stored);
    },

    async findAuthUserByEmail(email: string): Promise<AuthUserCredentialsRecord | null> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError(
          'DATABASE_ERROR',
          'Connection terminated unexpectedly to postgresql://devarena:secret@localhost:5432/devarena',
        );
      }

      const normalized = email.trim().toLowerCase();
      for (const u of usersById.values()) {
        if (u.email === normalized) {
          return {
            id: u.id,
            email: u.email,
            passwordHash: u.passwordHash,
            role: u.role,
            status: u.status,
            profile: {
              username: u.username,
              displayName: u.displayName,
            },
          };
        }
      }
      return null;
    },

    async findSafeUserById(userId: string): Promise<SafeUserWithProfileDto | null> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError('DATABASE_ERROR', 'Database query failed');
      }

      const u = usersById.get(userId);
      return u ? toSafeDto(u) : null;
    },

    async updateUserPasswordHash(userId: string, passwordHash: string): Promise<void> {
      const u = usersById.get(userId);
      if (u) {
        u.passwordHash = passwordHash;
      }
    },

    async createSession(input: CreateSessionInput): Promise<{ id: string; expiresAt: Date }> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError('DATABASE_ERROR', 'Session insert failed');
      }

      const session: StoredSession = {
        id: randomUUID(),
        userId: input.userId,
        tokenHash: input.tokenHash,
        ipAddress: input.ipAddress ?? null,
        userAgent: input.userAgent ?? null,
        expiresAt: input.expiresAt,
        revokedAt: null,
        createdAt: new Date('2026-10-17T12:00:00.000Z'),
      };

      sessionsByTokenHash.set(session.tokenHash, session);
      return { id: session.id, expiresAt: session.expiresAt };
    },

    async findActiveSessionByTokenHash(
      tokenHash: string,
      now: Date = new Date(),
    ): Promise<ActiveSessionWithUserDto | null> {
      if (simulateDatabaseFailure) {
        throw new RepositoryError('DATABASE_ERROR', 'Session lookup failed');
      }

      const session = sessionsByTokenHash.get(tokenHash);
      if (!session) {
        return null;
      }
      if (session.revokedAt !== null || session.expiresAt <= now) {
        return null;
      }

      const user = usersById.get(session.userId);
      if (!user) {
        return null;
      }
      if (user.status !== 'ACTIVE') {
        throw new RepositoryError('FORBIDDEN', 'User account is not active.');
      }

      return {
        sessionId: session.id,
        expiresAt: session.expiresAt,
        user: toSafeDto(user),
      };
    },

    async revokeSessionByTokenHash(
      tokenHash: string,
      revokedAt: Date = new Date(),
    ): Promise<boolean> {
      const session = sessionsByTokenHash.get(tokenHash);
      if (!session || session.revokedAt !== null) {
        return false;
      }
      session.revokedAt = revokedAt;
      return true;
    },
  };

  return {
    port,
    usersById,
    sessionsByTokenHash,
    setDatabaseFailure(failed: boolean) {
      simulateDatabaseFailure = failed;
    },
  };
}

describe('Argon2id RFC 9106 cryptographic verification & password hashing', () => {
  it('matches the official IETF RFC 9106 Section 5.3 Argon2id test vector', () => {
    const tag = computeArgon2idRawTag(
      Buffer.alloc(32, 0x01),
      Buffer.alloc(16, 0x02),
      {
        memoryKiB: 32,
        passes: 3,
        parallelism: 4,
        tagLength: 32,
      },
      Buffer.alloc(8, 0x03),
      Buffer.alloc(12, 0x04),
    );

    expect(tag.toString('hex')).toBe(
      '0d640df58d78766c08c037a34a8b53c9d01ef0452d75b65eb52520e96b01e659',
    );
  });

  it('hashes passwords with Argon2id ($argon2id$v=19$...) and verifies in constant time', async () => {
    const plain = 'S3cure-P@ssw0rd-For-DevArena!';
    const hashed = await hashPassword(plain);

    expect(hashed.startsWith('$argon2id$v=19$')).toBe(true);
    expect(hashed).not.toContain(plain);

    const validCheck = await verifyPassword(plain, hashed);
    expect(validCheck).toEqual({ valid: true, needsRehash: false });

    const wrongCheck = await verifyPassword('Wrong-Password-Attempt', hashed);
    expect(wrongCheck).toEqual({ valid: false, needsRehash: false });
  });
});

describe('Phase 3 Authentication, Sessions, RBAC, IDOR, CSRF, and Rate Limiting', () => {
  it('registers a valid user, stores Argon2id password hash and SHA-256 session token hash, and never leaks secrets', async () => {
    const store = createInMemoryAuthRepository();
    const app = createApp({
      userRepository: store.port,
      checkDatabaseReadiness: async () => true,
    });

    const response = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: '  Alice@Dev.DevArena.Local ',
        username: 'alice_dev',
        password: 'StrongPassword123!',
        displayName: 'Alice Developer',
      }),
    });

    expect(response.status).toBe(201);
    const body = (await response.json()) as {
      user: { id: string; email: string; role: string; profile: { username: string } };
    };
    expect(body.user.email).toBe('alice@dev.devarena.local');
    expect(body.user.role).toBe('USER');
    expect(body.user.profile.username).toBe('alice_dev');

    const rawResponseText = JSON.stringify(body);
    expect(rawResponseText).not.toContain('StrongPassword123!');
    expect(rawResponseText).not.toContain('passwordHash');
    expect(rawResponseText).not.toContain('tokenHash');

    // Verify stored user has Argon2id hash, never plaintext
    const storedUser = store.usersById.get(body.user.id);
    expect(storedUser?.passwordHash?.startsWith('$argon2id$v=19$')).toBe(true);
    expect(storedUser?.passwordHash).not.toContain('StrongPassword123!');

    // Verify Set-Cookie attributes and SHA-256 session token hash in DB
    const setCookieHeader = response.headers.get('set-cookie');
    expect(setCookieHeader).toBeTruthy();
    expect(setCookieHeader).toContain('devarena_session=');
    expect(setCookieHeader).toContain('HttpOnly');
    expect(setCookieHeader).toContain('SameSite=Lax');
    expect(setCookieHeader).toContain('Path=/');
    expect(setCookieHeader).not.toContain('Secure'); // Development HTTP mode

    const rawToken = extractSessionTokenFromCookieHeader(setCookieHeader);
    expect(rawToken).toBeTruthy();
    expect(store.sessionsByTokenHash.has(rawToken!)).toBe(false); // Raw token is NOT in DB
    expect(store.sessionsByTokenHash.has(hashSessionToken(rawToken!))).toBe(true); // Only SHA-256 hash is in DB
  });

  it('sets Secure cookie attribute when NODE_ENV=production', async () => {
    const store = createInMemoryAuthRepository();
    const prodApp = createApp({
      userRepository: store.port,
      config: {
        NODE_ENV: 'production',
        SESSION_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef',
      },
    });

    const response = await prodApp.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'prod@devarena.local',
        username: 'prod_user',
        password: 'StrongPassword123!',
      }),
    });

    expect(response.status).toBe(201);
    const setCookie = response.headers.get('set-cookie') ?? '';
    expect(setCookie).toContain('HttpOnly');
    expect(setCookie).toContain('SameSite=Lax');
    expect(setCookie).toContain('Secure');
  });

  it('rejects invalid registration input (400) and duplicate email or username (409)', async () => {
    const store = createInMemoryAuthRepository();
    const app = createApp({ userRepository: store.port });

    const invalidRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'invalid-email',
        username: 'a!',
        password: '123',
      }),
    });
    expect(invalidRes.status).toBe(400);
    const invalidJson = (await invalidRes.json()) as { error: { code: string } };
    expect(invalidJson.error.code).toBe('VALIDATION_ERROR');

    const firstRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'dup@devarena.local',
        username: 'dup_user',
        password: 'ValidPassword123!',
      }),
    });
    expect(firstRes.status).toBe(201);

    const dupRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'DUP@devarena.local',
        username: 'another_username',
        password: 'ValidPassword123!',
      }),
    });
    expect(dupRes.status).toBe(409);
    const dupJson = (await dupRes.json()) as { error: { code: string } };
    expect(dupJson.error.code).toBe('CONFLICT');
  });

  it('authenticates login, prevents account enumeration on failures, and transparently upgrades seed scrypt hashes to Argon2id', async () => {
    const store = createInMemoryAuthRepository();
    const now = new Date('2026-10-17T12:00:00.000Z');
    const seededId = randomUUID();
    store.usersById.set(seededId, {
      id: seededId,
      email: 'seeded@dev.devarena.local',
      username: 'seeded_dev',
      displayName: 'Seeded User',
      passwordHash: hashDevelopmentPassword('SeededPassword123!', 'seeded@dev.devarena.local'),
      role: 'USER',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      profileId: randomUUID(),
    });

    const app = createApp({ userRepository: store.port });

    // Nonexistent account returns 401 with generic message
    const missingRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'nobody@dev.devarena.local',
        password: 'SeededPassword123!',
      }),
    });
    expect(missingRes.status).toBe(401);
    const missingBody = (await missingRes.json()) as { error: { code: string; message: string } };

    // Wrong password returns identical 401 message
    const wrongPassRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'seeded@dev.devarena.local',
        password: 'WrongPassword999!',
      }),
    });
    expect(wrongPassRes.status).toBe(401);
    const wrongPassBody = (await wrongPassRes.json()) as {
      error: { code: string; message: string };
    };
    expect(wrongPassBody.error.message).toBe(missingBody.error.message);

    // Valid login succeeds and upgrades stored passwordHash from $scrypt$ to $argon2id$v=19$
    const validLoginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'SEEDED@dev.devarena.local',
        password: 'SeededPassword123!',
      }),
    });
    expect(validLoginRes.status).toBe(200);
    expect(store.usersById.get(seededId)?.passwordHash?.startsWith('$argon2id$v=19$')).toBe(true);
  });

  it('resolves current user on GET /me, revokes session on POST /logout, and rejects expired, revoked, or suspended sessions', async () => {
    const store = createInMemoryAuthRepository();
    let currentClock = new Date('2026-10-17T12:00:00.000Z');

    const app = createApp({
      userRepository: store.port,
      config: { SESSION_TTL_SECONDS: 3600 },
      nowFn: () => currentClock,
    });

    const regRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'session_user@devarena.local',
        username: 'session_user',
        password: 'ValidPassword123!',
      }),
    });
    const cookieHeader = regRes.headers.get('set-cookie')!.split(';')[0]!;

    // 1. Authenticated GET /api/v1/auth/me succeeds
    const meRes = await app.request('/api/v1/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    expect(meRes.status).toBe(200);
    const meJson = (await meRes.json()) as { user: { id: string; email: string } };
    expect(meJson.user.email).toBe('session_user@devarena.local');

    // 2. Expired session is rejected with 401
    currentClock = new Date('2026-10-17T14:00:00.000Z'); // +2h > 1h TTL
    const expiredRes = await app.request('/api/v1/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    expect(expiredRes.status).toBe(401);

    // Rewind clock to active window
    currentClock = new Date('2026-10-17T12:30:00.000Z');

    // 3. Suspended user account is rejected with 403 on both /me and /login
    store.usersById.get(meJson.user.id)!.status = 'SUSPENDED';
    const suspendedMeRes = await app.request('/api/v1/auth/me', {
      headers: { Cookie: cookieHeader },
    });
    expect(suspendedMeRes.status).toBe(403);

    const suspendedLoginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'session_user@devarena.local',
        password: 'ValidPassword123!',
      }),
    });
    expect(suspendedLoginRes.status).toBe(403);

    // Restore ACTIVE status, login again, and test POST /logout revocation
    store.usersById.get(meJson.user.id)!.status = 'ACTIVE';
    const freshLogin = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'session_user@devarena.local',
        password: 'ValidPassword123!',
      }),
    });
    const freshCookie = freshLogin.headers.get('set-cookie')!.split(';')[0]!;

    const logoutRes = await app.request('/api/v1/auth/logout', {
      method: 'POST',
      headers: { Cookie: freshCookie },
    });
    expect(logoutRes.status).toBe(200);
    expect(logoutRes.headers.get('set-cookie')).toContain('Max-Age=0');

    // Subsequent request with revoked cookie fails with 401
    const afterLogoutRes = await app.request('/api/v1/auth/me', {
      headers: { Cookie: freshCookie },
    });
    expect(afterLogoutRes.status).toBe(401);
  });

  it('enforces RBAC (USER vs ADMIN), ignores forged client role/ID claims, and blocks IDOR attempts', async () => {
    const store = createInMemoryAuthRepository();
    const app = createApp({ userRepository: store.port });

    // Register normal user A, attempting to forge role: 'ADMIN' and id in request body
    const userARes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Role': 'ADMIN',
        'X-User-Id': '00000000-0000-0000-0000-000000000001',
      },
      body: JSON.stringify({
        email: 'usera@devarena.local',
        username: 'user_a',
        password: 'ValidPassword123!',
        role: 'ADMIN',
        id: '00000000-0000-0000-0000-000000000001',
      }),
    });
    expect(userARes.status).toBe(201);
    const userABody = (await userARes.json()) as { user: { id: string; role: string } };
    expect(userABody.user.role).toBe('USER');
    expect(userABody.user.id).not.toBe('00000000-0000-0000-0000-000000000001');
    const userACookie = userARes.headers.get('set-cookie')!.split(';')[0]!;

    // Register normal user B
    const userBRes = await app.request('/api/v1/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'userb@devarena.local',
        username: 'user_b',
        password: 'ValidPassword123!',
      }),
    });
    const userBBody = (await userBRes.json()) as { user: { id: string } };

    // Create an ADMIN user in the repository and log in
    const adminPasswordHash = await hashPassword('AdminPassword123!');
    const adminId = randomUUID();
    const now = new Date('2026-10-17T12:00:00.000Z');
    store.usersById.set(adminId, {
      id: adminId,
      email: 'admin@devarena.local',
      username: 'platform_admin',
      displayName: 'Platform Admin',
      passwordHash: adminPasswordHash,
      role: 'ADMIN',
      status: 'ACTIVE',
      createdAt: now,
      updatedAt: now,
      profileId: randomUUID(),
    });
    const adminLoginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'admin@devarena.local',
        password: 'AdminPassword123!',
      }),
    });
    const adminCookie = adminLoginRes.headers.get('set-cookie')!.split(';')[0]!;

    // 1. Unauthenticated access to admin endpoint -> 401
    const unauthAdminRes = await app.request('/api/v1/admin/session');
    expect(unauthAdminRes.status).toBe(401);

    // 2. Normal USER attempting admin endpoint (even with forged X-User-Role: ADMIN header) -> 403
    const userAdminAttempt = await app.request('/api/v1/admin/session', {
      headers: {
        Cookie: userACookie,
        'X-User-Role': 'ADMIN',
      },
    });
    expect(userAdminAttempt.status).toBe(403);

    // 3. Authorized ADMIN accessing admin endpoint -> 200
    const adminAccessRes = await app.request('/api/v1/admin/session', {
      headers: { Cookie: adminCookie },
    });
    expect(adminAccessRes.status).toBe(200);

    // 4. IDOR check: User A can access own account, but gets 403 when requesting User B's account
    const ownAccountRes = await app.request(`/api/v1/users/${userABody.user.id}/account`, {
      headers: { Cookie: userACookie },
    });
    expect(ownAccountRes.status).toBe(200);

    const idorAttemptRes = await app.request(`/api/v1/users/${userBBody.user.id}/account`, {
      headers: {
        Cookie: userACookie,
        'X-User-Id': userBBody.user.id,
      },
    });
    expect(idorAttemptRes.status).toBe(403);

    // 5. ADMIN can inspect User B's account
    const adminInspectBRes = await app.request(`/api/v1/users/${userBBody.user.id}/account`, {
      headers: { Cookie: adminCookie },
    });
    expect(adminInspectBRes.status).toBe(200);
  });

  it('enforces rate limiting (429), ignores spoofed X-Forwarded-For when TRUST_PROXY=false, blocks CSRF, and masks database errors (500)', async () => {
    const store = createInMemoryAuthRepository();
    const rateLimitStore = new InMemorySlidingWindowRateLimitStore();

    const app = createApp({
      userRepository: store.port,
      rateLimitStore,
      config: {
        CORS_ORIGIN: 'http://localhost:3000',
        TRUST_PROXY: false,
        AUTH_RATE_LIMIT_WINDOW_MS: 60_000,
        AUTH_LOGIN_RATE_LIMIT_MAX: 3,
      },
    });

    // 1. CSRF protection blocks untrusted Origin and form-urlencoded content-types
    const badOriginRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'https://evil-attacker.example',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email: 'a@b.com', password: 'password123' }),
    });
    expect(badOriginRes.status).toBe(403);

    const formContentTypeRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        Origin: 'http://localhost:3000',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: 'email=a%40b.com&password=password123',
    });
    expect(formContentTypeRes.status).toBe(403);

    // 2. Rate limiting triggers 429 on 4th login attempt even if attacker rotates X-Forwarded-For (TRUST_PROXY=false)
    for (let i = 1; i <= 3; i++) {
      const res = await app.request('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': `203.0.113.${i}`,
        },
        body: JSON.stringify({
          email: `attempt${i}@devarena.local`,
          password: 'password12345',
        }),
      });
      expect(res.status).toBe(401);
    }

    const throttledRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Forwarded-For': '198.51.100.99',
      },
      body: JSON.stringify({
        email: 'attempt4@devarena.local',
        password: 'password12345',
      }),
    });
    expect(throttledRes.status).toBe(429);
    expect(throttledRes.headers.get('retry-after')).toBeTruthy();

    // 3. Database failure returns safe 500 INTERNAL_ERROR without leaking connection strings or stack traces
    rateLimitStore.reset();
    store.setDatabaseFailure(true);

    const dbFailRes = await app.request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'alice@dev.devarena.local',
        password: 'ValidPassword123!',
      }),
    });
    expect(dbFailRes.status).toBe(500);
    const dbFailText = await dbFailRes.text();
    expect(dbFailText).not.toContain('postgresql://');
    expect(dbFailText).not.toContain('secret');
    expect(dbFailText).not.toContain('at ');
  });
});
