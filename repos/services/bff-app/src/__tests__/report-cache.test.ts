import { describe, it, expect, beforeEach } from "vitest";
import { ShortReportCache } from "../cache/report-cache.js";

describe("ShortReportCache Unit Tests (HU-318)", () => {
  let cache: ShortReportCache;

  beforeEach(() => {
    cache = new ShortReportCache();
  });

  it("almacena y entrega datos de reportes en caché dentro del TTL", () => {
    const tenantId = "tenant-1";
    const queryHash = "today";
    const data = { total_sales_cents: 500000 };
    const nowMs = 1000000;

    cache.set(tenantId, queryHash, data, 30, nowMs);

    const hit = cache.get(tenantId, queryHash, nowMs + 10000);
    expect(hit).toEqual(data);
  });

  it("invalida la entrada cuando expira el TTL de 30 segundos", () => {
    const tenantId = "tenant-1";
    const queryHash = "today";
    const data = { total_sales_cents: 500000 };
    const nowMs = 1000000;

    cache.set(tenantId, queryHash, data, 30, nowMs);

    const expired = cache.get(tenantId, queryHash, nowMs + 31000);
    expect(expired).toBeNull();
  });

  it("invalida selectivamente solo las entradas del tenant especificado", () => {
    const t1 = "tenant-1";
    const t2 = "tenant-2";
    const nowMs = 1000000;

    cache.set(t1, "today", { sales: 100 }, 30, nowMs);
    cache.set(t2, "today", { sales: 200 }, 30, nowMs);

    cache.invalidateTenant(t1);

    expect(cache.get(t1, "today", nowMs)).toBeNull();
    expect(cache.get(t2, "today", nowMs)).toEqual({ sales: 200 });
  });
});
