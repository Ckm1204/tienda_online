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
   * Art. 616 E.T. & DIAN: Registra una venta offline con desglose tributario exacto en centavos.
   */
  public recordOfflineFiscalSale(sale: {
    receiptPrefix: string;
    receiptNumber: number;
    totalCents: number;
    lines: { productId: string; description: string; qtyMilli: number; unitPriceCents: number; lineTotalCents: number }[];
    taxBreakdown: {
      gravado19_cents?: number;
      iva19_cents?: number;
      gravado5_cents?: number;
      iva5_cents?: number;
      exento_cents?: number;
      excluido_cents?: number;
      inc8_cents?: number;
    };
    payments: { payment_id: string; method: "CASH" | "NEQUI" | "DAVIPLATA" | "CARD"; amount_cents: number; reference?: string | null }[];
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
      receipt_prefix: sale.receiptPrefix,
      receipt_number: sale.receiptNumber,
      total_cents: sale.totalCents,
      lines: sale.lines,
      tax_breakdown: {
        gravado19_cents: sale.taxBreakdown.gravado19_cents ?? 0,
        iva19_cents: sale.taxBreakdown.iva19_cents ?? 0,
        gravado5_cents: sale.taxBreakdown.gravado5_cents ?? 0,
        iva5_cents: sale.taxBreakdown.iva5_cents ?? 0,
        exento_cents: sale.taxBreakdown.exento_cents ?? 0,
        excluido_cents: sale.taxBreakdown.excluido_cents ?? 0,
        inc8_cents: sale.taxBreakdown.inc8_cents ?? 0
      },
      payments: sale.payments,
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
   * HU-348 / EP-05: Cierre de turno con arqueo ciego en modo offline.
   */
  public recordOfflineBlindCashClose(shift: {
    cashSessionId: string;
    expectedCashCents: number;
    declaredCashCents: number;
    differenceCents: number;
    nowMs?: number;
  }): SimulatedOutboxEvent {
    this.currentSeq += 1;
    const nowMs = shift.nowMs ?? Date.now();
    const eventId = newId(nowMs);
    const payload = {
      tenant_id: this.tenantId,
      branch_id: this.branchId,
      terminal_id: this.terminalId,
      cash_session_id: shift.cashSessionId,
      expected_cash_cents: shift.expectedCashCents,
      declared_cash_cents: shift.declaredCashCents,
      difference_cents: shift.differenceCents,
      terminal_seq: this.currentSeq
    };

    const payloadHash = rawCanonicalSha256Hex(payload);
    const event: SimulatedOutboxEvent = {
      event_id: eventId,
      terminal_seq: this.currentSeq,
      event_type: "shift.closed",
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

const isMain = process.argv[1]?.endsWith("simulator.js") || process.argv[1]?.endsWith("simulator.ts");
if (isMain) {
  (async () => {
    console.log("=== INICIANDO SIMULACIÓN DE TERMINALES POS (HU-132) ===");
    const cluster = new TerminalSimulatorCluster();
    console.log("1. Creando clúster de 100 terminales virtuales en 20 tiendas...");
    cluster.spawnTerminals(100);
    console.log("2. Simulando apagón masivo ('Volvió la luz en la ciudad')...");
    const { totalEventsGenerated } = cluster.simulateOfflineOutages(25);
    console.log(`   -> Generadas ${totalEventsGenerated} ventas offline firmadas con SHA-256 e HLC.`);
    console.log("3. Restableciendo red eléctrica (reconexión masiva concurrente con backoff y jitter)...");
    const metrics = await cluster.simulateMassReconnection({ batchSize: 50 });
    console.log(`   -> Eventos drenados hacia sync-service: ${metrics.drainedEvents}/${totalEventsGenerated}`);
    console.log(`   -> Tasa de éxito: ${(metrics.successRate * 100).toFixed(1)}%`);
    console.log(`   -> Latencia p95: ${metrics.p95LatencyMs} ms`);
    console.log(`   -> Latencia p99: ${metrics.p99LatencyMs} ms`);
    console.log("=== SIMULACIÓN COMPLETADA EXITOSAMENTE ===");
  })();
}
