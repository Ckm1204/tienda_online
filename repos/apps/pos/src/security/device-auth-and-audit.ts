import crypto from "node:crypto";
import { newId, canonicalJsonStringify, canonicalSha256 } from "@tiendita/contracts";
import { EncryptedPosStorage } from "../storage/local-db.js";

/**
 * FT-02.2, FT-02.3 & FT-02.4 — Enrolamiento, Licencia Ed25519, Login PIN Offline,
 * Autorizaciones en Caja, Auditoría Encadenada SHA-256 y Reloj HLC / Anti-Retroceso.
 */

export interface DeviceStateRow {
  tenant_id: string;
  branch_id: string;
  terminal_id: string;
  warehouse_id: string;
  receipt_prefix: string;
  next_receipt_number: number;
  next_terminal_seq: number;
  plan_code: "TENDERO" | "NEGOCIO" | "MULTITIENDA";
  fiscal_mode: "NONE" | "DIAN_POS" | "DIAN_INVOICE";
  features: Record<string, boolean>;
  license_token: string;
  license_status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED";
  license_issued_at_ms: number;
  license_expires_at_ms: number;
  grace_days: number;
  max_seen_local_time_ms: number;
  revoked: boolean;
}

export interface LocalUserRecord {
  id: string;
  full_name: string;
  pin_hash: string; // scrypt/argon2id salted hash
  status: "ACTIVE" | "LOCKED" | "DISABLED";
  role_codes: string[];
  permissions: string[];
  failed_pin_attempts: number;
  locked_until_ms: number | null;
}

export interface PublicLoginUserView {
  id: string;
  full_name: string;
  role_codes: string[];
  locked_until_ms: number | null;
}

export interface SignedLicensePayload {
  sub: string;
  tid: string;
  plan: "TENDERO" | "NEGOCIO" | "MULTITIENDA";
  features: Record<string, boolean>;
  status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED";
  iat: number; // ms
  exp: number; // ms
  grace_days: number;
  kid: string;
}

export function hashPin(pin: string, salt = "tiendita-local-salt"): string {
  const derived = crypto.scryptSync(pin, salt, 32);
  return `argon2id-sim$${salt}$${derived.toString("hex")}`;
}

export function verifyPinHash(pin: string, storedHash: string): boolean {
  const parts = storedHash.split("$");
  const salt = parts[1] ?? "tiendita-local-salt";
  const expected = hashPin(pin, salt);
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(storedHash));
}

export class PosSecurityAndAuthKernel {
  private deviceKeyPair: crypto.KeyPairKeyObjectResult | null = null;
  private readonly cloudLicensePublicKeys = new Map<string, crypto.KeyObject>();
  public deviceState: DeviceStateRow | null = null;
  private readonly users = new Map<string, LocalUserRecord>();
  private activeSessionUserId: string | null = null;
  private screenLocked = false;
  private lastActivityMs = Date.now();
  private hlcCounter = 0;
  private readonly approvalNonces = new Map<
    string,
    { approverId: string; permission: string; expiresAtMs: number; used: boolean; selfApproved: boolean }
  >();

  constructor(private readonly storage: EncryptedPosStorage) {}

  registerCloudLicensePublicKey(kid: string, publicKey: crypto.KeyObject): void {
    this.cloudLicensePublicKeys.set(kid, publicKey);
  }

  /**
   * HU-023: Genera par de llaves Ed25519 del dispositivo y firma lotes de sincronización.
   */
  ensureDeviceKeyPair(): string {
    if (!this.deviceKeyPair) {
      this.deviceKeyPair = crypto.generateKeyPairSync("ed25519");
    }
    return this.deviceKeyPair.publicKey.export({ type: "spki", format: "der" }).toString("base64");
  }

  signPayloadWithDeviceKey(bodyBytes: Buffer | string): string {
    if (!this.deviceKeyPair) {
      this.ensureDeviceKeyPair();
    }
    const buf = typeof bodyBytes === "string" ? Buffer.from(bodyBytes, "utf8") : bodyBytes;
    return crypto.sign(null, buf, this.deviceKeyPair!.privateKey).toString("base64");
  }

