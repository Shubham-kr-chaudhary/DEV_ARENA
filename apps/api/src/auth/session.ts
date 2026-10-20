import { createHash, randomBytes } from 'node:crypto';

export const DEFAULT_SESSION_COOKIE_NAME = 'devarena_session';
export const DEFAULT_SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

/**
 * Generates a cryptographically random 256-bit (32-byte) opaque session token
 * encoded in URL-safe Base64.
 */
export function generateSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

/**
 * Computes the SHA-256 hex digest of a raw session token.
 * Only this hash is persisted in PostgreSQL (`Session.tokenHash`).
 */
export function hashSessionToken(rawToken: string): string {
  return createHash('sha256').update(rawToken, 'utf8').digest('hex');
}

export interface SessionCookieOptions {
  readonly cookieName?: string | undefined;
  readonly maxAgeSeconds?: number | undefined;
  readonly expiresAt?: Date | undefined;
  readonly isProduction: boolean;
}

export interface ClearedSessionCookieOptions {
  readonly cookieName?: string | undefined;
  readonly isProduction: boolean;
}

/**
 * Serializes the `Set-Cookie` header value for an active `devarena_session` cookie.
 *
 * - Always sets `HttpOnly`, `Path=/`, and `SameSite=Lax`.
 * - Sets `Secure` in production (`NODE_ENV=production`) while allowing local HTTP
 *   development on `localhost` without weakening production cookie attributes.
 */
export function serializeSessionCookie(rawToken: string, options: SessionCookieOptions): string {
  const cookieName = options.cookieName ?? DEFAULT_SESSION_COOKIE_NAME;
  const maxAgeSeconds = options.maxAgeSeconds ?? DEFAULT_SESSION_TTL_SECONDS;
  const expiresAt = options.expiresAt ?? new Date(Date.now() + maxAgeSeconds * 1000);

  const attributes = [
    `${cookieName}=${encodeURIComponent(rawToken)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${Math.max(0, Math.floor(maxAgeSeconds))}`,
    `Expires=${expiresAt.toUTCString()}`,
  ];

  if (options.isProduction) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

/**
 * Serializes the `Set-Cookie` header value that immediately clears `devarena_session`
 * using matching `Path`, `HttpOnly`, `SameSite`, and `Secure` attributes.
 */
export function serializeClearedSessionCookie(options: ClearedSessionCookieOptions): string {
  const cookieName = options.cookieName ?? DEFAULT_SESSION_COOKIE_NAME;
  const attributes = [
    `${cookieName}=`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=0',
    'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
  ];

  if (options.isProduction) {
    attributes.push('Secure');
  }

  return attributes.join('; ');
}

/**
 * Safely extracts the raw session token from a HTTP `Cookie` request header.
 */
export function extractSessionTokenFromCookieHeader(
  cookieHeader: string | null | undefined,
  cookieName: string = DEFAULT_SESSION_COOKIE_NAME,
): string | null {
  if (!cookieHeader || typeof cookieHeader !== 'string' || cookieHeader.length > 8192) {
    return null;
  }

  const pairs = cookieHeader.split(';');
  for (const pair of pairs) {
    const eqIdx = pair.indexOf('=');
    if (eqIdx <= 0) {
      continue;
    }

    const name = pair.slice(0, eqIdx).trim();
    if (name !== cookieName) {
      continue;
    }

    const rawValue = pair.slice(eqIdx + 1).trim();
    if (!rawValue) {
      return null;
    }

    try {
      return decodeURIComponent(rawValue);
    } catch {
      return null;
    }
  }

  return null;
}
