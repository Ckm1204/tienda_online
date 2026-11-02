import type { RateLimitConfig } from "../types.js";

/**
 * HU-182: Rate Limiting distribuido
 * - IP anónima: 10 req/min
 * - App de gestión (mgmt-app): 300 req/min
 * - Dispositivos POS (pos-device): 60 req/min
 */
export class RateLimiter {
  private readonly buckets = new Map<string, { count: number; resetAtMs: number }>();

  public limits: Record<"anonymous" | "mgmt-app" | "pos-device", RateLimitConfig> = {
    anonymous: { maxRequests: 10, windowMs: 60_000 },
    "mgmt-app": { maxRequests: 300, windowMs: 60_000 },
    "pos-device": { maxRequests: 60, windowMs: 60_000 }
  };

  check(key: string, kind: "anonymous" | "mgmt-app" | "pos-device", nowMs = Date.now()): {
    allowed: boolean;
    retryAfterSeconds?: number;
    remaining: number;
  } {
    const config = this.limits[kind];
    let bucket = this.buckets.get(key);

    if (!bucket || nowMs >= bucket.resetAtMs) {
      bucket = { count: 0, resetAtMs: nowMs + config.windowMs };
      this.buckets.set(key, bucket);
    }

    if (bucket.count >= config.maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000));
      return { allowed: false, retryAfterSeconds, remaining: 0 };
    }

    bucket.count++;
    return {
      allowed: true,
      remaining: config.maxRequests - bucket.count
    };
  }

  reset(): void {
    this.buckets.clear();
  }
}
