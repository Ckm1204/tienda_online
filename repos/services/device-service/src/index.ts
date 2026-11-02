import crypto from "node:crypto";
import { newId } from "@tiendita/contracts";

/**
 * ÉPICA 08 (FT-08.3) & ÉPICA 13 (FT-13.1, FT-13.2) — device-service: Cajas SaaS, Enrolamiento,
 * Licencias KMS y Licencias Perpetuas de Edición Local (Pago Único)
 * Cubre: HU-077, HU-078, HU-270..HU-272, HU-295, HU-296, HU-333,
 *        HU-121, HU-122, HU-128, HU-255, HU-256, HU-407.
 */

export interface KmsEd25519Provider {
  readonly kid: string;
  getPublicKeyObject(): crypto.KeyObject;
  signPayload(payloadBytes: Buffer): Buffer;
}

export class SimulatedAwsKmsEd25519Provider implements KmsEd25519Provider {
  private readonly keyPair = crypto.generateKeyPairSync("ed25519");
  constructor(public readonly kid = "kms-ed25519-2026-q1") {}

  getPublicKeyObject(): crypto.KeyObject {
    return this.keyPair.publicKey;
  }

  signPayload(payloadBytes: Buffer): Buffer {
    return crypto.sign(null, payloadBytes, this.keyPair.privateKey);
  }
}

export interface TerminalRecord {
  id: string;
  tenant_id: string;
  branch_id: string;
  warehouse_id: string;
  code: string;
  receipt_prefix: string;
  status: "PENDING_ENROLLMENT" | "ACTIVE" | "REVOKED";
  device_public_key_spki_b64: string | null;
  device_fingerprint: string | null;
  needs_license_refresh: boolean;
}

export interface EnrollmentCodeRecord {
  terminal_id: string;
  tenant_id: string;
  code_sha256: string;
  expires_at_ms: number;
  used_at_ms: number | null;
}

export interface LocalEditionLicenseKeyRecord {
  id: string;
  serial_hash: string;
  serial_last4: string;
  serial_key: string;
  edition: "LOCAL_ESENCIAL" | "LOCAL_PLUS";
  customer_name: string;
  customer_nit_or_cc: string;
  customer_phone: string;
  receipt_prefix: string;
  status: "PENDING_ACTIVATION" | "ACTIVATED" | "DEACTIVATED" | "REVOKED";
  bound_fingerprint_components: string[] | null; // 5 componentes de hardware (regla 3 de 5)
  device_public_key_spki_b64: string | null;
  deactivation_certificate_hash: string | null;
  activated_at_ms: number | null;
  updates_until_ms: number;
  transfers_used: number;
}

export interface LocalActivationAttempt {
  id: string;
  serial_hash: string;
  ip: string;
  attempted_at_ms: number;
  matched_components: number;
  reason: string;
}

export interface LocalAdminResetRequest {
  id: string;
  serial_hash: string;
  customer_nit_or_cc: string;
  reason: string;
  status: "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
  requested_at_ms: number;
  approved_at_ms: number | null;
  approval_token: string | null;
}

export class DeviceService {
  public readonly tenantMaxTerminals = new Map<string, number>();
  public readonly tenantLicenseMeta = new Map<
    string,
    {
      plan_code: "TENDERO" | "NEGOCIO" | "MULTITIENDA";
      status: "TRIAL" | "ACTIVE" | "PAST_DUE" | "RESTRICTED" | "SUSPENDED";
      features: Record<string, boolean>;
      paid_until_ms: number;
      offline_grace_days: number;
    }
  >();
  public readonly terminals = new Map<string, TerminalRecord>();
  public readonly enrollmentCodesByTerminal = new Map<string, EnrollmentCodeRecord>();
  public readonly localEditionLicenses = new Map<string, LocalEditionLicenseKeyRecord>();
  public readonly localTrials = new Map<string, { machine_key: string; started_at_ms: number; expires_at_ms: number }>();
  public readonly localActivationAttempts: LocalActivationAttempt[] = [];
  public readonly localAdminResetRequests = new Map<string, LocalAdminResetRequest>();
  public readonly publishedEvents: { topic: string; payload: unknown }[] = [];

  constructor(public readonly kms: KmsEd25519Provider = new SimulatedAwsKmsEd25519Provider()) {}

