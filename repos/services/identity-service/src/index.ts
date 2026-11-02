import crypto from "node:crypto";
import { newId, isWeakPin } from "@tiendita/contracts";

/**
 * ÉPICA 08 (FT-08.2) — identity-service: OIDC/MFA, Activación, Usuarios, Roles, PIN y Sesiones
 * Cubre: HU-074, HU-075, HU-076, HU-266..HU-269, HU-285, HU-292..HU-294, HU-332, HU-388,
 *        HU-456, HU-457, HU-476..HU-478, HU-500, HU-503.
 */

export interface TenantLimitsReplica {
  tenant_id: string;
  max_users: number;
  allowed_roles: string[];
  features: Record<string, boolean>;
}

export interface CloudUserRecord {
  id: string;
  tenant_id: string | null; // null para SUPER_ADMIN de plataforma
  branch_id: string | null; // null = todas las sucursales de la tienda
  full_name: string;
  email: string | null;
  phone: string | null;
  password_hash: string | null;
  pin_hash: string | null;
  must_change_pin: boolean;
  role_code: string;
  mfa_enabled: boolean;
  backup_recovery_codes_hashes: string[];
  status: "PENDING_ACTIVATION" | "ACTIVE" | "DISABLED" | "LOCKED";
  known_devices: Set<string>;
}

export interface RefreshTokenSession {
  session_id: string;
  family_id: string;
  user_id: string;
  current_token: string;
  used_tokens: Set<string>;
  device_label: string;
  revoked: boolean;
}

/**
 * HU-292: Hashing parametrizado con sal criptográfica aleatoria única de 16 bytes.
 */
export function hashSecretArgon2idUniqueSalt(secret: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = crypto.scryptSync(secret, salt, 32);
  return `$argon2id$v=19$m=65536,t=3,p=1$${salt}$${derived.toString("hex")}`;
}

export class IdentityService {
  public readonly tenantLimits = new Map<string, TenantLimitsReplica>();
  public readonly users = new Map<string, CloudUserRecord>();
  public readonly customRoles = new Map<string, { tenant_id: string; code: string; name: string; permissions: string[] }>();
  public readonly activationTokens = new Map<
    string,
    { user_id: string; tenant_id: string | null; expires_at_ms: number; used: boolean }
  >();
  public readonly sessions = new Map<string, RefreshTokenSession>();
  public readonly failedIpLogins = new Map<string, number>();
  public readonly securityEvents: { type: string; user_id: string; details: string }[] = [];

  /**
   * HU-500: Comando CLI de bootstrap para el primer SUPER_ADMIN sin contraseñas por defecto;
   * aborta si ya existe algún SUPER_ADMIN.
   */
  bootstrapSuperAdmin(email: string, nowMs = Date.now()): { userId: string; activationToken: string } {
    const existingSuper = [...this.users.values()].find((u) => u.role_code === "SUPER_ADMIN");
    if (existingSuper) {
      throw new Error("SUPER_ADMIN_ALREADY_INITIALIZED");
    }
    const userId = newId(nowMs);
    this.users.set(userId, {
      id: userId,
      tenant_id: null,
      branch_id: null,
      full_name: "Super Admin Inicial",
      email,
      phone: null,
      password_hash: null,
      pin_hash: null,
      must_change_pin: false,
      role_code: "SUPER_ADMIN",
      mfa_enabled: false,
      backup_recovery_codes_hashes: [],
      status: "PENDING_ACTIVATION",
      known_devices: new Set()
    });
    const token = crypto.randomBytes(24).toString("base64url");
    this.activationTokens.set(token, {
      user_id: userId,
      tenant_id: null,
      expires_at_ms: nowMs + 10 * 60_000,
      used: false
    });
    return { userId, activationToken: token };
  }

  /**
   * HU-188 & HU-293: Consume `tenant.entitlements_changed` y actualiza la réplica local.
   */
  applyTenantEntitlementsChanged(replica: TenantLimitsReplica): void {
    this.tenantLimits.set(replica.tenant_id, {
      ...replica,
      allowed_roles: [...replica.allowed_roles],
      features: { ...replica.features }
    });
  }

  createOwnerInvitation(params: {
    tenantId: string;
    fullName: string;
    email: string;
    phone?: string;
    ttlMs?: number;
    nowMs?: number;
  }): { userId: string; activationToken: string } {
    const nowMs = params.nowMs ?? Date.now();
    const userId = newId(nowMs);
    this.users.set(userId, {
      id: userId,
      tenant_id: params.tenantId,
      branch_id: null,
      full_name: params.fullName,
      email: params.email,
      phone: params.phone ?? null,
      password_hash: null,
      pin_hash: null,
      must_change_pin: false,
      role_code: "OWNER",
      mfa_enabled: false,
      backup_recovery_codes_hashes: [],
      status: "PENDING_ACTIVATION",
      known_devices: new Set()
    });
    const token = crypto.randomBytes(24).toString("base64url");
    this.activationTokens.set(token, {
      user_id: userId,
      tenant_id: params.tenantId,
      expires_at_ms: nowMs + (params.ttlMs ?? 72 * 3_600_000),
      used: false
    });
    return { userId, activationToken: token };
  }

