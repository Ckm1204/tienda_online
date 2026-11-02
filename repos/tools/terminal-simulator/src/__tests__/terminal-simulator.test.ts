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
});
