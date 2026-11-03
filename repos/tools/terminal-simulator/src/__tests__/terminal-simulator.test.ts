import { describe, it, expect } from "vitest";
import { TerminalSimulatorCluster, VirtualTerminal } from "../simulator.js";

describe("HU-132: Terminal Simulator & Mass Reconnection", () => {
  it("Genera eventos offline válidos con secuencias monótonas y HLCs", () => {
    const term = new VirtualTerminal("term_01", "tenant_01", "branch_01");
    expect(term.connected).toBe(false);

    const evt1 = term.recordOfflineSale({
      totalCents: 10_000_00,
      lines: [{ productId: "P1", qtyMilli: 1000, unitPriceCents: 10_000_00 }]
    });

    const evt2 = term.recordOfflineSale({
      totalCents: 5_000_00,
      lines: [{ productId: "P2", qtyMilli: 1000, unitPriceCents: 5_000_00 }]
    });

    expect(evt1.terminal_seq).toBe(1);
    expect(evt2.terminal_seq).toBe(2);
    expect(evt1.payload_hash).toHaveLength(64);
    expect(evt1.hlc).toContain("term_01");
    expect(term.outbox.length).toBe(2);

    const delay = term.computeReconnectionDelayMs(500, 2000);
    expect(delay).toBeGreaterThanOrEqual(500);
    expect(delay).toBeLessThanOrEqual(2500);
  });

  it("Simula reconexión masiva de terminales y verifica drenado con p99 < 800 ms", async () => {
    const cluster = new TerminalSimulatorCluster();
    cluster.spawnTerminals(20);
    expect(cluster.terminals.length).toBe(20);

    const { totalEventsGenerated } = cluster.simulateOfflineOutages(10);
    expect(totalEventsGenerated).toBe(200);

    const result = await cluster.simulateMassReconnection({ batchSize: 5, mockLatencyMs: 30 });
    expect(result.drainedEvents).toBe(200);
    expect(result.successRate).toBe(1.0);
    expect(result.p99LatencyMs).toBeLessThan(800); // HU-132 SLO: p99 < 800ms
  });

  it("Genera ventas fiscales colombianas y cierres de turno con arqueo ciego offline", () => {
    const term = new VirtualTerminal("term_dian_01", "tenant_col_01", "branch_bogota");

    const fiscalSale = term.recordOfflineFiscalSale({
      receiptPrefix: "SETT",
      receiptNumber: 1520,
      totalCents: 119_000_00,
      lines: [
        {
          productId: "PROD_ARROZ",
          description: "Arroz Diana 1kg",
          qtyMilli: 2000,
          unitPriceCents: 4_800_00,
          lineTotalCents: 9_600_00
        }
      ],
      taxBreakdown: {
        gravado19_cents: 100_000_00,
        iva19_cents: 19_000_00
      },
      payments: [
        {
          payment_id: "pay_01",
          method: "CASH",
          amount_cents: 100_000_00
        },
        {
          payment_id: "pay_02",
          method: "NEQUI",
          amount_cents: 19_000_00
        }
      ]
    });

    expect(fiscalSale.event_type).toBe("sale.recorded");
    expect(fiscalSale.terminal_seq).toBe(1);
    expect((fiscalSale.payload as any).receipt_prefix).toBe("SETT");
    expect((fiscalSale.payload as any).tax_breakdown.iva19_cents).toBe(19_000_00);

    const shiftClose = term.recordOfflineBlindCashClose({
      cashSessionId: "session_001",
      expectedCashCents: 100_000_00,
      declaredCashCents: 100_000_00,
      differenceCents: 0
    });

    expect(shiftClose.event_type).toBe("shift.closed");
    expect(shiftClose.terminal_seq).toBe(2);
    expect((shiftClose.payload as any).difference_cents).toBe(0);
    expect(term.outbox.length).toBe(2);
  });
});
