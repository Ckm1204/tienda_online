import { isWeakPin } from "@tiendita/contracts";
import type { JwtClaims, TokenAudience } from "@tiendita/service-kit";
import { hashSecretArgon2idUniqueSalt, type IdentityService } from "@tiendita/identity-service";
import type { DeviceService, TerminalRecord } from "@tiendita/device-service";
import type { HttpRequest, HttpResponse } from "../types.js";
import { resolvePermissions } from "../middlewares/gateway-security.js";

export class AuthController {
  constructor(
    private readonly identityService: IdentityService,
    private readonly deviceService: DeviceService
  ) {}

  async login(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const { email, password, mfaCode } = (req.body as any) || {};
    const user = [...this.identityService.users.values()].find((u) => u.email === email);
    if (!user) {
      return {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_CREDENTIALS" }
      };
    }
    if (user.status !== "ACTIVE") {
      return {
        status: 403,
        headers: { "Content-Type": "application/json" },
        body: { error: "USER_INACTIVE" }
      };
    }

    // Si requiere MFA y no se proporcionó
    if (user.mfa_enabled && !mfaCode) {
      return {
        status: 401,
        headers: { "Content-Type": "application/json" },
        body: { error: "MFA_REQUIRED", challenge: "totp" }
      };
    }

    const tokenAudience: TokenAudience = "mgmt-app";
    const amr = user.mfa_enabled ? ["pwd", "mfa"] : ["pwd"];
    const permissions = resolvePermissions(user);

    const issuedClaims: JwtClaims = {
      sub: user.id,
      tid: user.tenant_id,
      bid: user.branch_id,
      roles: [user.role_code],
      perms: permissions,
      aud: tokenAudience,
      amr,
      mfa_authenticated_at: user.mfa_enabled ? Math.floor(nowMs / 1000) : undefined,
      actor_kind: "USER"
    };

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        accessToken: `token_${user.id}_${nowMs}`,
        claims: issuedClaims,
        expiresIn: 3600
      }
    };
  }

  async activate(req: HttpRequest, nowMs: number): Promise<HttpResponse> {
    const { activationToken, password, totpCode, pin, acceptTerms } = (req.body as any) || {};
    if (!acceptTerms) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "MUST_ACCEPT_TERMS" }
      };
    }
    if (isWeakPin(pin)) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "WEAK_PIN" }
      };
    }
    const tokenEntry = this.identityService.activationTokens.get(activationToken);
    if (!tokenEntry || tokenEntry.used || nowMs > tokenEntry.expires_at_ms) {
      return {
        status: 400,
        headers: { "Content-Type": "application/json" },
        body: { error: "INVALID_ACTIVATION_TOKEN" }
      };
    }

    const user = this.identityService.users.get(tokenEntry.user_id);
    if (!user) {
      return {
        status: 404,
        headers: { "Content-Type": "application/json" },
        body: { error: "USER_NOT_FOUND" }
      };
    }

    user.password_hash = hashSecretArgon2idUniqueSalt(password);
    user.pin_hash = hashSecretArgon2idUniqueSalt(pin);
    user.mfa_enabled = true;
    user.status = "ACTIVE";
    tokenEntry.used = true;

    // Obtener o crear CAJA-01 para mostrar descarga y QR
    let term1: TerminalRecord | undefined;
    if (user.tenant_id) {
      term1 = [...this.deviceService.terminals.values()].find(
        (t) => t.tenant_id === user.tenant_id && t.code === "CAJA-01"
      );
    }

    return {
      status: 200,
      headers: { "Content-Type": "application/json" },
      body: {
        activated: true,
        downloadUrl: "https://dl.tienditaonline.co/installers/TienditaOnline-Setup-x64.exe",
        terminalCode: term1?.code ?? "CAJA-01",
        terminalEnrollmentQr: `tiendita://enroll?tenant=${user.tenant_id}&terminal=${term1?.id ?? "term-01"}`
      }
    };
  }
}
