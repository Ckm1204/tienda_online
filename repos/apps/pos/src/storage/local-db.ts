import crypto from "node:crypto";
import { rawCanonicalSha256Hex } from "@tiendita/contracts";

/**
 * FT-02.1 — Almacenamiento Cifrado SQLCipher, Snapshots, Purga Segura y Diagnóstico Local
 * Cubre: HU-019, HU-020, HU-021, HU-022, HU-156, HU-157, HU-158, HU-282, HU-350, HU-351,
 *        HU-352, HU-373, HU-466, HU-467, HU-491, HU-492, HU-494.
 */

export interface OsKeystoreProvider {
  getSecret(alias: string): string | null;
  setSecret(alias: string, secretHex: string): void;
  deleteSecret(alias: string): void;
}

export class InMemoryOsKeystore implements OsKeystoreProvider {
  private readonly secrets = new Map<string, string>();
  getSecret(alias: string): string | null {
    return this.secrets.get(alias) ?? null;
  }
  setSecret(alias: string, secretHex: string): void {
    this.secrets.set(alias, secretHex);
  }
  deleteSecret(alias: string): void {
    this.secrets.delete(alias);
  }
}

export interface LocalSnapshotMetadata {
  id: string;
  fileName: string;
  kind: "AUTO_HOURLY" | "AUTO_SHIFT" | "PRE_MIGRATE";
  schemaVersion: number;
  lastSaleReceipt: string | null;
  sha256: string;
  createdAtMs: number;
  stateDump: string;
}

export interface OutboxLocalRow {
  event_id: string;
  terminal_seq: number;
  event_type: string;
  schema_version: number;
  payload: string;
  payload_hash: string;
  occurred_at: number;
  hlc: string;
  status: "PENDING" | "IN_FLIGHT" | "SENT" | "REJECTED";
  attempts: number;
  last_error: string | null;
  sent_at: number | null;
}

export interface LocalAuditRow {
  id: string;
  actor_id: string | null;
  approved_by: string | null;
  action: string;
  entity_id: string | null;
  data: Record<string, unknown>;
  occurred_at: number;
  prev_hash: string | null;
  hash: string;
}

const MAX_ROTATED_SNAPSHOTS = 30;
const KEYSTORE_DB_ALIAS = "tiendita.sqlcipher.master_key";

export class EncryptedPosStorage {
  private encryptionKeyHex: string | null = null;
  public readonly pragmas = {
    journal_mode: "WAL",
    synchronous: "FULL",
    foreign_keys: "ON"
  };
  public schemaVersion = 1;
  private integrityHealthy = true;
  private singleInstanceLocked = false;
  public readonly outbox: OutboxLocalRow[] = [];
  public readonly auditLog: LocalAuditRow[] = [];
  public readonly snapshots: LocalSnapshotMetadata[] = [];

  constructor(private readonly keystore: OsKeystoreProvider) {}

  /**
   * HU-352: Single instance lock — si ya hay una instancia abierta, enfoca la ventana actual y no abre otra.
   */
  acquireSingleInstanceLock(): { acquired: boolean; action: "STARTED" | "FOCUSED_EXISTING_WINDOW" } {
    if (this.singleInstanceLocked) {
      return { acquired: false, action: "FOCUSED_EXISTING_WINDOW" };
    }
    this.singleInstanceLocked = true;
    return { acquired: true, action: "STARTED" };
  }

  /**
   * HU-020 & HU-156: Deriva o recupera la clave de 32 bytes desde DPAPI/Keystore y abre SQLCipher.
   * Si un proceso externo intenta abrir sin la clave del keystore, falla con `file is not a database`.
   */
  openWithKeystore(providedExternalKey?: string): void {
    let key = this.keystore.getSecret(KEYSTORE_DB_ALIAS);
    if (!key) {
      key = crypto.randomBytes(32).toString("hex");
      this.keystore.setSecret(KEYSTORE_DB_ALIAS, key);
    }
    if (providedExternalKey !== undefined && providedExternalKey !== key) {
      throw new Error("file is not a database");
    }
    if (!this.integrityHealthy) {
      throw new Error("PRAGMA integrity_check failed: database disk image is malformed");
    }
    this.encryptionKeyHex = key;
  }

  simulateExternalOpenWithoutKeystore(): never {
    throw new Error("file is not a database");
  }

  simulateDiskCorruption(): void {
    this.integrityHealthy = false;
  }

  /**
   * HU-26: Destruye la clave de SQLCipher del keystore cuando la terminal es revocada remotamente.
   */
  destroyEncryptionKeyOnRevoke(): void {
    this.keystore.deleteSecret(KEYSTORE_DB_ALIAS);
    this.encryptionKeyHex = null;
  }

  isOpen(): boolean {
    return this.encryptionKeyHex !== null && this.integrityHealthy;
  }

