import { describe, it, expect, beforeEach } from "vitest";
import { RateLimiter } from "../middlewares/rate-limiter.js";

describe("RateLimiter Middleware Unit Tests (HU-182)", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter();
  });

  it("permite hasta 10 peticiones por minuto para IPs anónimas y bloquea la 11va con 429", () => {
    const ipKey = "ip:192.168.1.50";
    const baseTime = 1000000;

    for (let i = 1; i <= 10; i++) {
      const res = limiter.check(ipKey, "anonymous", baseTime);
      expect(res.allowed).toBe(true);
      expect(res.remaining).toBe(10 - i);
    }

    const blocked = limiter.check(ipKey, "anonymous", baseTime);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("permite hasta 300 peticiones por minuto para usuarios autenticados de mgmt-app", () => {
    const userKey = "user:usr-owner-01";
    const baseTime = 2000000;

    for (let i = 1; i <= 300; i++) {
      const res = limiter.check(userKey, "mgmt-app", baseTime);
      expect(res.allowed).toBe(true);
    }

    const blocked = limiter.check(userKey, "mgmt-app", baseTime);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it("permite hasta 60 peticiones por minuto para dispositivos pos-device", () => {
    const posKey = "user:pos-caja-01";
    const baseTime = 3000000;

    for (let i = 1; i <= 60; i++) {
      const res = limiter.check(posKey, "pos-device", baseTime);
      expect(res.allowed).toBe(true);
    }

    const blocked = limiter.check(posKey, "pos-device", baseTime);
    expect(blocked.allowed).toBe(false);
  });

  it("reinicia el bucket tras expirar la ventana de tiempo (60s)", () => {
    const ipKey = "ip:10.0.0.1";
    const baseTime = 1000000;

    // Consumir el límite
    for (let i = 0; i < 10; i++) {
      limiter.check(ipKey, "anonymous", baseTime);
    }
    expect(limiter.check(ipKey, "anonymous", baseTime).allowed).toBe(false);

    // 61 segundos después
    const afterWindow = baseTime + 61000;
    const res = limiter.check(ipKey, "anonymous", afterWindow);
    expect(res.allowed).toBe(true);
    expect(res.remaining).toBe(9);
  });
});
