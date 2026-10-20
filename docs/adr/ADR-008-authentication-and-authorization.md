# ADR-008 — Authentication and Authorization Architecture

## Status

Accepted — Phase 1.

## Context

DevArena supports normal developers (`USER`) and platform administrators (`ADMIN`), with requirements for registration, login, logout, current-user inspection (`GET /api/v1/auth/me`), protected routes, role-based access control (RBAC), Insecure Direct Object Reference (IDOR) protection, and future OAuth provider integration (GitHub, Google).

Storing long-lived bearer tokens in browser `localStorage` exposes credentials to cross-site scripting (XSS) and prevents immediate server-side session revocation when a user logs out or an account is suspended.

## Options

1. **Stateless JWTs stored in `localStorage`** — simple client header attachment, but vulnerable to XSS exfiltration and cannot be revoked immediately before token expiry without a server blocklist.
2. **Server-side database sessions with `HttpOnly` cookies + Argon2id password hashing** — opaque session tokens stored as SHA-256 digests in PostgreSQL, transmitted via `HttpOnly; Secure; SameSite=Lax` cookies, with extensible account linking for OAuth.

## Decision

1. **Password Hashing**:
   - Hash passwords server-side using **Argon2id** (OWASP recommended parameters). Plaintext passwords are never logged, persisted, or returned.
2. **Session Transport and Storage**:
   - Issue a cryptographically random 256-bit session token on login/registration.
   - Send the raw token to the browser exclusively in an `HttpOnly`, `SameSite=Lax`, `Path=/` cookie (`Secure` enabled in production).
   - Persist only the **SHA-256 hash** of the session token in the PostgreSQL `Session` table alongside `userId`, `expiresAt`, `revokedAt`, `ipAddress`, and `userAgent`.
3. **Server-Side Authorization & IDOR Prevention**:
   - Every authenticated route resolves the active `User` and `Role` from the server-validated session, never from client-supplied headers, query parameters, or body fields.
   - Resource endpoints (`GET /api/v1/submissions/:id`, contest submissions, draft problems) verify resource ownership (`submission.userId === actor.id || actor.role === 'ADMIN'`) inside the service layer before returning data.
   - Role checks (`requireRole('ADMIN')`) are enforced via dedicated Hono middleware on all `/api/v1/admin/*` routes and audited via `AuditLog`.
4. **OAuth Extensibility**:
   - Decouple credential storage from core user identity so `User` can authenticate via password (`passwordHash`) or linked `OAuthAccount` records (`provider`, `providerAccountId`) in future phases without altering session middleware.

## Consequences

- Browser JavaScript cannot read session tokens via `document.cookie`, mitigating XSS session theft.
- Logout and administrative user suspension (`UserStatus.SUSPENDED`) take effect immediately on the next request.
- Requires an Incremental Phase 2 Prisma migration to add `passwordHash` on `User` plus the `Session` and `OAuthAccount` models before Phase 3 implementation.
