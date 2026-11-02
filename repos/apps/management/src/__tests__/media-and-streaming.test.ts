import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  computeScaledDimensions,
  optimizeClientImage
} from "../network/client-media.js";
import {
  LiveDashboardManager,
  type DashboardEvent
} from "../network/live-dashboard.js";

describe("Client Media & SSE Streaming Unit Tests (HU-471, HU-472)", () => {
  describe("HU-472: Compresión y redimensionamiento de fotos de comprobantes", () => {
    it("computa dimensiones proporcionales limitadas a 1200px", () => {
      // Imagen horizontal de 2400x1600 -> debe escalar a 1200x800
      const landscape = computeScaledDimensions(2400, 1600, 1200);
      expect(landscape.width).toBe(1200);
      expect(landscape.height).toBe(800);

      // Imagen vertical de 1500x3000 -> debe escalar a 600x1200
      const portrait = computeScaledDimensions(1500, 3000, 1200);
      expect(portrait.width).toBe(600);
      expect(portrait.height).toBe(1200);

      // Imagen pequeña de 800x600 -> no se amplía
      const small = computeScaledDimensions(800, 600, 1200);
      expect(small.width).toBe(800);
      expect(small.height).toBe(600);
    });

    it("optimiza la imagen y asegura tamaño menor a 300 KB", async () => {
      const mockData = "data:image/jpeg;base64," + "A".repeat(5000);
      const result = await optimizeClientImage(mockData, {
        targetMaxBytes: 300 * 1024,
        maxWidth: 1200
      });

      expect(result.sizeBytes).toBeLessThanOrEqual(300 * 1024);
      expect(result.format).toBe("image/jpeg");
    });
  });

  describe("HU-471: LiveDashboardManager con SSE y Fallback a Polling", () => {
    let originalFetch: typeof fetch;

    beforeEach(() => {
      originalFetch = global.fetch;
    });

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it("activa fallback a polling si EventSource no está definido", async () => {
      const updates: DashboardEvent[] = [];
      const statusChanges: string[] = [];

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ total_sales_cents: 950000 })
      } as any);

      const manager = new LiveDashboardManager({
        streamUrl: "/v1/app/reports/dashboard/stream",
        pollingUrl: "/v1/app/reports/dashboard",
        token: "fake-jwt",
        pollingIntervalMs: 50,
        onUpdate: (evt) => updates.push(evt),
        onStatusChange: (s) => statusChanges.push(s)
      });

      manager.connect();

      expect(manager.getStatus()).toBe("FALLBACK_POLLING");
      expect(statusChanges).toContain("FALLBACK_POLLING");

      // Esperar llamada a fetch
      await new Promise((resolve) => setTimeout(resolve, 20));

      expect(global.fetch).toHaveBeenCalledWith(
        "/v1/app/reports/dashboard",
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: "Bearer fake-jwt"
          })
        })
      );
      expect(updates.length).toBeGreaterThan(0);
      expect((updates[0]?.data as any).total_sales_cents).toBe(950000);

      manager.disconnect();
      expect(manager.getStatus()).toBe("DISCONNECTED");
    });
  });
});