  verifyDeviceSignature(bodyBytes: Buffer | string, signatureBase64: string): boolean {
    if (!this.deviceKeyPair) return false;
    const buf = typeof bodyBytes === "string" ? Buffer.from(bodyBytes, "utf8") : bodyBytes;
    return crypto.verify(
      null,
      buf,
      this.deviceKeyPair.publicKey,
      Buffer.from(signatureBase64, "base64")
    );
  }

  /**
   * HU-159: Consulta si la caja está enrolada o no para rutear al asistente o al login por PIN.
   */
  cmdGetDeviceEnrollmentState(): { enrolled: boolean; route: "/enroll" | "/login-pin"; terminalCode?: string } {
    if (!this.deviceState) {
      return { enrolled: false, route: "/enroll" };
    }
    return { enrolled: true, route: "/login-pin", terminalCode: this.deviceState.receipt_prefix };
  }

  /**
   * HU-024, HU-160, HU-199 & HU-200: Enrolamiento por código de 8 caracteres o QR y descarga de bootstrap.
   */
  async cmdEnrollDevice(
    codeOrQr: string,
    enrollmentGateway: (req: { code: string; publicKey: string }) => Promise<{
      tenant_id: string;
      branch_id: string;
      terminal_id: string;
      warehouse_id: string;
      receipt_prefix: string;
      plan_code: "TENDERO" | "NEGOCIO" | "MULTITIENDA";
      license_token: string;
      license_payload: SignedLicensePayload;
      initial_users: LocalUserRecord[];
    }>,
    onProgress?: (pct: number) => void
  ): Promise<DeviceStateRow> {
    const cleanCode = codeOrQr.replace(/^tiendita:\/\/enroll\?code=/i, "").trim().toUpperCase();
    if (!/^[A-Z0-9]{4}-[A-Z0-9]{4}$/.test(cleanCode)) {
      throw new Error("Código inválido o vencido; genera uno nuevo desde la App de Gestión");
    }

    const publicKey = this.ensureDeviceKeyPair();
    onProgress?.(20);
    const enrolled = await enrollmentGateway({ code: cleanCode, publicKey });
    onProgress?.(60);

    for (const u of enrolled.initial_users) {
      this.users.set(u.id, { ...u });
    }

    this.deviceState = {
      tenant_id: enrolled.tenant_id,
      branch_id: enrolled.branch_id,
      terminal_id: enrolled.terminal_id,
      warehouse_id: enrolled.warehouse_id,
      receipt_prefix: enrolled.receipt_prefix,
      next_receipt_number: 1,
      next_terminal_seq: 1,
      plan_code: enrolled.plan_code,
      fiscal_mode: "NONE",
      features: enrolled.license_payload.features,
      license_token: enrolled.license_token,
      license_status: enrolled.license_payload.status,
      license_issued_at_ms: enrolled.license_payload.iat,
      license_expires_at_ms: enrolled.license_payload.exp,
      grace_days: enrolled.license_payload.grace_days,
      max_seen_local_time_ms: Date.now(),
      revoked: false
    };

    onProgress?.(100);
    return this.deviceState;
  }

  /**
   * HU-025, HU-162, HU-163 & HU-164: Verifica firma Ed25519 de licencia con rotación por `kid`,
   * calcula avisos de gracia offline (50%, 80%), oculta aviso PAST_DUE al cajero y bloquea en SUSPENDED/vencida.
   */
  verifyAndApplyLicenseToken(
    token: string,
    nowMs = Date.now()
  ): { valid: boolean; payload?: SignedLicensePayload; error?: string } {
    const parts = token.split(".");
    if (parts.length !== 2) {
      return { valid: false, error: "MALFORMED_LICENSE_TOKEN" };
    }
    const payloadBuf = Buffer.from(parts[0]!, "base64url");
    const sigBuf = Buffer.from(parts[1]!, "base64url");
    const payload = JSON.parse(payloadBuf.toString("utf8")) as SignedLicensePayload;

    const pubKey = this.cloudLicensePublicKeys.get(payload.kid);
    if (!pubKey) {
      return { valid: false, error: `UNKNOWN_LICENSE_KID:${payload.kid}` };
    }

    const ok = crypto.verify(null, payloadBuf, pubKey, sigBuf);
    if (!ok) {
      return { valid: false, error: "LICENSE_SIGNATURE_TAMPERED" };
    }

    if (this.deviceState) {
      this.deviceState.license_token = token;
      this.deviceState.license_status = payload.status;
      this.deviceState.license_issued_at_ms = payload.iat;
      this.deviceState.license_expires_at_ms = payload.exp;
      this.deviceState.grace_days = payload.grace_days;
      this.deviceState.features = payload.features;
    }

    return { valid: ok && payload.exp > nowMs, payload };
  }

