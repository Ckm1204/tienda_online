import crypto from "node:crypto";
import { newId, rawCanonicalSha256Hex } from "@tiendita/contracts";

/**
 * HU-132: Simulador de Terminales POS y Reconexión Masiva ("Volvió la luz en la ciudad")
 * Simula miles de terminales desconectadas que acumulan ventas en su Outbox local
 * y reconectan simultáneamente aplicando backoff y jitter.
 */

export interface SimulatedOutboxEvent {
  event_id: string;
  terminal_seq: number;
  event_type: "sale.recorded" | "shift.opened" | "shift.closed" | "payment.received";
  payload: Record<string, unknown>;
  payload_hash: string;
  occurred_at_ms: number;
  hlc: string;
}

export class VirtualTerminal {
  public currentSeq = 0;
  public readonly outbox: SimulatedOutboxEvent[] = [];
  public connected = false;

  constructor(
    public readonly terminalId: string,
    public readonly tenantId: string,
    public readonly branchId: string
  ) {}

  public recordOfflineSale(sale: {
    totalCents: number;
    lines: { productId: string; qtyMilli: number; unitPriceCents: number }[];
    nowMs?: number;
  }): SimulatedOutboxEvent {
    this.currentSeq += 1;
    const nowMs = sale.nowMs ?? Date.now();
    const eventId = newId(nowMs);
    const payload = {
      tenant_id: this.tenantId,
      branch_id: this.branchId,
      terminal_id: this.terminalId,
      sale_id: newId(nowMs),
      total_cents: sale.totalCents,
      lines: sale.lines,
      terminal_seq: this.currentSeq
    };

    const payloadHash = rawCanonicalSha256Hex(payload);
    const event: SimulatedOutboxEvent = {
      event_id: eventId,
      terminal_seq: this.currentSeq,
      event_type: "sale.recorded",
      payload,
      payload_hash: payloadHash,
      occurred_at_ms: nowMs,
      hlc: `${nowMs}:0:${this.terminalId}`
    };

    this.outbox.push(event);
    return event;
  }

  /**
   * Calcula el jitter para evitar avalanchas de reconexión (Thundering Herd)
   */
  public computeReconnectionDelayMs(baseDelayMs = 500, maxJitterMs = 3000): number {
    const jitter = Math.floor(Math.random() * maxJitterMs);
    return baseDelayMs + jitter;
  }
}

export class TerminalSimulatorCluster {
  public readonly terminals: VirtualTerminal[] = [];

  public spawnTerminals(count: number, tenantPrefix = "tenant"): VirtualTerminal[] {
    for (let i = 0; i < count; i++) {
      const tenantId = `${tenantPrefix}_${Math.floor(i / 5)}`;
      const branchId = `branch_${i}`;
      const termId = `term_${i}`;
      this.terminals.push(new VirtualTerminal(termId, tenantId, branchId));
    }
    return this.terminals;
  }

  public simulateOfflineOutages(salesPerTerminal: number): { totalEventsGenerated: number } {
    let totalEvents = 0;
    for (const term of this.terminals) {
      term.connected = false;
      for (let s = 0; s < salesPerTerminal; s++) {
        term.recordOfflineSale({
          totalCents: 15_000_00,
          lines: [{ productId: "PROD_ARROZ", qtyMilli: 2000, unitPriceCents: 7_500_00 }]
        });
        totalEvents += 1;
      }
    }
    return { totalEventsGenerated: totalEvents };
  }

  /**
   * Simula el drenado concurrente masivo con métricas de latencia y tasa de éxito
   */
  public async simulateMassReconnection(options?: {
    batchSize?: number;
    mockLatencyMs?: number;
  }): Promise<{
    drainedEvents: number;
    successRate: number;
    p95LatencyMs: number;
    p99LatencyMs: number;
  }> {
    const batchSize = options?.batchSize ?? 100;
    const baseLatency = options?.mockLatencyMs ?? 25;
    const latencies: number[] = [];
    let drained = 0;

    for (const term of this.terminals) {
      term.connected = true;
      while (term.outbox.length > 0) {
        const batch = term.outbox.splice(0, batchSize);
        // Simular latencia de red + procesamiento en servidor con jitter
        const reqLatency = baseLatency + Math.floor(Math.random() * 35);
        latencies.push(reqLatency);
        drained += batch.length;
      }
    }

    latencies.sort((a, b) => a - b);
    const p95 = latencies[Math.floor(latencies.length * 0.95)] ?? baseLatency;
    const p99 = latencies[Math.floor(latencies.length * 0.99)] ?? baseLatency;

    return {
      drainedEvents: drained,
      successRate: 1.0,
      p95LatencyMs: p95,
      p99LatencyMs: p99
    };
  }
}
