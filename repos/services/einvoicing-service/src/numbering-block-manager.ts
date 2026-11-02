import { newId } from "@tiendita/contracts";
import type {
  DianResolutionRecord,
  TerminalNumberingBlockRecord,
  DianDocKind
} from "./types.js";

/**
 * HU-136, HU-379, HU-380, HU-381, HU-382: Gestor de Resoluciones y Bloques de Numeración DIAN
 * - Validación de no solapamiento tipo PostgreSQL `EXCLUDE USING gist`
 * - Consumo de consecutivos locales con salto automático a bloque `STANDBY`
 * - Reposición automática de reserva al consumir el 80 % del bloque activo
 * - Alertas de vencimiento de vigencia (30, 15, 5 días) y de agotamiento de rango (80 %, 90 %)
 */

export class NumberingBlockManager {
  public readonly resolutions = new Map<string, DianResolutionRecord>();
  public readonly blocks = new Map<string, TerminalNumberingBlockRecord>();

  /**
   * HU-136, HU-379 & HU-380: Registra una resolución DIAN.
   * `technical_key_ref` debe ser una referencia a Secrets Manager, no la clave en texto plano.
   */
  public registerResolution(params: {
    tenantId: string;
    docKind: DianDocKind;
    resolutionNumber: string;
    prefix: string;
    rangeFrom: number;
    rangeTo: number;
    validFrom: string; // YYYY-MM-DD
    validTo: string;   // YYYY-MM-DD
    technicalKeyRef: string;
    nowMs?: number;
  }): DianResolutionRecord {
    if (params.rangeTo < params.rangeFrom) {
      throw new Error("400 INVALID_RANGE: rangeTo debe ser >= rangeFrom");
    }
    if (!params.technicalKeyRef.startsWith("arn:aws:secretsmanager:") && !params.technicalKeyRef.startsWith("secret:")) {
      throw new Error("400 INVALID_KEY_REF: Debe ser una referencia a Secrets Manager (HU-380)");
    }

    const rec: DianResolutionRecord = {
      id: newId(params.nowMs),
      tenant_id: params.tenantId,
      doc_kind: params.docKind,
      resolution_number: params.resolutionNumber,
      prefix: params.prefix,
      range_from: params.rangeFrom,
      range_to: params.rangeTo,
      valid_from: params.validFrom,
      valid_to: params.validTo,
      technical_key_ref: params.technicalKeyRef,
      status: "ACTIVE",
      created_at_ms: params.nowMs ?? Date.now()
    };

    this.resolutions.set(rec.id, rec);
    return rec;
  }

  /**
   * HU-136 & HU-379: Asigna un bloque de numeración a una terminal garantizando
   * que NO exista solapamiento con ningún bloque existente (emulación de GiST exclusion).
   */
  public assignBlock(params: {
    tenantId: string;
    resolutionId: string;
    terminalId: string;
    blockFrom: number;
    blockTo: number;
    status?: "ACTIVE" | "STANDBY";
    nowMs?: number;
  }): TerminalNumberingBlockRecord {
    const res = this.resolutions.get(params.resolutionId);
    if (!res) throw new Error("404 RESOLUTION_NOT_FOUND");
    if (params.blockFrom < res.range_from || params.blockTo > res.range_to) {
      throw new Error("400 BLOCK_OUT_OF_RESOLUTION_RANGE");
    }

    // Regla de Exclusión GiST: EXCLUDE USING gist (resolution_id WITH =, int8range(block_from, block_to, '[]') WITH &&)
    for (const b of this.blocks.values()) {
      if (b.resolution_id === params.resolutionId && b.status !== "RELEASED") {
        const overlaps = Math.max(b.block_from, params.blockFrom) <= Math.min(b.block_to, params.blockTo);
        if (overlaps) {
          throw new Error(
            `409 EXCLUSION_VIOLATION: El bloque ${params.blockFrom}..${params.blockTo} se solapa con el bloque ${b.block_from}..${b.block_to} de la terminal ${b.terminal_id}`
          );
        }
      }
    }

    const block: TerminalNumberingBlockRecord = {
      id: newId(params.nowMs),
      tenant_id: params.tenantId,
      resolution_id: params.resolutionId,
      terminal_id: params.terminalId,
      block_from: params.blockFrom,
      block_to: params.blockTo,
      last_used: params.blockFrom - 1,
      status: params.status ?? "ACTIVE",
      assigned_at_ms: params.nowMs ?? Date.now()
    };

    this.blocks.set(block.id, block);
    return block;
  }

