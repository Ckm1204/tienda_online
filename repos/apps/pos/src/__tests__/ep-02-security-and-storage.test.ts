import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { newId } from "@tiendita/contracts";
import {
  InMemoryOsKeystore,
  EncryptedPosStorage
} from "../storage/local-db.js";
import {
  PosSecurityAndAuthKernel,
  hashPin,
  SignedLicensePayload
} from "../security/device-auth-and-audit.js";

function createSignedLicenseToken(
  payload: SignedLicensePayload,
  privateKey: crypto.KeyObject
): string {
  const payloadB64 = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const sigB64 = crypto
    .sign(null, Buffer.from(payloadB64, "base64url"), privateKey)
    .toString("base64url");
  return `${payloadB64}.${sigB64}`;
}

describe("ÉPICA 02 — App Instalable (Tauri): Base Local, Seguridad, Enrolamiento, Licencia, PIN y Reloj", () => {
  it("FT-02.1 (HU-019, HU-020, HU-156, HU-157, HU-158, HU-352, HU-373): abre SQLCipher solo con clave del Keystore, rechaza lecturas externas, rota 30 snapshots, migra preservando outbox y aplica CSP/SingleInstanceLock", () => {
    const tauriConfPath = path.resolve(import.meta.dirname, "../../tauri.conf.json");
    const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf8")) as {
      app: { security: { csp: string; capabilities: { permissions: string[] }[] } };
    };
    expect(tauriConf.app.security.csp).toContain("default-src 'self'");
    expect(tauriConf.app.security.capabilities[0]?.permissions).toEqual(["core:default"]);

    const keystore = new InMemoryOsKeystore();
    const storage = new EncryptedPosStorage(keystore);

    // HU-352: Single instance lock
    expect(storage.acquireSingleInstanceLock()).toEqual({ acquired: true, action: "STARTED" });
    expect(storage.acquireSingleInstanceLock()).toEqual({
      acquired: false,
      action: "FOCUSED_EXISTING_WINDOW"
    });

    // HU-020 & HU-156: Apertura con keystore y rechazo sin clave
    storage.openWithKeystore();
    expect(storage.isOpen()).toBe(true);
    expect(storage.pragmas).toEqual({
      journal_mode: "WAL",
      synchronous: "FULL",
      foreign_keys: "ON"
    });
    expect(() => storage.simulateExternalOpenWithoutKeystore()).toThrow("file is not a database");

    // HU-157: Migración de esquema preserva todos los eventos pendientes del outbox
    storage.outbox.push({
      event_id: newId(),
      terminal_seq: 1,
      event_type: "sale.completed",
      schema_version: 1,
      payload: "{}",
      payload_hash: "sha256:" + "a".repeat(64),
      occurred_at: 1000,
      hlc: "1000:0001:term",
      status: "PENDING",
      attempts: 0,
      last_error: null,
      sent_at: null
    });
    const mig = storage.migrateToVersion(2, 2000);
    expect(mig).toEqual({ backupFile: "pos.pre-migrate-v1.db", migrated: true });
    expect(storage.schemaVersion).toBe(2);
    expect(storage.outbox).toHaveLength(1);

    // HU-158 & HU-492: Rotación de máximo 30 snapshots y restauración ante fallo de integrity_check
    for (let i = 0; i < 35; i++) {
      storage.createSnapshot("AUTO_HOURLY", `C01-${i}`, 3000 + i);
    }
    expect(storage.snapshots).toHaveLength(30);

    storage.simulateDiskCorruption();
    expect(() => storage.openWithKeystore()).toThrow(/integrity_check failed/);
    const restored = storage.restoreLatestVerifiedSnapshot();
    expect(restored.lastSaleReceipt).toBe("C01-34");
    expect(storage.isOpen()).toBe(true);
  });

  it("FT-02.1 (HU-021, HU-022, HU-282): purga únicamente eventos SENT antiguos o cuando el disco baja de 1 GB, conservando siempre PENDING y REJECTED", () => {
    const storage = new EncryptedPosStorage(new InMemoryOsKeystore());
    storage.openWithKeystore();
    const now = Date.now();
    const fortyDaysAgo = now - 40 * 24 * 60 * 60 * 1000;

    storage.outbox.push(
      {
        event_id: "sent-old",
        terminal_seq: 1,
        event_type: "sale.completed",
        schema_version: 1,
        payload: "{}",
        payload_hash: "sha256:" + "a".repeat(64),
        occurred_at: fortyDaysAgo,
        hlc: "1",
        status: "SENT",
        attempts: 1,
        last_error: null,
        sent_at: fortyDaysAgo
      },
      {
        event_id: "pending-old",
        terminal_seq: 2,
        event_type: "sale.completed",
        schema_version: 1,
        payload: "{}",
        payload_hash: "sha256:" + "b".repeat(64),
        occurred_at: fortyDaysAgo,
        hlc: "2",
        status: "PENDING",
        attempts: 0,
        last_error: null,
        sent_at: null
      }
    );

    // HU-022: Advertencia al desinstalar con pendientes
    const uninst = storage.checkSafeToUninstall();
    expect(uninst.canUninstallSilently).toBe(false);
    expect(uninst.pendingOutboxCount).toBe(1);

    // HU-021: Purga de SENT > 30 días respeta PENDING
    const res = storage.monitorDiskAndPurgeSentOutbox({ diskFreeMb: 5000, nowMs: now });
    expect(res.purgedCount).toBe(1);
    expect(storage.outbox.map((e) => e.event_id)).toEqual(["pending-old"]);

    // HU-282: Disco bajo (< 1 GB) dispara LOW_SPACE_WARNING y (< 100 MB) CRITICAL_STOP_WRITES
    expect(
      storage.monitorDiskAndPurgeSentOutbox({ diskFreeMb: 800, nowMs: now }).diskStatus
    ).toBe("LOW_SPACE_WARNING");
    expect(
      storage.monitorDiskAndPurgeSentOutbox({ diskFreeMb: 50, nowMs: now }).diskStatus
    ).toBe("CRITICAL_STOP_WRITES");
  });

  it("FT-02.2 (HU-023..HU-026, HU-159..HU-164, HU-199, HU-200): enrola con QR/código, verifica firma Ed25519 de licencia, oculta aviso PAST_DUE al cajero, bloquea en SUSPENDED y destruye clave en revocación remota", async () => {
    const keystore = new InMemoryOsKeystore();
    const storage = new EncryptedPosStorage(keystore);
    storage.openWithKeystore();
    const kernel = new PosSecurityAndAuthKernel(storage);

    const cloudKeys = crypto.generateKeyPairSync("ed25519");
    kernel.registerCloudLicensePublicKey("kid-2026", cloudKeys.publicKey);

    expect(kernel.cmdGetDeviceEnrollmentState()).toEqual({
      enrolled: false,
      route: "/enroll"
    });

    const nowMs = 1_760_000_000_000;
    const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
    const licPayload: SignedLicensePayload = {
      sub: "term-1",
      tid: "tenant-1",
      plan: "TENDERO",
      features: { credit: true, promotions: false },
      status: "PAST_DUE",
      iat: nowMs,
      exp: nowMs + tenDaysMs,
      grace_days: 10,
      kid: "kid-2026"
    };
    const token = createSignedLicenseToken(licPayload, cloudKeys.privateKey);

    const progressSteps: number[] = [];
    await kernel.cmdEnrollDevice(
      "tiendita://enroll?code=K7Q2-9XMA",
      async ({ code, publicKey }) => {
        expect(code).toBe("K7Q2-9XMA");
        expect(publicKey.length).toBeGreaterThan(20);
        return {
          tenant_id: "tenant-1",
          branch_id: "branch-1",
          terminal_id: "term-1",
          warehouse_id: "wh-1",
          receipt_prefix: "C01",
          plan_code: "TENDERO",
          license_token: token,
          license_payload: licPayload,
          initial_users: []
        };
      },
      (p) => progressSteps.push(p)
    );

    expect(progressSteps).toEqual([20, 60, 100]);
    expect(kernel.cmdGetDeviceEnrollmentState().enrolled).toBe(true);

    // HU-023: Firma de lote con la llave del dispositivo
    const sig = kernel.signPayloadWithDeviceKey("batch-payload");
    expect(kernel.verifyDeviceSignature("batch-payload", sig)).toBe(true);

    // HU-162: Manipular el token de licencia falla la verificación de firma
    const tampered = token.slice(0, -4) + "AAAA";
    expect(kernel.verifyAndApplyLicenseToken(tampered, nowMs).valid).toBe(false);

    // HU-163 & HU-164: A los 6 días de 10 (60% gracia) muestra banner offline; PAST_DUE lo ve OWNER pero NO CASHIER
    const sixDaysLater = nowMs + 6 * 24 * 60 * 60 * 1000;
    const cashierView = kernel.evaluateOperationalLicenseBanner("CASHIER", sixDaysLater);
    expect(cashierView.canOpenNewShiftAndSell).toBe(true);
    expect(cashierView.offlineGraceBanner).toContain("6 días sin internet");
    expect(cashierView.billingBanner).toBeNull();

    const ownerView = kernel.evaluateOperationalLicenseBanner("OWNER", sixDaysLater);
    expect(ownerView.billingBanner).toBe("Tienes una factura pendiente de pago");

    // HU-025: Al vencer la ventana de gracia (día 11), bloquea abrir nuevo turno pero permite cerrar/sincronizar
    const elevenDaysLater = nowMs + 11 * 24 * 60 * 60 * 1000;
    const expiredView = kernel.evaluateOperationalLicenseBanner("OWNER", elevenDaysLater);
    expect(expiredView.canOpenNewShiftAndSell).toBe(false);
    expect(expiredView.canCloseOpenShiftAndSync).toBe(true);

    // HU-026: Revocación remota intenta último push y destruye la clave de SQLCipher
    let flushedBeforeWipe = false;
    await kernel.handleRemoteRevocationSignal(async () => {
      flushedBeforeWipe = storage.isOpen();
    });
    expect(flushedBeforeWipe).toBe(true);
    expect(storage.isOpen()).toBe(false);
  });

  it("FT-02.3 & FT-02.4 (HU-027..HU-032, HU-165..HU-167, HU-201..HU-204): login por PIN sin exponer pin_hash, bloqueo al 5to intento, desbloqueo por supervisor, F12/auto-lock, aprobaciones y reloj anti-retroceso", () => {
    const storage = new EncryptedPosStorage(new InMemoryOsKeystore());
    storage.openWithKeystore();
    const kernel = new PosSecurityAndAuthKernel(storage);

    const ownerId = newId();
    const cashierId = newId();
    const supId = newId();

    kernel.upsertLocalUser({
      id: ownerId,
      full_name: "Doña María (Dueña)",
      pin_hash: hashPin("9876"),
      status: "ACTIVE",
      role_codes: ["OWNER"],
      permissions: ["sale.create", "sale.void", "cash.session.view_expected"],
      failed_pin_attempts: 0,
      locked_until_ms: null
    });
    kernel.upsertLocalUser({
      id: supId,
      full_name: "Luisa (Supervisora)",
      pin_hash: hashPin("5544"),
      status: "ACTIVE",
      role_codes: ["SUPERVISOR"],
      permissions: ["sale.create", "sale.void"],
      failed_pin_attempts: 0,
      locked_until_ms: null
    });
    kernel.upsertLocalUser({
      id: cashierId,
      full_name: "Carlos (Cajero)",
      pin_hash: hashPin("4829"),
      status: "ACTIVE",
      role_codes: ["CASHIER"],
      permissions: ["sale.create"],
      failed_pin_attempts: 0,
      locked_until_ms: null
    });

    // HU-201: cmdListLoginUsers jamás expone pin_hash
    const list = kernel.cmdListLoginUsers();
    expect(list).toHaveLength(3);
    expect("pin_hash" in (list[0] as unknown as Record<string, unknown>)).toBe(false);

    // HU-028: 5 intentos fallidos bloquean por 5 minutos y auditan auth.pin.failed_lock
    const t0 = 1_760_000_000_000;
    for (let i = 0; i < 5; i++) {
      expect(() => kernel.cmdLoginWithPin(cashierId, "0000", t0)).toThrow("INVALID_PIN");
    }
    expect(() => kernel.cmdLoginWithPin(cashierId, "4829", t0 + 1000)).toThrow("USER_PIN_LOCKED");
    expect(storage.auditLog.some((a) => a.action === "auth.pin.failed_lock")).toBe(true);

    // HU-166: Supervisor desbloquea en caja al cajero bloqueado
    kernel.cmdUnlockCashierWithSupervisorPin(cashierId, supId, "5544", t0 + 2000);
    const loginOk = kernel.cmdLoginWithPin(cashierId, "4829", t0 + 3000);
    expect(loginOk.user.full_name).toContain("Carlos");

    // HU-029 & HU-203: Bloqueo de pantalla F12 impide ejecutar comandos
    kernel.cmdLockScreen();
    expect(() => kernel.requireActiveUnlockedSession()).toThrow("SESSION_LOCKED");
    kernel.cmdLoginWithPin(cashierId, "4829", t0 + 4000);
    expect(kernel.requireActiveUnlockedSession().id).toBe(cashierId);

    // HU-167: Auto-bloqueo tras 5 minutos de inactividad
    expect(kernel.checkInactivityAutoLock(t0 + 4000 + 5 * 60 * 1000)).toBe(true);
    kernel.cmdLoginWithPin(cashierId, "4829", t0 + 400_000);

    // HU-030 & HU-204: Aprobación en caja exige aprobador != solicitante salvo OWNER en TENDERO, y el nonce es de un solo uso
    expect(() =>
      kernel.cmdVerifyApproverPin({
        requestedByUserId: supId,
        approverUserId: supId,
        approverPin: "5544",
        permissionCode: "sale.void",
        nowMs: t0
      })
    ).toThrow("SELF_APPROVAL_FORBIDDEN");

    const supApproval = kernel.cmdVerifyApproverPin({
      requestedByUserId: cashierId,
      approverUserId: supId,
      approverPin: "5544",
      permissionCode: "sale.void",
      nowMs: t0
    });
    expect(supApproval.selfApproved).toBe(false);
    expect(kernel.consumeApprovalNonce(supApproval.approvalNonce, "sale.void", t0 + 1000)).toEqual({
      approverId: supId,
      selfApproved: false
    });
    expect(() =>
      kernel.consumeApprovalNonce(supApproval.approvalNonce, "sale.void", t0 + 1000)
    ).toThrow("APPROVAL_NONCE_ALREADY_USED");

    // Autoaprobación permitida al OWNER en plan TENDERO
    const ownerSelf = kernel.cmdVerifyApproverPin({
      requestedByUserId: ownerId,
      approverUserId: ownerId,
      approverPin: "9876",
      permissionCode: "sale.void",
      nowMs: t0
    });
    expect(ownerSelf.selfApproved).toBe(true);

    // HU-031: Cadena de hashes SHA-256 en local_audit
    for (let i = 1; i < storage.auditLog.length; i++) {
      expect(storage.auditLog[i]?.prev_hash).toBe(storage.auditLog[i - 1]?.hash);
    }

    // HU-032: Bloqueo por retroceso del reloj del sistema operativo > 5 minutos
    kernel.deviceState = {
      tenant_id: "t1",
      branch_id: "b1",
      terminal_id: "term1",
      warehouse_id: "w1",
      receipt_prefix: "C01",
      next_receipt_number: 1,
      next_terminal_seq: 1,
      plan_code: "TENDERO",
      fiscal_mode: "NONE",
      features: {},
      license_token: "",
      license_status: "ACTIVE",
      license_issued_at_ms: t0,
      license_expires_at_ms: t0 + 10_000_000,
      grace_days: 10,
      max_seen_local_time_ms: t0 + 600_000,
      revoked: false
    };
    expect(() => kernel.advanceClockAndGenerateHlc(t0)).toThrow("CLOCK_ROLLBACK_DETECTED");

    // HU-473 & HU-491: Generación QR local sin red y autodiagnóstico de 7 puntos
    const qrSvg = kernel.generateLocalQrSvg("K7Q2-9XMA");
    expect(qrSvg).toContain("<svg");
    expect(qrSvg).toContain("K7Q2-9XMA");

    const diag = kernel.runSystemDiagnostics({
      diskFreeMb: 8000,
      clockSkewMs: 120,
      cloudReachable: true,
      printerReady: true,
      nowMs: t0
    });
    expect(diag.allHealthy).toBe(true);
    expect(Object.keys(diag.checks)).toHaveLength(7);
  });
});
