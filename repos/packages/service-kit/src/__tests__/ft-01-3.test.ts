import { describe, it, expect } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { newId } from "@tiendita/contracts";
import {
  withTenant,
  RlsProtectedMemoryTable,
  assertTenantIsolation,
  OutboxStore,
  OutboxRelay,
  InboxConsumerRunner,
  DEFAULT_IDEMPOTENT_PRODUCER_CONFIG,
  KafkaMessageEnvelope,
  CircuitBreaker,
  CircuitOpenError,
  createOrContinueTraceContext,
  formatStructuredLog,
  scrubSentryEvent,
  authorizeRequest,
  BaseServiceEnvSchema,
  validateStartupEnv,
  ServiceLifecycleManager,
  generateServiceSkeleton,
  createServiceServer
} from "../index.js";

describe("FT-01.3 — packages/service-kit (RLS, Outbox/Inbox, Circuit Breaker, OTel, Auth, Lifecycle)", () => {
  it("HU-010 & HU-155: ejecuta SET LOCAL app.tenant_id y aísla estrictamente dos tiendas (assertTenantIsolation)", async () => {
    const table = new RlsProtectedMemoryTable<{ id: string; tenant_id: string; name: string }>();

    await assertTenantIsolation({
      createAsTenant: async (tenantId) => {
        const session = table.createSession();
        return withTenant(session, tenantId, async () => {
          const id = newId();
          const resource = table.insert({ id, tenant_id: tenantId, name: "Arroz 1kg" });
          return { id, resource };
        });
      },
      readAsTenant: async (tenantId, resourceId) => {
        const session = table.createSession();
        return withTenant(session, tenantId, async () => table.selectById(resourceId));
      },
      updateAsTenant: async (tenantId, resourceId) => {
        const session = table.createSession();
        return withTenant(session, tenantId, async () => table.update(resourceId, { name: "Hackeado" }));
      },
      deleteAsTenant: async (tenantId, resourceId) => {
        const session = table.createSession();
        return withTenant(session, tenantId, async () => table.delete(resourceId));
      }
    });

    // Fallo seguro cuando no hay contexto de tenant
    table.clearTenantSession();
    expect(table.selectAll()).toEqual([]);
    await expect(withTenant(table.createSession(), "", async () => "no")).rejects.toThrow(
      "TENANT_CONTEXT_MISSING_OR_INVALID"
    );
  });

  it("HU-011 & HU-153: Transactional Outbox y Relay publican tras caída temporal de Kafka con idempotent:true, acks:-1 y headers de traza y tenant", async () => {
    const store = new OutboxStore();
    const publishedMessages: KafkaMessageEnvelope[] = [];
    let kafkaAvailable = false;

    const relay = new OutboxRelay(store, {
      publish: async (msg, cfg) => {
        expect(cfg).toEqual(DEFAULT_IDEMPOTENT_PRODUCER_CONFIG);
        if (!kafkaAvailable) {
          throw new Error("KAFKA_BROKER_DOWN");
        }
        publishedMessages.push(msg);
      }
    });

    const tenantId = newId();
    const eventId = newId();
    store.enqueue({
      event_id: eventId,
      tenant_id: tenantId,
      topic: "pos.events",
      partition_key: "terminal-1",
      event_type: "sale.completed",
      payload: { total_cents: 1500000 },
      traceparent: "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01"
    });

    // Mientras Kafka está caído permanece con published_at = NULL
    await expect(relay.flushPending()).rejects.toThrow("KAFKA_BROKER_DOWN");
    expect(store.getUnpublished()).toHaveLength(1);

    // Cuando Kafka vuelve a estar disponible publica y actualiza published_at
    kafkaAvailable = true;
    const count = await relay.flushPending();
    expect(count).toBe(1);
    expect(store.getUnpublished()).toHaveLength(0);
    expect(publishedMessages[0]?.headers["x-tenant-id"]).toBe(tenantId);
    expect(publishedMessages[0]?.headers["x-event-id"]).toBe(eventId);
    expect(publishedMessages[0]?.headers["traceparent"]).toContain("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("HU-012: Idempotent Consumer (inbox.once) ignora entregas duplicadas y envía a <topic>.dlt tras 3 fallos en <topic>.retry", async () => {
    const inbox = new InboxConsumerRunner(3);
    const eventId = newId();
    let stockDiscountedTimes = 0;

    const first = await inbox.once({
      topic: "pos.events",
      eventId,
      consumer: "inventory-service",
      payload: { qty: 2 },
      handler: async () => {
        stockDiscountedTimes += 1;
      }
    });
    expect(first.status).toBe("APPLIED");

    // Reentrega duplicada por Kafka
    const duplicate = await inbox.once({
      topic: "pos.events",
      eventId,
      consumer: "inventory-service",
      payload: { qty: 2 },
      handler: async () => {
        stockDiscountedTimes += 1;
      }
    });
    expect(duplicate.status).toBe("DUPLICATE");
    expect(stockDiscountedTimes).toBe(1);

    // Fallo persistente -> 3 reintentos -> DLT
    const badEventId = newId();
    const dltRes = await inbox.once({
      topic: "pos.events",
      eventId: badEventId,
      consumer: "inventory-service",
      payload: { corrupt: true },
      handler: async () => {
        throw new Error("DB_CONSTRAINT_ERROR");
      }
    });
    expect(dltRes.status).toBe("SENT_TO_DLT");
    expect(dltRes.attempts).toBe(3);
    expect(inbox.retryQueue.filter((r) => r.eventId === badEventId)).toHaveLength(3);
    expect(inbox.dltMessages[0]?.dltTopic).toBe("pos.events.dlt");
  });

  it("HU-013: Circuit Breaker abre el circuito tras 5 fallos consecutivos y responde inmediatamente con Problem Details RFC 9457 (503 SERVICE_UNAVAILABLE)", async () => {
    const breaker = new CircuitBreaker({
      name: "reporting-service",
      failureThreshold: 5,
      resetTimeoutMs: 30_000,
      callTimeoutMs: 50
    });

    for (let i = 0; i < 5; i++) {
      await expect(
        breaker.execute(async () => {
          throw new Error("SOCKET_TIMEOUT");
        })
      ).rejects.toThrow("SOCKET_TIMEOUT");
    }

    expect(breaker.getState()).toBe("OPEN");

    // Sexta llamada falla en < 5ms con CircuitOpenError y RFC 9457 Problem Details
    let underlyingCalled = false;
    try {
      await breaker.execute(
        async () => {
          underlyingCalled = true;
          return "ok";
        },
        { instance: "/v1/app/reports/dashboard", traceId: "trace-123" }
      );
      expect.fail("Should have thrown CircuitOpenError");
    } catch (err) {
      expect(underlyingCalled).toBe(false);
      expect(err).toBeInstanceOf(CircuitOpenError);
      const cErr = err as CircuitOpenError;
      expect(cErr.problem.status).toBe(503);
      expect(cErr.problem.code).toBe("SERVICE_UNAVAILABLE");
      expect(cErr.problem.trace_id).toBe("trace-123");
    }
  });

  it("HU-014 & HU-481: propaga trace_id en W3C traceparent y redacta campos sensibles (PIN, password, token, phone) en logs y Sentry", () => {
    const incoming = "00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01";
    const ctx = createOrContinueTraceContext(incoming);
    expect(ctx.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
    expect(ctx.traceparent.startsWith("00-4bf92f3577b34da6a3ce929d0e0e4736-")).toBe(true);

    const logJson = formatStructuredLog({
      level: "info",
      service: "sync-service",
      trace_id: ctx.traceId,
      tenant_id: newId(),
      msg: "User login attempt",
      meta: {
        pin: "4829",
        password: "secretPassword",
        authorization: "Bearer eyJ...",
        safeField: "CAJA-01"
      }
    });
    expect(logJson).not.toContain("4829");
    expect(logJson).not.toContain("secretPassword");
    expect(logJson).not.toContain("eyJ");
    expect(logJson).toContain("[REDACTED]");
    expect(logJson).toContain("CAJA-01");

    const scrubbed = scrubSentryEvent({
      headers: { Authorization: "Bearer secret", Cookie: "sid=123" },
      body: { pin: "1234", phone: "3105551234", total_cents: 5000 }
    });
    expect(scrubbed.headers.Authorization).toBe("[REDACTED]");
    expect(scrubbed.body.pin).toBe("[REDACTED]");
    expect(scrubbed.body.phone).toBe("[REDACTED]");
    expect(scrubbed.body.total_cents).toBe(5000);
  });

  it("HU-154 & HU-285: guard de autorización verifica audiencia, permiso, Step-up MFA reciente y alcance de sucursal", () => {
    const posTokenClaims = {
      sub: newId(),
      tid: newId(),
      bid: "branch-1",
      roles: ["CASHIER"],
      perms: ["sale.create"],
      aud: "pos-device" as const
    };

    // Token pos-device intentando llamar a endpoint mgmt-app es rechazado con 403
    const audRes = authorizeRequest({
      claims: posTokenClaims,
      requiredAudience: "mgmt-app"
    });
    expect(audRes.allowed).toBe(false);
    expect(audRes.status).toBe(403);
    expect(audRes.code).toBe("FORBIDDEN_AUDIENCE");

    // Step-up MFA vencido (> 300s) es rechazado
    const mfaRes = authorizeRequest({
      claims: {
        ...posTokenClaims,
        aud: "mgmt-app",
        perms: ["terminals.manage"],
        amr: ["pwd", "mfa"],
        mfa_authenticated_at: 1000
      },
      requiredAudience: "mgmt-app",
      requiredPermission: "terminals.manage",
      requireRecentMfaSeconds: 300,
      nowEpochSeconds: 2000
    });
    expect(mfaRes.allowed).toBe(false);
    expect(mfaRes.code).toBe("STEP_UP_MFA_REQUIRED");

    // Alcance de sucursal cruzado es rechazado (HU-285)
    const branchRes = authorizeRequest({
      claims: { ...posTokenClaims, aud: "mgmt-app", bid: "branch-1" },
      requestedBranchId: "branch-2"
    });
    expect(branchRes.allowed).toBe(false);
    expect(branchRes.code).toBe("FORBIDDEN_BRANCH_SCOPE");
  });

  it("HU-479 & HU-480: Fail-Fast Startup Validation aborta si falta DATABASE_URL/KAFKA_BROKERS y Graceful Shutdown espera peticiones en vuelo", async () => {
    expect(() =>
      validateStartupEnv({ SERVICE_NAME: "sales-service" }, BaseServiceEnvSchema)
    ).toThrow(/DATABASE_URL.*KAFKA_BROKERS/);

    const lifecycle = new ServiceLifecycleManager();
    expect(lifecycle.getLiveStatus().status).toBe(200);
    expect(lifecycle.getReadyStatus().status).toBe(200);

    let inFlightFinished = false;
    const inFlightPromise = lifecycle.trackInFlight(async () => {
      await new Promise((r) => setTimeout(r, 20));
      inFlightFinished = true;
      return 200;
    });

    const shutdownPromise = lifecycle.initiateGracefulShutdown();
    // Mientras se apaga, /health/ready responde 503
    expect(lifecycle.getReadyStatus().status).toBe(503);

    const res = await inFlightPromise;
    await shutdownPromise;
    expect(res).toBe(200);
    expect(inFlightFinished).toBe(true);
  });

  it("HU-015: generador de microservicio crea el esqueleto completo conectado a service-kit", () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "tiendita-gen-"));
    try {
      const createdDir = generateServiceSkeleton(tmpDir, "ejemplo-service");
      expect(fs.existsSync(path.join(createdDir, "package.json"))).toBe(true);
      expect(fs.existsSync(path.join(createdDir, "Dockerfile"))).toBe(true);
      expect(fs.existsSync(path.join(createdDir, "src/index.ts"))).toBe(true);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it("HU-014 & HU-480: createServiceServer expone endpoints de health y propaga traceparent", async () => {
    const server = createServiceServer({
      serviceName: "test-service",
      port: 0
    });

    await new Promise<void>((resolve) => server.listen(0, resolve));
    const addr = server.address() as { port: number };

    try {
      const resLive = await fetch(`http://127.0.0.1:${addr.port}/health/live`);
      expect(resLive.status).toBe(200);
      expect(resLive.headers.get("traceparent")).toMatch(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/);
      const jsonLive = (await resLive.json()) as { status: string; service: string };
      expect(jsonLive.status).toBe("LIVE");
      expect(jsonLive.service).toBe("test-service");

      const resReady = await fetch(`http://127.0.0.1:${addr.port}/health/ready`);
      expect(resReady.status).toBe(200);
      const jsonReady = (await resReady.json()) as { status: string };
      expect(jsonReady.status).toBe("READY");
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });
});