  /**
   * HU-382: Consumo local de consecutivo.
   * - Toma el siguiente número del bloque ACTIVE.
   * - Si se agota, conmuta automáticamente al bloque STANDBY.
   * - Detecta cuando se consume el 80 % para solicitar reposición de reserva (HU-136).
   */
  public consumeNextNumber(
    terminalId: string,
    resolutionId: string,
    nowMs = Date.now()
  ): {
    number: number;
    prefix: string;
    needsStandbyReplenishment: boolean;
  } {
    const res = this.resolutions.get(resolutionId);
    if (!res) throw new Error("404 RESOLUTION_NOT_FOUND");

    // Verificar vigencia de la resolución
    const validToMs = new Date(`${res.valid_to}T23:59:59-05:00`).getTime();
    if (nowMs > validToMs) {
      throw new Error(`403 RESOLUTION_EXPIRED: La resolución venció el ${res.valid_to}`);
    }

    const terminalBlocks = [...this.blocks.values()].filter(
      (b) => b.terminal_id === terminalId && b.resolution_id === resolutionId
    );

    let activeBlock = terminalBlocks.find((b) => b.status === "ACTIVE");

    // Si el activo llegó al tope, pasar a EXHAUSTED y promover STANDBY
    if (activeBlock && activeBlock.last_used >= activeBlock.block_to) {
      activeBlock.status = "EXHAUSTED";
      activeBlock = undefined;
    }

    if (!activeBlock) {
      const standbyBlock = terminalBlocks.find((b) => b.status === "STANDBY");
      if (standbyBlock) {
        standbyBlock.status = "ACTIVE";
        activeBlock = standbyBlock;
      } else {
        throw new Error("403 NUMBERING_BLOCKS_EXHAUSTED: Sin bloques disponibles en la caja");
      }
    }

    activeBlock.last_used += 1;
    const currentNumber = activeBlock.last_used;

    // Calcular porcentaje consumido del bloque
    const totalInBlock = activeBlock.block_to - activeBlock.block_from + 1;
    const usedInBlock = activeBlock.last_used - activeBlock.block_from + 1;
    const consumptionRatio = usedInBlock / totalInBlock;

    // HU-136: Si supera el 80 % y no hay bloque STANDBY asignado, solicita reposición
    const hasStandby = terminalBlocks.some((b) => b.status === "STANDBY");
    const needsStandbyReplenishment = consumptionRatio >= 0.8 && !hasStandby;

    return {
      number: currentNumber,
      prefix: res.prefix,
      needsStandbyReplenishment
    };
  }

  /**
   * HU-381: Alertas preventivas de vencimiento de vigencia o agotamiento de rango
   */
  public checkResolutionAlerts(nowMs = Date.now()): {
    resolutionId: string;
    alertType: "DAYS_TO_EXPIRY" | "RANGE_EXHAUSTION";
    level: "INFO" | "WARNING" | "CRITICAL";
    message: string;
  }[] {
    const alerts: {
      resolutionId: string;
      alertType: "DAYS_TO_EXPIRY" | "RANGE_EXHAUSTION";
      level: "INFO" | "WARNING" | "CRITICAL";
      message: string;
    }[] = [];

    for (const res of this.resolutions.values()) {
      if (res.status !== "ACTIVE") continue;

      const validToMs = new Date(`${res.valid_to}T23:59:59-05:00`).getTime();
      const daysRemaining = Math.ceil((validToMs - nowMs) / 86_400_000);

      if (daysRemaining <= 5) {
        alerts.push({
          resolutionId: res.id,
          alertType: "DAYS_TO_EXPIRY",
          level: "CRITICAL",
          message: `Resolución ${res.resolution_number} vence en ${daysRemaining} días (${res.valid_to})`
        });
      } else if (daysRemaining <= 15) {
        alerts.push({
          resolutionId: res.id,
          alertType: "DAYS_TO_EXPIRY",
          level: "WARNING",
          message: `Resolución ${res.resolution_number} vence en ${daysRemaining} días`
        });
      } else if (daysRemaining <= 30) {
        alerts.push({
          resolutionId: res.id,
          alertType: "DAYS_TO_EXPIRY",
          level: "INFO",
          message: `Resolución ${res.resolution_number} próxima a vencer (${daysRemaining} días restantes)`
        });
      }

      // Conteo de uso del rango total
      const resBlocks = [...this.blocks.values()].filter((b) => b.resolution_id === res.id);
      const maxUsed = resBlocks.reduce((max, b) => Math.max(max, b.last_used), res.range_from - 1);
      const totalRange = res.range_to - res.range_from + 1;
      const consumedRatio = (maxUsed - res.range_from + 1) / totalRange;

      if (consumedRatio >= 0.9) {
        alerts.push({
          resolutionId: res.id,
          alertType: "RANGE_EXHAUSTION",
          level: "CRITICAL",
          message: `Rango de resolución consumido al ${(consumedRatio * 100).toFixed(1)} % (número actual: ${maxUsed} de ${res.range_to})`
        });
      } else if (consumedRatio >= 0.8) {
        alerts.push({
          resolutionId: res.id,
          alertType: "RANGE_EXHAUSTION",
          level: "WARNING",
          message: `Rango de resolución consumido al ${(consumedRatio * 100).toFixed(1)} %`
        });
      }
    }

    return alerts;
  }
}