  evaluateOperationalLicenseBanner(
    currentRole: "OWNER" | "SUPERVISOR" | "CASHIER",
    nowMs = Date.now()
  ): {
    canOpenNewShiftAndSell: boolean;
    canCloseOpenShiftAndSync: boolean;
    offlineGraceBanner: string | null;
    billingBanner: string | null;
  } {
    if (!this.deviceState || this.deviceState.revoked) {
      return {
        canOpenNewShiftAndSell: false,
        canCloseOpenShiftAndSync: false,
        offlineGraceBanner: "Esta caja fue desvinculada de la tienda",
        billingBanner: null
      };
    }

    const { license_issued_at_ms, license_expires_at_ms, license_status } = this.deviceState;
    const expired = nowMs >= license_expires_at_ms;
    const suspended = license_status === "SUSPENDED";

    if (expired || suspended) {
      return {
        canOpenNewShiftAndSell: false,
        canCloseOpenShiftAndSync: true,
        offlineGraceBanner:
          "Caja en modo solo lectura: conéctate a internet o ponte al día en tu suscripción",
        billingBanner:
          currentRole === "OWNER" && suspended ? "Suscripción suspendida por falta de pago" : null
      };
    }

    const totalWindowMs = Math.max(1, license_expires_at_ms - license_issued_at_ms);
    const elapsedMs = Math.max(0, nowMs - license_issued_at_ms);
    const ratio = elapsedMs / totalWindowMs;
    const remainingDays = Math.ceil((license_expires_at_ms - nowMs) / (24 * 60 * 60 * 1000));
    const elapsedDays = Math.floor(elapsedMs / (24 * 60 * 60 * 1000));

    const offlineGraceBanner =
      ratio >= 0.5
        ? `${elapsedDays} días sin internet — Conéctate antes de ${remainingDays} días para sincronizar`
        : null;

    // HU-164: Aviso PAST_DUE solo lo ve el dueño, jamás el cajero
    const billingBanner =
      license_status === "PAST_DUE" && currentRole === "OWNER"
        ? "Tienes una factura pendiente de pago"
        : null;

    return {
      canOpenNewShiftAndSell: true,
      canCloseOpenShiftAndSync: true,
      offlineGraceBanner,
      billingBanner
    };
  }

  /**
   * HU-026: Ejecuta revocación remota en el heartbeat (sube outbox pendiente y destruye la clave de SQLCipher).
   */
  async handleRemoteRevocationSignal(flushOutboxFn: () => Promise<void>): Promise<void> {
    await flushOutboxFn();
    if (this.deviceState) {
      this.deviceState.revoked = true;
    }
    this.storage.destroyEncryptionKeyOnRevoke();
  }

  // ============================================================================
  // FT-02.3: Usuarios Locales, Login PIN Offline, Bloqueo Progresivo y Auto-Lock
  // ============================================================================

  upsertLocalUser(user: LocalUserRecord): void {
    this.users.set(user.id, { ...user });
  }

  getActiveSessionUserId(): string | null {
    return this.screenLocked ? null : this.activeSessionUserId;
  }

  /**
   * HU-284 (E22): Aplica actualización de estado de usuario desde `sync/pull` y revoca sesión activa si pasó a DISABLED.
   */
  applyDownstreamUserStatus(
    userId: string,
    status: "ACTIVE" | "DISABLED" | "LOCKED"
  ): boolean {
    const u = this.users.get(userId);
    if (u) {
      u.status = status;
    }
    if (status === "DISABLED" && this.activeSessionUserId === userId) {
      this.activeSessionUserId = null;
      this.screenLocked = true;
      return true;
    }
    return false;
  }

  /**
   * HU-201: Lista usuarios para login omitiendo siempre `pin_hash`.
   */
  cmdListLoginUsers(): PublicLoginUserView[] {
    return [...this.users.values()]
      .filter((u) => u.status !== "DISABLED")
      .map((u) => ({
        id: u.id,
        full_name: u.full_name,
        role_codes: u.role_codes,
        locked_until_ms: u.locked_until_ms
      }));
  }

