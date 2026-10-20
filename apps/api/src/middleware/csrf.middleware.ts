import type { MiddlewareHandler } from 'hono';
import { ApiHttpError } from '../errors/http-error.js';

const STATE_CHANGING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

const FORM_SIMPLE_CONTENT_TYPES = [
  'application/x-www-form-urlencoded',
  'multipart/form-data',
  'text/plain',
];

export interface CsrfProtectionOptions {
  readonly allowedOrigin: string;
}

function normalizeOrigin(originOrUrl: string): string | null {
  try {
    const parsed = new URL(originOrUrl);
    return parsed.origin.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Defense-in-depth CSRF protection middleware for cookie-authenticated endpoints.
 *
 * Beyond `SameSite=Lax` cookies, state-changing requests (`POST`, `PUT`, `PATCH`, `DELETE`)
 * are checked against:
 * 1. `Sec-Fetch-Site`: Rejects `cross-site` browser requests immediately.
 * 2. `Origin` / `Referer`: When present, must match the configured `CORS_ORIGIN`.
 * 3. `Content-Type`: Blocks HTML form-submittable content types (`application/x-www-form-urlencoded`,
 *    `multipart/form-data`, `text/plain`) so cross-origin `<form>` posts cannot bypass CORS preflight.
 */
export function createCsrfProtectionMiddleware(options: CsrfProtectionOptions): MiddlewareHandler {
  const expectedOrigin = normalizeOrigin(options.allowedOrigin);

  return async (c, next) => {
    const method = c.req.method.toUpperCase();
    if (!STATE_CHANGING_METHODS.has(method)) {
      await next();
      return;
    }

    const secFetchSite = c.req.header('sec-fetch-site')?.toLowerCase();
    if (secFetchSite === 'cross-site') {
      throw new ApiHttpError(
        403,
        'FORBIDDEN',
        'Cross-site state-changing request blocked by CSRF policy.',
      );
    }

    const originHeader = c.req.header('origin');
    if (originHeader !== undefined) {
      const requestOrigin = normalizeOrigin(originHeader);
      if (!requestOrigin || requestOrigin !== expectedOrigin) {
        throw new ApiHttpError(
          403,
          'FORBIDDEN',
          'Request origin is not permitted by CSRF protection policy.',
        );
      }
    } else {
      const refererHeader = c.req.header('referer');
      if (refererHeader !== undefined) {
        const refererOrigin = normalizeOrigin(refererHeader);
        if (!refererOrigin || refererOrigin !== expectedOrigin) {
          throw new ApiHttpError(
            403,
            'FORBIDDEN',
            'Request referer is not permitted by CSRF protection policy.',
          );
        }
      }
    }

    const contentType = c.req.header('content-type')?.toLowerCase() ?? '';
    for (const forbiddenType of FORM_SIMPLE_CONTENT_TYPES) {
      if (contentType.startsWith(forbiddenType)) {
        throw new ApiHttpError(
          403,
          'FORBIDDEN',
          'Form-encoded content types are not permitted on JSON API endpoints.',
        );
      }
    }

    await next();
  };
}
