import crypto from "node:crypto";
import http from "node:http";
import { z } from "zod";

/**
 * HU-014: Instrumentación OpenTelemetry (propagación `traceparent`, logs JSON sin PII) y endpoints `/health`.
 * HU-154: Guard de autenticación JWT y extractor de claims (`tid`, `sub`, `roles`, `perms`, `aud`, `amr`).
 * HU-479: Fail-Fast Startup Validation de variables de entorno con Zod.
 * HU-480: Graceful Shutdown en SIGTERM (marca `/health/ready` en 503, espera requests en vuelo y cierra recursos).
 * HU-481: Enmascaramiento automático de datos sensibles en errores enviados a Sentry (`beforeSend`).
 */

const SENSITIVE_KEYS_REGEX = /^(password|pin|pin_hash|token|access_token|refresh_token|authorization|cookie|card_number|cvv|secret|phone|email|doc_number)$/i;

export function redactSensitiveFields<T>(input: T): T {
  if (input === null || typeof input !== "object") {
    return input;
  }
  if (Array.isArray(input)) {
    return input.map((item) => redactSensitiveFields(item)) as unknown as T;
  }
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    if (SENSITIVE_KEYS_REGEX.test(key)) {
      out[key] = "[REDACTED]";
    } else {
      out[key] = redactSensitiveFields(value);
    }
  }
  return out as T;
}

/**
 * HU-481: Hook `beforeSend` para Sentry que elimina cabeceras y campos con PII/secretos.
 */
export function scrubSentryEvent<T extends Record<string, unknown>>(event: T): T {
  return redactSensitiveFields(event);
}

// HU-014: Propagación W3C traceparent
export interface TraceContext {
  traceId: string;
  spanId: string;
  traceparent: string;
}

export function createOrContinueTraceContext(incomingTraceparent?: string | null): TraceContext {
  if (incomingTraceparent) {
    const m = incomingTraceparent.match(/^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i);
    if (m?.[1]) {
      const traceId = m[1].toLowerCase();
      const spanId = crypto.randomBytes(8).toString("hex");
      return {
        traceId,
        spanId,
        traceparent: `00-${traceId}-${spanId}-01`
      };
    }
  }
  const traceId = crypto.randomBytes(16).toString("hex");
  const spanId = crypto.randomBytes(8).toString("hex");
  return {
    traceId,
    spanId,
    traceparent: `00-${traceId}-${spanId}-01`
  };
}

export function formatStructuredLog(entry: {
  level: "info" | "warn" | "error";
  service: string;
  trace_id: string;
  tenant_id?: string | null;
  terminal_id?: string | null;
  msg: string;
  meta?: Record<string, unknown>;
}): string {
  const safeMeta = entry.meta ? redactSensitiveFields(entry.meta) : undefined;
  return JSON.stringify({
    ts: new Date().toISOString(),
    level: entry.level,
    service: entry.service,
    trace_id: entry.trace_id,
    tenant_id: entry.tenant_id ?? null,
    terminal_id: entry.terminal_id ?? null,
    msg: entry.msg,
    ...(safeMeta ? { meta: safeMeta } : {})
  });
}

// ============================================================================
// HU-154 & HU-285: Guard de autenticación JWT, audiencias, permisos, MFA y alcance de sucursal
// ============================================================================

export type TokenAudience = "pos-device" | "mgmt-app" | "platform";

export interface JwtClaims {
  sub: string;
  tid: string | null;
  bid?: string | null;
  term?: string | null;
  roles: string[];
  perms: string[];
  aud: TokenAudience;
  amr?: string[];
  mfa_authenticated_at?: number; // epoch seconds
  actor_kind?: "USER" | "TERMINAL" | "SUPPORT" | "SUPER_ADMIN";
}

export function authorizeRequest(params: {
  claims: JwtClaims;
  requiredAudience?: TokenAudience;
  requiredPermission?: string;
  requireRecentMfaSeconds?: number;
  requestedBranchId?: string | null;
  nowEpochSeconds?: number;
}): { allowed: boolean; status: 200 | 401 | 403; code?: string } {
  const { claims } = params;

  if (params.requiredAudience && claims.aud !== params.requiredAudience) {
    return { allowed: false, status: 403, code: "FORBIDDEN_AUDIENCE" };
  }

  if (params.requiredPermission && !claims.perms.includes(params.requiredPermission)) {
    return { allowed: false, status: 403, code: "FORBIDDEN_PERMISSION" };
  }

  if (params.requireRecentMfaSeconds !== undefined) {
    const nowSec = params.nowEpochSeconds ?? Math.floor(Date.now() / 1000);
    const hasMfa = claims.amr?.includes("mfa") ?? false;
    const mfaAge = claims.mfa_authenticated_at !== undefined ? nowSec - claims.mfa_authenticated_at : Infinity;
    if (!hasMfa || mfaAge > params.requireRecentMfaSeconds) {
      return { allowed: false, status: 403, code: "STEP_UP_MFA_REQUIRED" };
    }
  }

  // HU-285: BOLA/BFLA branch scope check
  if (params.requestedBranchId && claims.bid && claims.bid !== params.requestedBranchId) {
    return { allowed: false, status: 403, code: "FORBIDDEN_BRANCH_SCOPE" };
  }

  return { allowed: true, status: 200 };
}