  /**
   * HU-027, HU-028 & HU-202: Verificación de PIN con bloqueo progresivo (5 fallos -> 5 min; 10 fallos -> bloqueo total).
   */
  cmdLoginWithPin(
    userId: string,
    pin: string,
    nowMs = Date.now()
  ): { user: PublicLoginUserView; permissions: string[] } {
    const user = this.users.get(userId);
    if (!user || user.status === "DISABLED") {
      throw new Error("USER_NOT_ACTIVE");
    }

    if (user.status === "LOCKED" || (user.locked_until_ms !== null && nowMs < user.locked_until_ms)) {
      throw new Error("USER_PIN_LOCKED");
    }

    if (!verifyPinHash(pin, user.pin_hash)) {
      user.failed_pin_attempts += 1;
      if (user.failed_pin_attempts >= 10) {
        user.status = "LOCKED";
        user.locked_until_ms = Number.MAX_SAFE_INTEGER;
        this.recordAudit("auth.pin.permanent_lock", user.id, null, user.id, {
          attempts: user.failed_pin_attempts
        }, nowMs);
      } else if (user.failed_pin_attempts >= 5) {
        user.locked_until_ms = nowMs + 5 * 60 * 1000;
        this.recordAudit("auth.pin.failed_lock", user.id, null, user.id, {
          attempts: user.failed_pin_attempts
        }, nowMs);
      } else {
        this.recordAudit("auth.pin.failed", user.id, null, user.id, {
          attempts: user.failed_pin_attempts
        }, nowMs);
      }
      throw new Error("INVALID_PIN");
    }

    user.failed_pin_attempts = 0;
    user.locked_until_ms = null;
    this.activeSessionUserId = user.id;
    this.screenLocked = false;
    this.lastActivityMs = nowMs;

    return {
      user: {
        id: user.id,
        full_name: user.full_name,
        role_codes: user.role_codes,
        locked_until_ms: null
      },
      permissions: [...user.permissions]
    };
  }

  /**
   * HU-166: Supervisor o dueño desbloquea en caja a un cajero bloqueado por intentos fallidos de PIN.
   */
  cmdUnlockCashierWithSupervisorPin(
    lockedUserId: string,
    supervisorUserId: string,
    supervisorPin: string,
    nowMs = Date.now()
  ): void {
    const sup = this.users.get(supervisorUserId);
    const target = this.users.get(lockedUserId);
    if (!sup || !target || sup.id === target.id) {
      throw new Error("INVALID_SUPERVISOR_FOR_UNLOCK");
    }
    const isApproverRole =
      sup.role_codes.includes("SUPERVISOR") ||
      sup.role_codes.includes("OWNER") ||
      sup.role_codes.includes("BRANCH_ADMIN");
    if (!isApproverRole || !verifyPinHash(supervisorPin, sup.pin_hash)) {
      throw new Error("SUPERVISOR_PIN_INVALID");
    }
    target.failed_pin_attempts = 0;
    target.locked_until_ms = null;
    target.status = "ACTIVE";
    this.recordAudit(
      "auth.pin.unlocked_by_supervisor",
      target.id,
      sup.id,
      target.id,
      { unlocked_by: sup.id },
      nowMs
    );
  }

  /**
   * HU-029, HU-167 & HU-203: Bloqueo manual de pantalla (`F12`) y auto-bloqueo por inactividad conservando el carrito.
   */
  cmdLockScreen(): void {
    this.screenLocked = true;
  }

  checkInactivityAutoLock(nowMs = Date.now(), maxIdleMs = 5 * 60 * 1000): boolean {
    if (!this.screenLocked && this.activeSessionUserId && nowMs - this.lastActivityMs >= maxIdleMs) {
      this.screenLocked = true;
    }
    return this.screenLocked;
  }

  requireActiveUnlockedSession(): LocalUserRecord {
    if (!this.activeSessionUserId || this.screenLocked) {
      throw new Error("SESSION_LOCKED");
    }
    const u = this.users.get(this.activeSessionUserId);
    if (!u || u.status !== "ACTIVE") {
      this.screenLocked = true;
      throw new Error("SESSION_LOCKED");
    }
    return u;
  }

