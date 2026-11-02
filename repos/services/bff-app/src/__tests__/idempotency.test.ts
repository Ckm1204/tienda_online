import { describe, it, expect, beforeEach } from "vitest";
import { IdempotencyStore } from "../middlewares/idempotency.js";

describe("IdempotencyStore Unit Tests (HU-183)", () => {
  let store: IdempotencyStore;

  beforeEach(() => {
    store = new IdempotencyStore();
  });

  it("almacena y recupera respuestas dentro del TTL de 24 horas", () => {
    const key = "idem-key-abc-123";
    const nowMs = 1000000;
    const responsePayload = {
      status: 201,
      headers: { "Content-Type": "application/json" },
      body: { id: "prod-1", name: "Leche Alquería" }
    };

    store.set(key, responsePayload, 24 * 3600 * 1000, nowMs);

    const retrieved = store.get(key, nowMs + 1000);
    expect(retrieved).not.toBeNull();
    expect(retrieved?.status).toBe(201);
    expect(retrieved?.body).toEqual(responsePayload.body);
  });

  it("retorna null y elimina entradas expiradas", () => {
    const key = "idem-key-expired";
    const nowMs = 1000000;
    const ttlMs = 5000; // 5 segundos

    store.set(
      key,
      { status: 200, headers: {}, body: { ok: true } },
      ttlMs,
      nowMs
    );

    // 1 segundo después: aún válido
    expect(store.get(key, nowMs + 1000)).not.toBeNull();

    // 6 segundos después: expirado
    const expired = store.get(key, nowMs + 6000);
    expect(expired).toBeNull();
  });

  it("limpia correctamente todo el almacenamiento al invocar clear()", () => {
    store.set("k1", { status: 200, headers: {}, body: 1 });
    store.set("k2", { status: 200, headers: {}, body: 2 });

    store.clear();

    expect(store.get("k1")).toBeNull();
    expect(store.get("k2")).toBeNull();
  });
});
