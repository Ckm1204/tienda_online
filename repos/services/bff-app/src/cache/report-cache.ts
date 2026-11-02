/**
 * HU-318: Caché corta de reportes (TTL 15-60s) con invalidación por eventos
 */
export class ShortReportCache {
  private readonly cache = new Map<
    string,
    { body: unknown; expiresAtMs: number; tenantId: string }
  >();

  get(tenantId: string, queryHash: string, nowMs = Date.now()): unknown | null {
    const key = `${tenantId}:${queryHash}`;
    const entry = this.cache.get(key);
    if (!entry) return null;
    if (nowMs > entry.expiresAtMs) {
      this.cache.delete(key);
      return null;
    }
    return entry.body;
  }

  set(
    tenantId: string,
    queryHash: string,
    body: unknown,
    ttlSeconds = 30,
    nowMs = Date.now()
  ): void {
    const key = `${tenantId}:${queryHash}`;
    this.cache.set(key, {
      body,
      tenantId,
      expiresAtMs: nowMs + ttlSeconds * 1000
    });
  }

  invalidateTenant(tenantId: string): void {
    for (const [key, entry] of this.cache.entries()) {
      if (entry.tenantId === tenantId) {
        this.cache.delete(key);
      }
    }
  }

  clear(): void {
    this.cache.clear();
  }
}