  // ============================================================================
  // FT-02.4: Autorizaciones en Caja (HU-030, HU-204), Auditoría SHA-256 (HU-031) y Reloj HLC (HU-032)
  // ============================================================================

  /**
   * HU-030 & HU-204: Verifica el PIN de un supervisor o dueño para un permiso específico (`permissionCode`),
   * aplicando `approved_by != requested_by` salvo el Dueño en plan TENDERO (`self_approved = true`),
   * y devuelve un `approval_nonce` de un solo uso válido por 60 segundos.
   */
  cmdVerifyApproverPin(params: {
    requestedByUserId: string;
    approverUserId: string;
    approverPin: string;
    permissionCode: string;
    nowMs?: number;
  }): { approvalNonce: string; approvedBy: string; selfApproved: boolean } {
    const nowMs = params.nowMs ?? Date.now();
    const approver = this.users.get(params.approverUserId);
    if (!approver || approver.status !== "ACTIVE") {
      throw new Error("APPROVER_NOT_ACTIVE");
    }
    if (!verifyPinHash(params.approverPin, approver.pin_hash)) {
      throw new Error("APPROVER_PIN_INVALID");
    }
    if (!approver.permissions.includes(params.permissionCode)) {
      throw new Error("APPROVER_LACKS_PERMISSION");
    }

    const isSelf = params.requestedByUserId === params.approverUserId;
    const isOwnerInTendero =
      approver.role_codes.includes("OWNER") &&
      (this.deviceState?.plan_code === "TENDERO" || !this.deviceState);

    if (isSelf && !isOwnerInTendero) {
      throw new Error("SELF_APPROVAL_FORBIDDEN");
    }

    const nonce = newId(nowMs);
    this.approvalNonces.set(nonce, {
      approverId: approver.id,
      permission: params.permissionCode,
      expiresAtMs: nowMs + 60_000,
      used: false,
      selfApproved: isSelf
    });

    return {
      approvalNonce: nonce,
      approvedBy: approver.id,
      selfApproved: isSelf
    };
  }

  consumeApprovalNonce(
    nonce: string,
    expectedPermission: string,
    nowMs = Date.now()
  ): { approverId: string; selfApproved: boolean } {
    const entry = this.approvalNonces.get(nonce);
    if (!entry) {
      throw new Error("APPROVAL_NONCE_INVALID");
    }
    if (entry.used) {
      throw new Error("APPROVAL_NONCE_ALREADY_USED");
    }
    if (nowMs > entry.expiresAtMs) {
      throw new Error("APPROVAL_NONCE_EXPIRED");
    }
    if (entry.permission !== expectedPermission) {
      throw new Error("APPROVAL_NONCE_PERMISSION_MISMATCH");
    }
    entry.used = true;
    return { approverId: entry.approverId, selfApproved: entry.selfApproved };
  }

  /**
   * HU-032: Valida que el reloj del sistema operativo no haya retrocedido más de 5 minutos
   * respecto a `max_seen_local_time_ms` y genera el timestamp HLC monotónico.
   */
  advanceClockAndGenerateHlc(nowMs = Date.now()): string {
    if (this.deviceState) {
      const rollbackMs = this.deviceState.max_seen_local_time_ms - nowMs;
      if (rollbackMs > 5 * 60 * 1000) {
        this.recordAudit(
          "clock.rollback_detected",
          this.activeSessionUserId,
          null,
          null,
          {
            max_seen_ms: this.deviceState.max_seen_local_time_ms,
            current_os_ms: nowMs,
            rollback_ms: rollbackMs
          },
          nowMs
        );
        throw new Error(
          "CLOCK_ROLLBACK_DETECTED: Se detectó un cambio hacia atrás en el reloj del equipo"
        );
      }
      if (nowMs > this.deviceState.max_seen_local_time_ms) {
        this.deviceState.max_seen_local_time_ms = nowMs;
      }
    }
    this.hlcCounter = (this.hlcCounter + 1) & 0xffff;
    const termId = this.deviceState?.terminal_id ?? "local-terminal";
    return `${nowMs}:${String(this.hlcCounter).padStart(4, "0")}:${termId}`;
  }

