import type { CachedIdempotentResponse } from "../types.js";

/**
 * HU-183: Middleware de Idempotencia HTTP (Idempotency-Key con TTL 24 horas)
 */
export class IdempotencyStore {
  private readonly store = new Map<string, CachedIdempotentResponse>();
  private readonly defaultTtlMs = 24 * 60 * 60 * 1000; // 24 horas

  get(key: string, nowMs = Date.now()): CachedIdempotentResponse | null {
    const item = this.store.get(key);
    if (!item) return null;
    if (nowMs > item.expiresAtMs) {
      this.store.delete(key);
      return null;
    }
    return item;
  }

  set(
    key: string,
    response: Omit<CachedIdempotentResponse, "expiresAtMs">,
    ttlMs = this.defaultTtlMs,
    nowMs = Date.now()
  ): void {
    this.store.set(key, {
      ...response,
      expiresAtMs: nowMs + ttlMs
    });
  }

  clear(): void {
    this.store.clear();
  }
}
