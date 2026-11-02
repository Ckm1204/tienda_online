import { describe, it, expect } from "vitest";
import type { JwtClaims } from "@tiendita/service-kit";
import type { CloudUserRecord } from "@tiendita/identity-service";
import {
  buildCorsHeaders,
  buildSecurityHeaders,
  validateEgressTarget,
  checkPayloadSizeLimit,
  requirePermission,
  requireStepUpMfa,
  resolvePermissions
} from "../middlewares/gateway-security.js";
import type { HttpRequest } from "../types.js";

describe("Gateway Security Middleware Unit Tests (HU-181, HU-097, HU-372, HU-375)", () => {
  it("construye cabeceras CORS válidas solo para orígenes permitidos", () => {
    const validOrigin = "https://app.tienditaonline.co";
    const headers = buildCorsHeaders(validOrigin);
    expect(headers["Access-Control-Allow-Origin"]).toBe(validOrigin);
    expect(headers["Access-Control-Allow-Credentials"]).toBe("true");

    const invalidOrigin = "https://malicious-site.com";
    const noHeaders = buildCorsHeaders(invalidOrigin);
    expect(noHeaders["Access-Control-Allow-Origin"]).toBeUndefined();
  });

  it("HU-372: Emite cabeceras de seguridad estrictas (HSTS, CSP, nosniff, DENY)", () => {
    const secHeaders = buildSecurityHeaders();
    expect(secHeaders["Strict-Transport-Security"]).toContain("max-age=63072000");
    expect(secHeaders["Content-Security-Policy"]).toContain("default-src 'self'");
    expect(secHeaders["X-Content-Type-Options"]).toBe("nosniff");
    expect(secHeaders["X-Frame-Options"]).toBe("DENY");
    expect(secHeaders["Referrer-Policy"]).toBe("strict-origin-when-cross-origin");
  });

  it("HU-375: Control de egress de red previene SSRF y bloquea IPs privadas y metadata AWS", () => {
    // Permite dominios autorizados de la lista blanca
    expect(validateEgressTarget("https://api.wompi.co/v1/transactions").allowed).toBe(true);
    expect(validateEgressTarget("https://vpfe.dian.gov.co/wsdl").allowed).toBe(true);

    // Bloquea localhost y loopback
    expect(validateEgressTarget("http://localhost:8080/internal").allowed).toBe(false);
    expect(validateEgressTarget("http://127.0.0.1:3000/keys").allowed).toBe(false);

    // Bloquea metadata de AWS (169.254.169.254)
    expect(validateEgressTarget("http://169.254.169.254/latest/meta-data").allowed).toBe(false);

    // Bloquea IPs privadas RFC 1918 (10.x, 192.168.x)
    expect(validateEgressTarget("http://10.0.1.5/admin").allowed).toBe(false);
    expect(validateEgressTarget("http://192.168.1.1/router").allowed).toBe(false);

    // Bloquea dominios externos no autorizados
    expect(validateEgressTarget("https://attacker-c2-server.com/exfiltrate").allowed).toBe(false);
  });

  it("rechaza cargas que exceden límites de tamaño (413 Payload Too Large)", () => {
    // 1 MB limit para /v1/sync/push
    const largePushReq: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "127.0.0.1",
      headers: {},
      rawBodySizeBytes: 1024 * 1024 + 1
    };
    const pushRes = checkPayloadSizeLimit(largePushReq, {});
    expect(pushRes?.status).toBe(413);

    // 10 MB limit para /v1/app/products/import
    const largeImportReq: HttpRequest = {
      method: "POST",
      path: "/v1/app/products/import",
      ip: "127.0.0.1",
      headers: {},
      rawBodySizeBytes: 10 * 1024 * 1024 + 100
    };
    const importRes = checkPayloadSizeLimit(largeImportReq, {});
    expect(importRes?.status).toBe(413);

    // Carga válida dentro de los límites
    const validReq: HttpRequest = {
      method: "POST",
      path: "/v1/sync/push",
      ip: "127.0.0.1",
      headers: {},
      rawBodySizeBytes: 500 * 1024
    };
    expect(checkPayloadSizeLimit(validReq, {})).toBeNull();
  });

  it("verifica permisos correctamente y arroja 403 ante permisos faltantes", () => {
    const ownerClaims: JwtClaims = {
      sub: "u1",
      tid: "t1",
      roles: ["OWNER"],
      perms: [],
      aud: "mgmt-app",
      actor_kind: "USER"
    };
    // OWNER tiene bypass
    expect(() => requirePermission(ownerClaims, "anything")).not.toThrow();

    const cashierClaims: JwtClaims = {
      sub: "u2",
      tid: "t1",
      roles: ["CASHIER"],
      perms: ["sale.create", "catalog.read"],
      aud: "pos-device",
      actor_kind: "USER"
    };
    expect(() => requirePermission(cashierClaims, "sale.create")).not.toThrow();
    expect(() => requirePermission(cashierClaims, "terminal.manage")).toThrow(
      "403 FORBIDDEN_PERMISSION:terminal.manage"
    );
  });

  it("exige Step-up MFA reciente (menor a 300s)", () => {
    const nowMs = 1000000;
    const nowSec = Math.floor(nowMs / 1000);

    const freshMfaClaims: JwtClaims = {
      sub: "u1",
      tid: "t1",
      roles: ["OWNER"],
      perms: [],
      aud: "mgmt-app",
      amr: ["pwd", "mfa"],
      mfa_authenticated_at: nowSec - 60, // Hace 60 segundos
      actor_kind: "USER"
    };
    expect(() => requireStepUpMfa(freshMfaClaims, 300, nowMs)).not.toThrow();

    const staleMfaClaims: JwtClaims = {
      sub: "u1",
      tid: "t1",
      roles: ["OWNER"],
      perms: [],
      aud: "mgmt-app",
      amr: ["pwd", "mfa"],
      mfa_authenticated_at: nowSec - 400, // Hace 400 segundos (> 300s)
      actor_kind: "USER"
    };
    expect(() => requireStepUpMfa(staleMfaClaims, 300, nowMs)).toThrow();
  });

  it("resuelve permisos por rol de usuario", () => {
    const ownerUser: CloudUserRecord = {
      id: "u1",
      tenant_id: "t1",
      branch_id: null,
      email: "owner@tienda.com",
      phone: null,
      full_name: "Dueño",
      role_code: "OWNER",
      status: "ACTIVE",
      mfa_enabled: true,
      password_hash: "hash",
      pin_hash: "pin",
      must_change_pin: false,
      backup_recovery_codes_hashes: [],
      known_devices: []
    };
    const perms = resolvePermissions(ownerUser);
    expect(perms).toContain("terminal.manage");
    expect(perms).toContain("catalog.manage");
    expect(perms).toContain("customer.credit_manage");

    const accountantUser: CloudUserRecord = {
      ...ownerUser,
      role_code: "ACCOUNTANT"
    };
    const accountantPerms = resolvePermissions(accountantUser);
    expect(accountantPerms).toEqual(["reports.read"]);
  });
});