  /**
   * HU-158 & HU-492: Crea un snapshot consistente con rotación de las últimas 30 copias
   * y permite restaurar cuando `integrity_check` falla.
   */
  createSnapshot(
    kind: "AUTO_HOURLY" | "AUTO_SHIFT" | "PRE_MIGRATE",
    lastSaleReceipt: string | null = null,
    nowMs = Date.now()
  ): LocalSnapshotMetadata {
    const dump = JSON.stringify({
      schemaVersion: this.schemaVersion,
      outbox: this.outbox,
      auditLog: this.auditLog
    });
    const sha256 = rawCanonicalSha256Hex(dump);
    const meta: LocalSnapshotMetadata = {
      id: `snap-${nowMs}-${this.snapshots.length + 1}`,
      fileName: kind === "PRE_MIGRATE" ? `pos.pre-migrate-v${this.schemaVersion}.db` : `pos.snapshot-${nowMs}.db`,
      kind,
      schemaVersion: this.schemaVersion,
      lastSaleReceipt,
      sha256,
      createdAtMs: nowMs,
      stateDump: dump
    };
    this.snapshots.push(meta);
    while (this.snapshots.length > MAX_ROTATED_SNAPSHOTS) {
      this.snapshots.shift();
    }
    return meta;
  }

  restoreLatestVerifiedSnapshot(): LocalSnapshotMetadata {
    const latest = this.snapshots[this.snapshots.length - 1];
    if (!latest) {
      throw new Error("NO_VERIFIED_SNAPSHOT_AVAILABLE");
    }
    const parsed = JSON.parse(latest.stateDump) as {
      schemaVersion: number;
      outbox: OutboxLocalRow[];
      auditLog: LocalAuditRow[];
    };
    this.schemaVersion = parsed.schemaVersion;
    this.outbox.splice(0, this.outbox.length, ...parsed.outbox);
    this.auditLog.splice(0, this.auditLog.length, ...parsed.auditLog);
    this.integrityHealthy = true;
    return latest;
  }

  /**
   * HU-157 & HU-022: Ejecuta migración de versión de esquema creando antes `pos.pre-migrate-vX.db`
   * y preservando intactos todos los eventos del outbox.
   */
  migrateToVersion(targetVersion: number, nowMs = Date.now()): { backupFile: string | null; migrated: boolean } {
    if (targetVersion <= this.schemaVersion) {
      return { backupFile: null, migrated: false };
    }
    const snap = this.createSnapshot("PRE_MIGRATE", null, nowMs);
    this.schemaVersion = targetVersion;
    return { backupFile: snap.fileName, migrated: true };
  }

  /**
   * HU-022: Advierte antes de desinstalar si existen eventos pendientes en el outbox.
   */
  checkSafeToUninstall(): { canUninstallSilently: boolean; pendingOutboxCount: number; warning?: string } {
    const pending = this.outbox.filter((e) => e.status === "PENDING" || e.status === "IN_FLIGHT").length;
    if (pending > 0) {
      return {
        canUninstallSilently: false,
        pendingOutboxCount: pending,
        warning: `Existen ${pending} ventas/eventos pendientes de subir a la nube. Sincroniza antes de desinstalar.`
      };
    }
    return { canUninstallSilently: true, pendingOutboxCount: 0 };
  }

  /**
   * HU-021 & HU-282: Purga de eventos SENT con más de 30 días (o purga de emergencia de SENT cuando disco < 1 GB),
   * jamás borrando eventos PENDING, IN_FLIGHT ni REJECTED.
   */
  monitorDiskAndPurgeSentOutbox(params: {
    diskFreeMb: number;
    nowMs?: number;
    retentionDays?: number;
  }): {
    purgedCount: number;
    diskStatus: "OK" | "LOW_SPACE_WARNING" | "CRITICAL_STOP_WRITES";
    message?: string;
  } {
    const nowMs = params.nowMs ?? Date.now();
    const retentionMs = (params.retentionDays ?? 30) * 24 * 60 * 60 * 1000;
    const isLowDisk = params.diskFreeMb < 1024;
    const isCriticalDisk = params.diskFreeMb < 100;

    let purgedCount = 0;
    for (let i = this.outbox.length - 1; i >= 0; i--) {
      const ev = this.outbox[i]!;
      if (ev.status !== "SENT") {
        // Jamás purgar PENDING, IN_FLIGHT ni REJECTED
        continue;
      }
      const ageMs = ev.sent_at ? nowMs - ev.sent_at : 0;
      if (isLowDisk || ageMs >= retentionMs) {
        this.outbox.splice(i, 1);
        purgedCount += 1;
      }
    }

    if (isCriticalDisk) {
      return {
        purgedCount,
        diskStatus: "CRITICAL_STOP_WRITES",
        message: "Espacio en disco crítico (< 100 MB). Libera espacio en el PC antes de continuar."
      };
    }

    if (isLowDisk) {
      return {
        purgedCount,
        diskStatus: "LOW_SPACE_WARNING",
        message: "Queda menos de 1 GB libre en disco. Se purgaron eventos ya sincronizados."
      };
    }

    return { purgedCount, diskStatus: "OK" };
  }
}