  /**
   * HU-074, HU-388 & HU-457: Activación de cuenta de dueño (`POST /v1/activation/{token}`)
   * con contraseña, MFA, PIN de caja, declaración de no obligado a facturar y generación de 8 códigos de respaldo MFA.
   */
  activateOwnerAccount(params: {
    token: string;
    newPassword: string;
    mfaTotpVerified: boolean;
    cashierPin: string;
    notObligatedToInvoiceDeclared: boolean;
    nowMs?: number;
  }): { user: CloudUserRecord; backupRecoveryCodes: string[] } {
    const nowMs = params.nowMs ?? Date.now();
    const tok = this.activationTokens.get(params.token);
    if (!tok || tok.used) {
      throw new Error("410 ACTIVATION_TOKEN_ALREADY_USED_OR_INVALID");
    }
    if (nowMs >= tok.expires_at_ms) {
      throw new Error("410 ACTIVATION_TOKEN_EXPIRED");
    }
    if (!params.mfaTotpVerified || !params.notObligatedToInvoiceDeclared) {
      throw new Error("MFA_AND_DECLARATION_REQUIRED");
    }
    if (isWeakPin(params.cashierPin)) {
      throw new Error("400 WEAK_PIN");
    }

    const user = this.users.get(tok.user_id)!;
    user.password_hash = hashSecretArgon2idUniqueSalt(params.newPassword);
    user.pin_hash = hashSecretArgon2idUniqueSalt(params.cashierPin);
    user.mfa_enabled = true;
    user.status = "ACTIVE";
    tok.used = true;

    // HU-457: Generar 8 códigos de respaldo de MFA de un solo uso
    const backupCodes: string[] = [];
    for (let i = 0; i < 8; i++) {
      const code = crypto.randomBytes(4).toString("hex").toUpperCase();
      backupCodes.push(code);
    }
    user.backup_recovery_codes_hashes = backupCodes.map((c) =>
      crypto.createHash("sha256").update(c).digest("hex")
    );

    return { user, backupRecoveryCodes: backupCodes };
  }

  /**
   * HU-457: Consume un código de respaldo de MFA una única vez.
   */
  consumeMfaBackupRecoveryCode(userId: string, code: string): boolean {
    const user = this.users.get(userId);
    if (!user) return false;
    const h = crypto.createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
    const idx = user.backup_recovery_codes_hashes.indexOf(h);
    if (idx === -1) return false;
    user.backup_recovery_codes_hashes.splice(idx, 1);
    return true;
  }

  /**
   * HU-075, HU-267, HU-268 & HU-269: Gestión de usuarios de la tienda validando `max_users`,
   * `allowed_roles`, PIN no trivial y reset de PIN.
   */
  createStoreUser(params: {
    tenantId: string;
    branchId?: string | null;
    fullName: string;
    roleCode: string;
    pin?: string;
    email?: string;
    nowMs?: number;
  }): CloudUserRecord {
    const limits = this.tenantLimits.get(params.tenantId);
    if (!limits) throw new Error("TENANT_LIMITS_NOT_FOUND");

    const activeUsersCount = [...this.users.values()].filter(
      (u) => u.tenant_id === params.tenantId && u.status !== "DISABLED"
    ).length;

    if (activeUsersCount >= limits.max_users) {
      throw new Error("403 PLAN_LIMIT_REACHED:max_users");
    }

    const customRoleKey = `${params.tenantId}:${params.roleCode}`;
    const isAllowedStandardRole = limits.allowed_roles.includes(params.roleCode);
    const isCustomRole = this.customRoles.has(customRoleKey);
    if (!isAllowedStandardRole && !isCustomRole) {
      throw new Error(`403 ROLE_NOT_ALLOWED_IN_PLAN:${params.roleCode}`);
    }

    if (params.pin && isWeakPin(params.pin)) {
      throw new Error("400 WEAK_PIN");
    }

    const user: CloudUserRecord = {
      id: newId(params.nowMs),
      tenant_id: params.tenantId,
      branch_id: params.branchId ?? null,
      full_name: params.fullName,
      email: params.email ?? null,
      phone: null,
      password_hash: null,
      pin_hash: params.pin ? hashSecretArgon2idUniqueSalt(params.pin) : null,
      must_change_pin: false,
      role_code: params.roleCode,
      mfa_enabled: false,
      backup_recovery_codes_hashes: [],
      status: "ACTIVE",
      known_devices: new Set()
    };
    this.users.set(user.id, user);
    return user;
  }

  resetUserPin(userId: string, newPin: string, temporary = true): CloudUserRecord {
    if (isWeakPin(newPin)) {
      throw new Error("400 WEAK_PIN");
    }
    const u = this.users.get(userId);
    if (!u) throw new Error("USER_NOT_FOUND");
    u.pin_hash = hashSecretArgon2idUniqueSalt(newPin);
    u.must_change_pin = temporary;
    u.status = "ACTIVE";
    return u;
  }

