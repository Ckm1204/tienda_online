import { authorizeRequest, type JwtClaims } from "@tiendita/service-kit";
import type { CloudUserRecord } from "@tiendita/identity-service";
import type { HttpRequest, HttpResponse } from "../types.js";

export const DEFAULT_ALLOWED_ORIGINS = [
  "https://app.tienditaonline.co",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:8084",
  "http://127.0.0.1:8084"
];

export function buildCorsHeaders(
  origin: string | undefined,
  allowedOrigins: string[] = DEFAULT_ALLOWED_ORIGINS
): Record<string, string> {
  const headers: Record<string, string> = {};
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Credentials"] = "true";
    headers["Access-Control-Allow-Methods"] = "GET,POST,PUT,PATCH,DELETE,OPTIONS";
    headers["Access-Control-Allow-Headers"] =
      "Authorization,Content-Type,Idempotency-Key,X-Requested-With";
  }
  return headers;
}

/**
 * HU-372: Cabeceras HTTP de seguridad estrictas en Gateway y Web
 */
export function buildSecurityHeaders(): Record<string, string> {
  return {
    "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
    "Content-Security-Policy": "default-src 'self'; script-src 'self'; frame-ancestors 'none'; object-src 'none'",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-XSS-Protection": "1; mode=block"
  };
}

/**
 * HU-375: Control de egress de red (Prevención SSRF / OWASP API7)
 * Salida a internet desde contenedores restringida por lista blanca de dominios e IPs externas.
 * Bloquea IPs privadas (RFC 1918), localhost y metadatos de AWS (169.254.169.254).
 */
export const ALLOWED_EGRESS_DOMAINS = [
  "api.wompi.co",
  "sandbox.wompi.co",
  "api.payu.com",
  "graph.facebook.com",
  "fcm.googleapis.com",
  "vpfe.dian.gov.co",
  "vpfe-hab.dian.gov.co"
];

export function validateEgressTarget(targetUrl: string): { allowed: boolean; reason?: string } {
  try {
    const parsed = new URL(targetUrl);
    const host = parsed.hostname.toLowerCase();

    // Bloquear localhost y metadata de AWS
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host === "::1" ||
      host === "169.254.169.254" ||
      host.startsWith("10.") ||
      host.startsWith("192.168.") ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return { allowed: false, reason: "403 SSRF_PROTECTION: Destino privado no permitido" };
    }

    // Verificar si el dominio está en la lista blanca autorizada
    const isAllowed = ALLOWED_EGRESS_DOMAINS.some(
      (allowed) => host === allowed || host.endsWith(`.${allowed}`)
    );

    if (!isAllowed) {
      return { allowed: false, reason: `403 EGRESS_DISALLOWED: Dominio ${host} no autorizado en lista blanca` };
    }

    return { allowed: true };
  } catch {
    return { allowed: false, reason: "400 INVALID_URL_FORMAT" };
  }
}

/**
 * HU-181: Valida límites de tamaño de payload según la ruta.
 * - 1 MB para `/v1/sync/push`
 * - 10 MB para `/v1/app/products/import`
 */
export function checkPayloadSizeLimit(req: HttpRequest, corsHeaders: Record<string, string>): HttpResponse | null {
  const rawSize =
    req.rawBodySizeBytes ?? (req.body ? Buffer.byteLength(JSON.stringify(req.body)) : 0);

  if (req.path.startsWith("/v1/sync/push") && rawSize > 1024 * 1024) {
    return {
      status: 413,
      headers: { ...corsHeaders, ...buildSecurityHeaders(), "Content-Type": "application/json" },
      body: { error: "Payload Too Large", maxAllowedBytes: 1024 * 1024 }
    };
  }

  if (req.path.startsWith("/v1/app/products/import") && rawSize > 10 * 1024 * 1024) {
    return {
      status: 413,
      headers: { ...corsHeaders, ...buildSecurityHeaders(), "Content-Type": "application/json" },
      body: { error: "Payload Too Large", maxAllowedBytes: 10 * 1024 * 1024 }
    };
  }

  return null;
}

export function requirePermission(claims: JwtClaims, perm: string): void {
  if (
    !claims.perms.includes(perm) &&
    !claims.roles.includes("OWNER") &&
    !claims.roles.includes("SUPER_ADMIN")
  ) {
    throw new Error(`403 FORBIDDEN_PERMISSION:${perm}`);
  }
}

export function requireStepUpMfa(claims: JwtClaims, maxAgeSec: number, nowMs: number): void {
  const auth = authorizeRequest({
    claims,
    requireRecentMfaSeconds: maxAgeSec,
    nowEpochSeconds: Math.floor(nowMs / 1000)
  });
  if (!auth.allowed) {
    throw new Error(`403 ${auth.code || "STEP_UP_MFA_REQUIRED"}`);
  }
}

export function resolvePermissions(user: CloudUserRecord): string[] {
  const perms = new Set<string>();
  if (user.role_code === "OWNER" || user.role_code === "SUPER_ADMIN") {
    perms.add("terminal.read");
    perms.add("terminal.manage");
    perms.add("shift.manage");
    perms.add("user.read");
    perms.add("user.manage");
    perms.add("catalog.read");
    perms.add("catalog.manage");
    perms.add("inventory.read");
    perms.add("inventory.manage");
    perms.add("customer.read");
    perms.add("customer.manage");
    perms.add("customer.credit_manage");
    perms.add("reports.read");
  } else if (user.role_code === "ACCOUNTANT") {
    perms.add("reports.read");
  } else if (user.role_code === "CASHIER") {
    perms.add("sale.create");
    perms.add("catalog.read");
  }
  return [...perms];
}