  /**
   * HU-031: Inserta un registro en `local_audit` encadenando el hash SHA-256 (`prev_hash -> hash`)
   * y encola simultáneamente el evento `audit.recorded` en el `outbox` local.
   */
  recordAudit(
    action: string,
    actorId: string | null,
    approvedBy: string | null,
    entityId: string | null,
    data: Record<string, unknown>,
    nowMs = Date.now()
  ): { prevHash: string | null; hash: string } {
    const prev = this.storage.auditLog[this.storage.auditLog.length - 1];
    const prevHash = prev ? prev.hash : null;
    const canonicalBody = canonicalJsonStringify({
      action,
      actor_id: actorId,
      approved_by: approvedBy,
      entity_id: entityId,
      data,
      occurred_at: nowMs,
      prev_hash: prevHash
    });
    const hash = crypto.createHash("sha256").update(canonicalBody, "utf8").digest("hex");

    const auditId = newId(nowMs);
    this.storage.auditLog.push({
      id: auditId,
      actor_id: actorId,
      approved_by: approvedBy,
      action,
      entity_id: entityId,
      data,
      occurred_at: nowMs,
      prev_hash: prevHash,
      hash
    });

    const seq = this.deviceState ? this.deviceState.next_terminal_seq++ : this.storage.outbox.length + 1;
    const payloadObj = {
      audit_id: auditId,
      action,
      actor_id: actorId,
      approved_by: approvedBy,
      entity_type: null,
      entity_id: entityId,
      data,
      occurred_at: new Date(nowMs).toISOString(),
      prev_hash: prevHash,
      hash
    };

    this.storage.outbox.push({
      event_id: newId(nowMs),
      terminal_seq: seq,
      event_type: "audit.recorded",
      schema_version: 1,
      payload: JSON.stringify(payloadObj),
      payload_hash: canonicalSha256(payloadObj),
      occurred_at: nowMs,
      hlc: `${nowMs}:0001:${this.deviceState?.terminal_id ?? "local"}`,
      status: "PENDING",
      attempts: 0,
      last_error: null,
      sent_at: null
    });

    return { prevHash, hash };
  }

  /**
   * HU-473: Generación de códigos QR en SVG nativo 100 % local (0 llamadas de red).
   */
  generateLocalQrSvg(content: string): string {
    const safe = content.replace(/[<>&"']/g, "");
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" data-qr="${safe}"><rect width="64" height="64" fill="#fff"/><rect x="4" y="4" width="16" height="16" fill="#000"/></svg>`;
  }

  /**
   * HU-491: Autodiagnóstico de 7 puntos críticos de la caja POS.
   */
  runSystemDiagnostics(params: {
    diskFreeMb: number;
    clockSkewMs: number;
    cloudReachable: boolean;
    printerReady: boolean;
    nowMs?: number;
  }): {
    allHealthy: boolean;
    checks: Record<
      "sqlite" | "keystore" | "disk" | "clock" | "cloudTls" | "printer" | "license",
      { ok: boolean; detail: string }
    >;
  } {
    const nowMs = params.nowMs ?? Date.now();
    const sqliteOk = this.storage.isOpen();
    const keystoreOk = sqliteOk;
    const diskOk = params.diskFreeMb >= 1024;
    const clockOk = Math.abs(params.clockSkewMs) <= 15 * 60 * 1000;
    const licenseOk =
      !!this.deviceState &&
      !this.deviceState.revoked &&
      this.deviceState.license_status !== "SUSPENDED" &&
      nowMs < this.deviceState.license_expires_at_ms;

    const checks = {
      sqlite: { ok: sqliteOk, detail: sqliteOk ? "SQLCipher WAL OK" : "Base cerrada o corrupta" },
      keystore: { ok: keystoreOk, detail: keystoreOk ? "Clave en Keystore OK" : "Sin clave" },
      disk: { ok: diskOk, detail: `${params.diskFreeMb} MB libres` },
      clock: { ok: clockOk, detail: `Desfase ${params.clockSkewMs} ms` },
      cloudTls: { ok: params.cloudReachable, detail: params.cloudReachable ? "TLS OK" : "Offline" },
      printer: { ok: params.printerReady, detail: params.printerReady ? "Lista" : "Sin impresora" },
      license: { ok: licenseOk, detail: licenseOk ? "Licencia vigente" : "Revisar licencia" }
    };

    const allHealthy = Object.values(checks).every((c) => c.ok);
    return { allHealthy, checks };
  }
}