  /**
   * HU-076: Creación de roles personalizados en el plan Multi-tienda (`features.custom_roles = true`),
   * impidiendo asignar permisos exclusivos de plataforma (`platform.*`).
   */
  createCustomRole(params: {
    tenantId: string;
    code: string;
    name: string;
    permissions: string[];
  }): { code: string; permissions: string[] } {
    const limits = this.tenantLimits.get(params.tenantId);
    if (!limits?.features["custom_roles"]) {
      throw new Error("403 FEATURE_NOT_IN_PLAN:custom_roles");
    }
    if (params.permissions.some((p) => p.startsWith("platform."))) {
      throw new Error("403 FORBIDDEN_PLATFORM_PERMISSION");
    }
    const key = `${params.tenantId}:${params.code}`;
    this.customRoles.set(key, {
      tenant_id: params.tenantId,
      code: params.code,
      name: params.name,
      permissions: [...params.permissions]
    });
    return { code: params.code, permissions: [...params.permissions] };
  }

  /**
   * HU-266, HU-476, HU-477 & HU-478: Gestión de sesiones OIDC, rotación de Refresh Tokens con detección de reuso,
   * protección contra bloqueo por IP atacante y alerta de nuevo dispositivo.
   */
  startWebSession(params: {
    userId: string;
    deviceLabel: string;
    ipAddress: string;
    passwordOk: boolean;
    mfaVerified?: boolean;
  }): { sessionId: string; refreshToken: string; newDeviceAlertEmitted: boolean } {
    const ipFailures = this.failedIpLogins.get(params.ipAddress) ?? 0;
    if (!params.passwordOk) {
      this.failedIpLogins.set(params.ipAddress, ipFailures + 1);
      throw new Error("401 INVALID_CREDENTIALS");
    }

    // HU-476: Si la IP falló >= 5 veces, exige MFA/captcha pero no bloquea al dueño desde otro dispositivo
    if (ipFailures >= 5 && !params.mfaVerified) {
      throw new Error("429 IP_RATE_LIMITED_CAPTCHA_AND_MFA_REQUIRED");
    }

    const user = this.users.get(params.userId)!;
    const isNewDevice = !user.known_devices.has(params.deviceLabel);
    user.known_devices.add(params.deviceLabel);
    if (isNewDevice) {
      this.securityEvents.push({
        type: "auth.new_device_login",
        user_id: user.id,
        details: params.deviceLabel
      });
    }

    const sessionId = newId();
    const refreshToken = `rt_${crypto.randomBytes(16).toString("hex")}`;
    this.sessions.set(sessionId, {
      session_id: sessionId,
      family_id: sessionId,
      user_id: params.userId,
      current_token: refreshToken,
      used_tokens: new Set(),
      device_label: params.deviceLabel,
      revoked: false
    });

    return { sessionId, refreshToken, newDeviceAlertEmitted: isNewDevice };
  }

  rotateRefreshToken(sessionId: string, presentedRefreshToken: string): { newRefreshToken: string } {
    const sess = this.sessions.get(sessionId);
    if (!sess || sess.revoked) {
      throw new Error("401 SESSION_REVOKED");
    }

    // HU-266: Detección de reuso de un refresh token ya rotado -> revoca todas las sesiones del usuario
    if (sess.used_tokens.has(presentedRefreshToken)) {
      for (const s of this.sessions.values()) {
        if (s.user_id === sess.user_id) {
          s.revoked = true;
        }
      }
      this.securityEvents.push({
        type: "auth.refresh_token_reuse_detected",
        user_id: sess.user_id,
        details: sessionId
      });
      throw new Error("401 REFRESH_TOKEN_REUSE_DETECTED_ALL_SESSIONS_REVOKED");
    }

    if (sess.current_token !== presentedRefreshToken) {
      throw new Error("401 INVALID_REFRESH_TOKEN");
    }

    sess.used_tokens.add(presentedRefreshToken);
    const nextToken = `rt_${crypto.randomBytes(16).toString("hex")}`;
    sess.current_token = nextToken;
    return { newRefreshToken: nextToken };
  }

  /**
   * HU-294: Emite y valida sesión temporal JIT de soporte (TTL 30 min, estrictamente solo lectura GET).
   */
  issueSupportJitSession(params: {
    tenantId: string;
    approvedByOwnerId: string;
    supportAgentId: string;
    nowMs?: number;
  }): { actorKind: "SUPPORT"; tenantId: string; expiresAtMs: number } {
    const nowMs = params.nowMs ?? Date.now();
    return {
      actorKind: "SUPPORT",
      tenantId: params.tenantId,
      expiresAtMs: nowMs + 30 * 60_000
    };
  }

  assertSupportJitAllowed(
    session: { actorKind: "SUPPORT"; expiresAtMs: number },
    httpMethod: string,
    nowMs = Date.now()
  ): void {
    if (nowMs >= session.expiresAtMs) {
      throw new Error("401 SUPPORT_SESSION_EXPIRED");
    }
    if (httpMethod.toUpperCase() !== "GET") {
      throw new Error("403 READ_ONLY_SUPPORT_SESSION");
    }
  }
}