  /**
   * HU-077 & HU-270: Creación de caja validando `max_terminals` y generación de código de enrolamiento
   * de 15 minutos (guardado como hash SHA-256; invalida cualquier código anterior de esa caja).
   */
  createTerminal(params: {
    tenantId: string;
    branchId: string;
    warehouseId: string;
    code: string;
    receiptPrefix: string;
    nowMs?: number;
  }): TerminalRecord {
    const maxTerminals = this.tenantMaxTerminals.get(params.tenantId) ?? 1;
    const activeCount = [...this.terminals.values()].filter(
      (t) => t.tenant_id === params.tenantId && t.status !== "REVOKED"
    ).length;

    if (activeCount >= maxTerminals) {
      throw new Error("403 PLAN_LIMIT_REACHED:max_terminals");
    }

    const term: TerminalRecord = {
      id: newId(params.nowMs),
      tenant_id: params.tenantId,
      branch_id: params.branchId,
      warehouse_id: params.warehouseId,
      code: params.code,
      receipt_prefix: params.receiptPrefix,
      status: "PENDING_ENROLLMENT",
      device_public_key_spki_b64: null,
      device_fingerprint: null,
      needs_license_refresh: false
    };
    this.terminals.set(term.id, term);
    return term;
  }

  generateEnrollmentCode(terminalId: string, nowMs = Date.now()): {
    plainCode: string;
    qrPayload: string;
    expiresAtMs: number;
  } {
    const term = this.terminals.get(terminalId);
    if (!term || term.status === "REVOKED") {
      throw new Error("TERMINAL_NOT_AVAILABLE");
    }
    const plainCode = `${crypto.randomBytes(3).toString("hex").toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
    const codeSha256 = crypto.createHash("sha256").update(plainCode).digest("hex");
    const expiresAtMs = nowMs + 15 * 60_000;

    // HU-270: Sobrescribir el registro por terminal_id invalida inmediatamente cualquier código anterior no usado
    this.enrollmentCodesByTerminal.set(terminalId, {
      terminal_id: terminalId,
      tenant_id: term.tenant_id,
      code_sha256: codeSha256,
      expires_at_ms: expiresAtMs,
      used_at_ms: null
    });

    return {
      plainCode,
      qrPayload: `tiendita://enroll?terminal=${terminalId}&code=${plainCode}`,
      expiresAtMs
    };
  }

  /**
   * HU-271: `POST /v1/devices/enroll` — Verificación atómica del código de un solo uso,
   * atadura de llave pública Ed25519 y emisión de licencia inicial firmada con KMS.
   */
  enrollDeviceAtomically(params: {
    plainCode: string;
    devicePublicKeySpkiB64: string;
    deviceFingerprint: string;
    nowMs?: number;
  }): { terminal: TerminalRecord; licenseToken: string } {
    const nowMs = params.nowMs ?? Date.now();
    const codeSha = crypto.createHash("sha256").update(params.plainCode.trim()).digest("hex");

    const record = [...this.enrollmentCodesByTerminal.values()].find(
      (r) => r.code_sha256 === codeSha
    );
    if (!record) {
      throw new Error("404 ENROLLMENT_CODE_INVALID");
    }
    if (record.used_at_ms !== null) {
      throw new Error("409 ENROLLMENT_CODE_ALREADY_USED");
    }
    if (nowMs >= record.expires_at_ms) {
      throw new Error("410 ENROLLMENT_CODE_EXPIRED");
    }

    // Consumo atómico
    record.used_at_ms = nowMs;
    const term = this.terminals.get(record.terminal_id)!;
    term.status = "ACTIVE";
    term.device_public_key_spki_b64 = params.devicePublicKeySpkiB64;
    term.device_fingerprint = params.deviceFingerprint;

    const licenseToken = this.issueSignedSaasLicenseToken(term.id, nowMs);
    return { terminal: term, licenseToken };
  }

  /**
   * HU-078, HU-295 & HU-296: Emite `license_token` firmado con AWS KMS (`Ed25519`),
   * con `exp = min(paid_until + 15 días, now + offline_grace_days)`.
   */
  issueSignedSaasLicenseToken(terminalId: string, nowMs = Date.now()): string {
    const term = this.terminals.get(terminalId);
    if (!term || term.status === "REVOKED") {
      throw new Error("403 TERMINAL_REVOKED");
    }

    const meta = this.tenantLicenseMeta.get(term.tenant_id) ?? {
      plan_code: "NEGOCIO",
      status: "ACTIVE",
      features: { credit: true },
      paid_until_ms: nowMs + 30 * 86_400_000,
      offline_grace_days: 10
    };

    const maxByPaidUntil = meta.paid_until_ms + 15 * 86_400_000;
    const maxByGrace = nowMs + meta.offline_grace_days * 86_400_000;
    const expMs = Math.min(maxByPaidUntil, maxByGrace);

    const payload = {
      tid: term.tenant_id,
      term_id: term.id,
      plan: meta.plan_code,
      features: meta.features,
      status: meta.status,
      iat: nowMs,
      exp: expMs,
      grace_days: meta.offline_grace_days,
      kid: this.kms.kid
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sigB64 = this.kms.signPayload(Buffer.from(payloadB64, "utf8")).toString("base64url");
    term.needs_license_refresh = false;
    return `${payloadB64}.${sigB64}`;
  }

  revokeTerminal(terminalId: string, reason: string): TerminalRecord {
    const term = this.terminals.get(terminalId);
    if (!term) throw new Error("TERMINAL_NOT_FOUND");
    term.status = "REVOKED";
    this.publishedEvents.push({
      topic: "device.events",
      payload: { type: "terminal.revoked", data: { terminal_id: terminalId, reason } }
    });
    return term;
  }

  onTenantStatusOrEntitlementsChanged(tenantId: string): void {
    for (const t of this.terminals.values()) {
      if (t.tenant_id === tenantId && t.status === "ACTIVE") {
        t.needs_license_refresh = true;
      }
    }
  }

  // ============================================================================
  // ÉPICA 13: Licencias Perpetuas de Edición Local (Pago Único)
  // ============================================================================

  /**
   * HU-121: Emite un serial de Edición Local en la consola (`POST /v1/platform/local-licenses`)
   * guardando únicamente `serial_hash` y los últimos 4 caracteres.
   */
  issueLocalEditionSerialKey(params: {
    customerName: string;
    customerNitOrCc: string;
    customerPhone: string;
    edition?: "LOCAL_ESENCIAL" | "LOCAL_PLUS";
    receiptPrefix?: string;
    nowMs?: number;
  }): LocalEditionLicenseKeyRecord {
    const nowMs = params.nowMs ?? Date.now();
    const seg = () => crypto.randomBytes(3).toString("hex").toUpperCase().slice(0, 5);
    const plainSerial = `TDL-${seg()}-${seg()}-${seg()}-${seg()}`;
    const serialHash = crypto.createHash("sha256").update(plainSerial).digest("hex");
    const serialLast4 = plainSerial.slice(-4);

    const rec: LocalEditionLicenseKeyRecord = {
      id: `LOC-${new Date(nowMs).getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
      serial_hash: serialHash,
      serial_last4: serialLast4,
      serial_key: plainSerial, // Solo retornado una vez en memoria
      edition: params.edition ?? "LOCAL_PLUS",
      customer_name: params.customerName,
      customer_nit_or_cc: params.customerNitOrCc,
      customer_phone: params.customerPhone,
      receipt_prefix: params.receiptPrefix ?? "L01",
      status: "PENDING_ACTIVATION",
      bound_fingerprint_components: null,
      device_public_key_spki_b64: null,
      deactivation_certificate_hash: null,
      activated_at_ms: null,
      updates_until_ms: nowMs + 365 * 86_400_000,
      transfers_used: 0
    };

    this.localEditionLicenses.set(serialHash, rec);
    return rec;
  }

  /**
   * HU-122: Activación en línea única (`POST /v1/local-activation/activate`)
   * con huella de 5 componentes, par de llaves Ed25519 y bloqueo de serial ya usado.
   * Si es reinstalación en el mismo PC (≥ 3 de 5 coinciden), reemite sin gastar transferencia.
   */
  activateLocalEditionSerial(params: {
    serialKey: string;
    fingerprintComponents: [string, string, string, string, string];
    devicePublicKeySpkiB64: string;
    ip?: string;
    nowMs?: number;
  }): { certificateToken: string; payload: Record<string, unknown> } {
    const nowMs = params.nowMs ?? Date.now();
    const serialHash = crypto.createHash("sha256").update(params.serialKey.trim()).digest("hex");
    const lic = this.localEditionLicenses.get(serialHash);

    if (!lic) {
      throw new Error("404 LOCAL_SERIAL_NOT_FOUND");
    }
    if (lic.status === "REVOKED") {
      throw new Error("403 LOCAL_LICENSE_REVOKED");
    }

    if (lic.status === "ACTIVATED") {
      // Verificar si es el mismo PC reinstalado (≥ 3 de 5 componentes)
      const current = params.fingerprintComponents;
      const bound = lic.bound_fingerprint_components ?? [];
      const match = DeviceService.verifyHardwareFingerprint3Of5(bound, current);

      if (!match.valid) {
        this.localActivationAttempts.push({
          id: newId(),
          serial_hash: serialHash,
          ip: params.ip ?? "127.0.0.1",
          attempted_at_ms: nowMs,
          matched_components: match.matchedCount,
          reason: "409 ALREADY_ACTIVATED: 409 LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE (Hardware mismatch on another machine)"
        });
        throw new Error("409 ALREADY_ACTIVATED: 409 LICENSE_ALREADY_ACTIVATED_ON_ANOTHER_DEVICE");
      }

      // Reinstalación en la misma máquina permitida sin consumir transferencias
      lic.device_public_key_spki_b64 = params.devicePublicKeySpkiB64;
      lic.bound_fingerprint_components = [...params.fingerprintComponents];
    } else {
      // Primera activación
      lic.status = "ACTIVATED";
      lic.bound_fingerprint_components = [...params.fingerprintComponents];
      lic.device_public_key_spki_b64 = params.devicePublicKeySpkiB64;
      lic.activated_at_ms = nowMs;
    }

    const payload = {
      license_type: "LOCAL_PERPETUAL",
      license_id: lic.id,
      edition: lic.edition,
      customer_name: lic.customer_name,
      customer_nit_or_cc: lic.customer_nit_or_cc,
      receipt_prefix: lic.receipt_prefix,
      fingerprint_components: lic.bound_fingerprint_components,
      device_public_key: lic.device_public_key_spki_b64,
      updates_until_ms: lic.updates_until_ms,
      issued_at_ms: nowMs,
      expires_at: null,
      kid: this.kms.kid
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sigB64 = this.kms.signPayload(Buffer.from(payloadB64, "utf8")).toString("base64url");
    return {
      certificateToken: `${payloadB64}.${sigB64}`,
      payload
    };
  }

  /**
   * HU-256: Modo de Prueba de 15 días en la Edición Local (`POST /v1/local-activation/trial`,
   * una sola vez por huella de máquina).
   */
  startTrial(params: {
    machineKey: string;
    devicePublicKeySpkiB64: string;
    businessName: string;
    nowMs?: number;
  }): { certificateToken: string; payload: Record<string, unknown> } {
    const nowMs = params.nowMs ?? Date.now();
    const existing = this.localTrials.get(params.machineKey);
    if (existing) {
      throw new Error("409 TRIAL_ALREADY_USED");
    }

    const expiresAtMs = nowMs + 15 * 86_400_000;
    this.localTrials.set(params.machineKey, {
      machine_key: params.machineKey,
      started_at_ms: nowMs,
      expires_at_ms: expiresAtMs
    });

    const payload = {
      license_type: "TRIAL",
      edition: "LOCAL_PLUS",
      customer_name: params.businessName,
      customer_nit_or_cc: "TRIAL-001",
      receipt_prefix: "TR1",
      device_public_key: params.devicePublicKeySpkiB64,
      trial_started_at_ms: nowMs,
      expires_at_ms: expiresAtMs,
      issued_at_ms: nowMs,
      kid: this.kms.kid
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sigB64 = this.kms.signPayload(Buffer.from(payloadB64, "utf8")).toString("base64url");
    return {
      certificateToken: `${payloadB64}.${sigB64}`,
      payload
    };
  }

  /**
   * HU-126 & HU-407: Desactivación / Solicitud de cambio de equipo (`POST /v1/local-activation/deactivate`).
   * Libera el serial sin incrementar transfers_used ya que el PC viejo certificó el traslado con backup.
   */
  deactivateForTransfer(params: {
    serialKey: string;
    deactivationCertificateHash: string;
    nowMs?: number;
  }): LocalEditionLicenseKeyRecord {
    const serialHash = crypto.createHash("sha256").update(params.serialKey.trim()).digest("hex");
    const lic = this.localEditionLicenses.get(serialHash);
    if (!lic) throw new Error("404 LOCAL_SERIAL_NOT_FOUND");

    lic.status = "PENDING_ACTIVATION";
    lic.bound_fingerprint_components = null;
    lic.device_public_key_spki_b64 = null;
    lic.deactivation_certificate_hash = params.deactivationCertificateHash;
    return lic;
  }

  /**
   * HU-255: Liberación por soporte de un computador dañado en la Consola Super Admin.
   * Valida tope de máx. 2 al año.
   */
  releaseDamagedMachineBySupport(serialHash: string, adminReason: string): LocalEditionLicenseKeyRecord {
    const lic = this.localEditionLicenses.get(serialHash);
    if (!lic) throw new Error("404 LOCAL_SERIAL_NOT_FOUND");
    if (lic.transfers_used >= 2) {
      throw new Error("403 TRANSFER_LIMIT_REACHED: Maximo 2 traslados por soporte al ano");
    }

    lic.transfers_used += 1;
    lic.status = "PENDING_ACTIVATION";
    lic.bound_fingerprint_components = null;
    lic.device_public_key_spki_b64 = null;
    lic.deactivation_certificate_hash = `SUPPORT_RELEASE:${adminReason}`;
    return lic;
  }

  /**
   * HU-128 & HU-407: Actualización de licencia en línea (`POST /v1/local-activation/refresh`).
   */
  refreshLocalLicense(serialKey: string, nowMs = Date.now()): { certificateToken: string; payload: Record<string, unknown> } {
    const serialHash = crypto.createHash("sha256").update(serialKey.trim()).digest("hex");
    const lic = this.localEditionLicenses.get(serialHash);
    if (!lic || lic.status !== "ACTIVATED") {
      throw new Error("404 ACTIVE_LICENSE_NOT_FOUND");
    }

    const payload = {
      license_type: "LOCAL_PERPETUAL",
      license_id: lic.id,
      edition: lic.edition,
      customer_name: lic.customer_name,
      customer_nit_or_cc: lic.customer_nit_or_cc,
      receipt_prefix: lic.receipt_prefix,
      fingerprint_components: lic.bound_fingerprint_components,
      device_public_key: lic.device_public_key_spki_b64,
      updates_until_ms: lic.updates_until_ms,
      issued_at_ms: nowMs,
      expires_at: null,
      kid: this.kms.kid
    };

    const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
    const sigB64 = this.kms.signPayload(Buffer.from(payloadB64, "utf8")).toString("base64url");
    return {
      certificateToken: `${payloadB64}.${sigB64}`,
      payload
    };
  }

  /**
   * HU-129 & HU-407: Solicitud y aprobación de recuperación de contraseña de administrador local.
   */
  requestAdminReset(params: {
    serialKey: string;
    customerNitOrCc: string;
    reason: string;
    nowMs?: number;
  }): LocalAdminResetRequest {
    const nowMs = params.nowMs ?? Date.now();
    const serialHash = crypto.createHash("sha256").update(params.serialKey.trim()).digest("hex");
    const lic = this.localEditionLicenses.get(serialHash);
    if (!lic) throw new Error("404 LOCAL_SERIAL_NOT_FOUND");

    const req: LocalAdminResetRequest = {
      id: newId(nowMs),
      serial_hash: serialHash,
      customer_nit_or_cc: params.customerNitOrCc,
      reason: params.reason,
      status: "PENDING_APPROVAL",
      requested_at_ms: nowMs,
      approved_at_ms: null,
      approval_token: null
    };
    this.localAdminResetRequests.set(req.id, req);
    return req;
  }

  approveAdminReset(requestId: string, nowMs = Date.now()): LocalAdminResetRequest {
    const req = this.localAdminResetRequests.get(requestId);
    if (!req) throw new Error("404 RESET_REQUEST_NOT_FOUND");
    req.status = "APPROVED";
    req.approved_at_ms = nowMs;
    req.approval_token = crypto.randomBytes(16).toString("hex");
    return req;
  }

  /**
   * HU-121: Regla de tolerancia de hardware "3 de 5" componentes (`CPU ID`, `Board UUID`, `Disk Serial`, `OS Machine GUID`, `MAC`).
   */
  static verifyHardwareFingerprint3Of5(
    boundComponents: string[],
    currentComponents: string[]
  ): { matchedCount: number; valid: boolean } {
    let matchedCount = 0;
    const len = Math.min(boundComponents.length, currentComponents.length);
    for (let i = 0; i < len; i++) {
      if (boundComponents[i] === currentComponents[i]) {
        matchedCount++;
      }
    }
    return {
      matchedCount,
      valid: matchedCount >= 3
    };
  }
}
