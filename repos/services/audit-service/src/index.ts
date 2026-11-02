import { newId, canonicalSha256 } from "@tiendita/contracts";

/**
 * ÉPICA 09 (FT-09.5) — audit-service: cadena SHA-256 por tienda (parte de HU-095) y alertas de exportación (HU-459).
 */

export interface CloudAuditEntry {
  id: string;
  tenant_id: string;
  seq: number;
  actor_id: string;
  action: string;
  entity_id: string | null;
  details: Record<string, unknown>;
  occurred_at_ms: number;
  prev_hash: string;
  entry_hash: string;
}

export class AuditService {
  public readonly entriesByTenant = new Map<string, CloudAuditEntry[]>();
  public readonly exportCountsByActor = new Map<string, number>();
  public readonly securityAlerts: { tenant_id: string; actor_id: string; reason: string }[] = [];

  /**
   * HU-095 & HU-459: Inserta de forma append-only encadenando `entry_hash = SHA-256(prev_hash || payload)` por tienda
   * y detecta descargas/exportaciones masivas repetitivas.
   */
  appendAuditEntry(params: {
    tenantId: string;
    actorId: string;
    action: string;
    entityId?: string | null;
    details?: Record<string, unknown>;
    occurredAtMs?: number;
  }): CloudAuditEntry {
    const nowMs = params.occurredAtMs ?? Date.now();
    const list = this.entriesByTenant.get(params.tenantId) ?? [];
    const prevHash = list.length > 0 ? list[list.length - 1]!.entry_hash : "GENESIS";
    const seq = list.length + 1;
    const id = newId(nowMs);
    const details = params.details ?? {};

    const entryHash = canonicalSha256({
      id,
      tenant_id: params.tenantId,
      seq,
      actor_id: params.actorId,
      action: params.action,
      entity_id: params.entityId ?? null,
      details,
      occurred_at_ms: nowMs,
      prev_hash: prevHash
    });

    const entry: CloudAuditEntry = {
      id,
      tenant_id: params.tenantId,
      seq,
      actor_id: params.actorId,
      action: params.action,
      entity_id: params.entityId ?? null,
      details,
      occurred_at_ms: nowMs,
      prev_hash: prevHash,
      entry_hash: entryHash
    };
    list.push(entry);
    this.entriesByTenant.set(params.tenantId, list);

    // HU-459: Detectar si un mismo usuario solicita > 5 exportaciones masivas seguidas
    if (params.action === "reports.export.requested") {
      const k = `${params.tenantId}:${params.actorId}`;
      const count = (this.exportCountsByActor.get(k) ?? 0) + 1;
      this.exportCountsByActor.set(k, count);
      if (count > 5) {
        this.securityAlerts.push({
          tenant_id: params.tenantId,
          actor_id: params.actorId,
          reason: `EXCESO_EXPORTACIONES_MASIVAS:${count}`
        });
      }
    }

    return entry;
  }

  verifyTenantChainIntegrity(tenantId: string): { valid: boolean; brokenAtSeq?: number } {
    const list = this.entriesByTenant.get(tenantId) ?? [];
    let expectedPrev = "GENESIS";
    for (const row of list) {
      if (row.prev_hash !== expectedPrev) {
        return { valid: false, brokenAtSeq: row.seq };
      }
      const recomputed = canonicalSha256({
        id: row.id,
        tenant_id: row.tenant_id,
        seq: row.seq,
        actor_id: row.actor_id,
        action: row.action,
        entity_id: row.entity_id,
        details: row.details,
        occurred_at_ms: row.occurred_at_ms,
        prev_hash: row.prev_hash
      });
      if (recomputed !== row.entry_hash) {
        return { valid: false, brokenAtSeq: row.seq };
      }
      expectedPrev = row.entry_hash;
    }
    return { valid: true };
  }
}
