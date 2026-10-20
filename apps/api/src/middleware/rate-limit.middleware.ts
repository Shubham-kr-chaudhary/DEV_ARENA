import type { Context, MiddlewareHandler } from 'hono';
import { ApiHttpError } from '../errors/http-error.js';

export interface RateLimitCheckResult {
  readonly allowed: boolean;
  readonly limit: number;
  readonly remaining: number;
  readonly resetAtMs: number;
  readonly retryAfterSeconds: number;
}

export interface RateLimitStore {
  consume(key: string, limit: number, windowMs: number, nowMs?: number): RateLimitCheckResult;
  reset(key?: string): void;
}

/**
 * Bounded process-local sliding-window rate limit store.
 *
 * Evicts expired buckets automatically and caps maximum tracked keys (`maxKeys`)
 * so memory usage stays bounded under high-cardinality IP traffic.
 */
export class InMemorySlidingWindowRateLimitStore implements RateLimitStore {
  private readonly timestampsByKey = new Map<string, number[]>();
  private readonly maxKeys: number;

  public constructor(options?: { readonly maxKeys?: number | undefined }) {
    this.maxKeys = options?.maxKeys ?? 10_000;
  }

  public consume(
    key: string,
    limit: number,
    windowMs: number,
    nowMs: number = Date.now(),
  ): RateLimitCheckResult {
    const windowStart = nowMs - windowMs;
    const existing = this.timestampsByKey.get(key) ?? [];
    const activeTimestamps = existing.filter((ts) => ts > windowStart);

    if (activeTimestamps.length >= limit) {
      const oldestTimestamp = activeTimestamps[0] ?? nowMs;
      const resetAtMs = oldestTimestamp + windowMs;
      const retryAfterSeconds = Math.max(1, Math.ceil((resetAtMs - nowMs) / 1000));

      this.timestampsByKey.set(key, activeTimestamps);
      return {
        allowed: false,
        limit,
        remaining: 0,
        resetAtMs,
        retryAfterSeconds,
      };
    }

    if (!this.timestampsByKey.has(key) && this.timestampsByKey.size >= this.maxKeys) {
      this.evictExpiredOrOldest(nowMs, windowMs);
    }

    activeTimestamps.push(nowMs);
    this.timestampsByKey.set(key, activeTimestamps);

    const oldestTimestamp = activeTimestamps[0] ?? nowMs;
    const resetAtMs = oldestTimestamp + windowMs;

    return {
      allowed: true,
      limit,
      remaining: Math.max(0, limit - activeTimestamps.length),
      resetAtMs,
      retryAfterSeconds: 0,
    };
  }

  public reset(key?: string): void {
    if (key !== undefined) {
      this.timestampsByKey.delete(key);
      return;
    }
    this.timestampsByKey.clear();
  }

  private evictExpiredOrOldest(nowMs: number, windowMs: number): void {
    const cutoff = nowMs - windowMs;
    for (const [k, timestamps] of this.timestampsByKey.entries()) {
      const lastTs = timestamps[timestamps.length - 1];
      if (lastTs === undefined || lastTs <= cutoff) {
        this.timestampsByKey.delete(k);
      }
    }

    if (this.timestampsByKey.size >= this.maxKeys) {
      const firstKey = this.timestampsByKey.keys().next().value;
      if (firstKey !== undefined) {
        this.timestampsByKey.delete(firstKey);
      }
    }
  }
}

/**
 * Resolves the client IP address safely.
 *
 * Security invariant: Spoofable proxy headers (`X-Forwarded-For`, `X-Real-IP`) are
 * COMPLETELY IGNORED unless `trustProxy` is explicitly enabled (`TRUST_PROXY=true`).
 */
export function resolveClientIp(c: Context, trustProxy: boolean): string {
  if (trustProxy) {
    const forwardedFor = c.req.header('x-forwarded-for');
    if (forwardedFor) {
      const firstIp = forwardedFor.split(',')[0]?.trim();
      if (firstIp && firstIp.length <= 64) {
        return firstIp;
      }
    }

    const realIp = c.req.header('x-real-ip')?.trim();
    if (realIp && realIp.length <= 64) {
      return realIp;
    }
  }

  const envSocketIp = (c.env as { incoming?: { socket?: { remoteAddress?: string } } } | undefined)
    ?.incoming?.socket?.remoteAddress;
  if (typeof envSocketIp === 'string' && envSocketIp.length > 0) {
    return envSocketIp;
  }

  return 'direct-client';
}

export interface RateLimitMiddlewareOptions {
  readonly namespace: string;
  readonly maxRequests: number;
  readonly windowMs: number;
  readonly trustProxy: boolean;
  readonly store: RateLimitStore;
  readonly nowFn?: (() => number) | undefined;
}

export function createRateLimitMiddleware(options: RateLimitMiddlewareOptions): MiddlewareHandler {
  return async (c, next) => {
    const clientIp = resolveClientIp(c, options.trustProxy);
    const key = `${options.namespace}:ip:${clientIp}`;
    const nowMs = options.nowFn ? options.nowFn() : Date.now();

    const result = options.store.consume(key, options.maxRequests, options.windowMs, nowMs);

    c.header('RateLimit-Limit', String(result.limit));
    c.header('RateLimit-Remaining', String(result.remaining));
    c.header('RateLimit-Reset', String(Math.ceil(result.resetAtMs / 1000)));

    if (!result.allowed) {
      c.header('Retry-After', String(result.retryAfterSeconds));
      throw new ApiHttpError(
        429,
        'RATE_LIMITED',
        'Too many requests. Please wait before trying again.',
      );
    }

    await next();
  };
}