// ============================================================================
// HU-479: Fail-Fast Startup Validation de variables de entorno con Zod
// ============================================================================

export const BaseServiceEnvSchema = z.object({
  SERVICE_NAME: z.string().min(2),
  NODE_ENV: z.enum(["development", "test", "staging", "production"]).default("development"),
  DATABASE_URL: z.string().url(),
  KAFKA_BROKERS: z.string().min(3)
});

export function validateStartupEnv<TSchema extends z.ZodTypeAny>(
  rawEnv: Record<string, string | undefined>,
  schema: TSchema
): z.infer<TSchema> {
  const parsed = schema.safeParse(rawEnv);
  if (!parsed.success) {
    const missingFields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`STARTUP_ENV_INVALID: Missing or invalid environment variables: ${missingFields}`);
  }
  return parsed.data;
}

// ============================================================================
// HU-014 & HU-480: Health controller y Graceful Shutdown en SIGTERM
// ============================================================================

export class ServiceLifecycleManager {
  private shuttingDown = false;
  private inFlightCount = 0;
  private idleResolvers: (() => void)[] = [];

  getLiveStatus(): { status: 200; body: { status: "LIVE" } } {
    return { status: 200, body: { status: "LIVE" } };
  }

  getReadyStatus(dependenciesHealthy = true): { status: 200 | 503; body: { status: "READY" | "SHUTTING_DOWN" | "NOT_READY" } } {
    if (this.shuttingDown) {
      return { status: 503, body: { status: "SHUTTING_DOWN" } };
    }
    if (!dependenciesHealthy) {
      return { status: 503, body: { status: "NOT_READY" } };
    }
    return { status: 200, body: { status: "READY" } };
  }

  async trackInFlight<T>(fn: () => Promise<T>): Promise<T> {
    if (this.shuttingDown) {
      throw new Error("SERVICE_SHUTTING_DOWN");
    }
    this.inFlightCount += 1;
    try {
      return await fn();
    } finally {
      this.inFlightCount -= 1;
      if (this.inFlightCount === 0) {
        for (const resolve of this.idleResolvers.splice(0)) {
          resolve();
        }
      }
    }
  }

  async initiateGracefulShutdown(cleanupCallbacks: (() => Promise<void>)[] = []): Promise<void> {
    this.shuttingDown = true;
    if (this.inFlightCount > 0) {
      await new Promise<void>((resolve) => {
        this.idleResolvers.push(resolve);
      });
    }
    for (const cb of cleanupCallbacks) {
      await cb();
    }
  }
}

// ============================================================================
// HU-014 & HU-480: Standard Microservice HTTP Server Harness
// ============================================================================

export interface ServiceServerOptions {
  serviceName: string;
  port?: number;
  host?: string;
  lifecycle?: ServiceLifecycleManager;
  handleRequest?: (req: http.IncomingMessage, res: http.ServerResponse) => Promise<boolean | void> | boolean | void;
}

export function createServiceServer(options: ServiceServerOptions): http.Server {
  const {
    serviceName,
    port = parseInt(process.env.PORT || "3000", 10),
    host = process.env.HOST || "0.0.0.0",
    lifecycle = new ServiceLifecycleManager(),
    handleRequest
  } = options;

  const server = http.createServer(async (req, res) => {
    const traceCtx = createOrContinueTraceContext(req.headers["traceparent"] as string | undefined);
    res.setHeader("traceparent", traceCtx.traceparent);

    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (url.pathname === "/health/live" && req.method === "GET") {
      const live = lifecycle.getLiveStatus();
      res.writeHead(live.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...live.body, service: serviceName, uptime: process.uptime() }));
      return;
    }

    if (url.pathname === "/health/ready" && req.method === "GET") {
      const ready = lifecycle.getReadyStatus();
      res.writeHead(ready.status, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ...ready.body, service: serviceName }));
      return;
    }

    if (handleRequest) {
      try {
        const handled = await lifecycle.trackInFlight(async () => handleRequest(req, res));
        if (handled !== false && res.writableEnded) return;
      } catch (err: unknown) {
        const message = err instanceof Error ? err.message : "Internal Error";
        if (!res.headersSent) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ error: "INTERNAL_ERROR", detail: message }));
        }
        return;
      }
    }

    if (!res.writableEnded) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "NOT_FOUND", service: serviceName, path: url.pathname }));
    }
  });

  return server;
}
