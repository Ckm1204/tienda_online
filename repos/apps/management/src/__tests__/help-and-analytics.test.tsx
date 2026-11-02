import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// Mock para lucide icons
vi.mock("lucide-react-native/icons/play", () => ({ default: () => <span data-testid="icon-play" /> }));
vi.mock("lucide-react-native/icons/message-circle", () => ({ default: () => <span data-testid="icon-message" /> }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => <span data-testid="icon-x" /> }));

import {
  HelpCenterModal,
  buildWhatsAppSupportUrl
} from "../components/HelpCenterModal.js";
import { AnonymousAnalytics } from "../telemetry/analytics.js";

describe("Help Center & Anonymous Analytics (HU-367, HU-368, HU-377)", () => {
  describe("HU-367: HelpCenterModal & WhatsApp Support", () => {
    it("construye URL de WhatsApp prellenando nombre de tienda y versión", () => {
      const url = buildWhatsAppSupportUrl({
        storeName: "Tienda El Sol",
        terminalCode: "CAJA-01",
        appVersion: "1.0.0"
      });

      expect(url).toContain("https://wa.me/573001234567");
      expect(url).toContain(encodeURIComponent("Hola, necesito ayuda con mi tienda [Tienda El Sol - CAJA-01 - v1.0.0]"));
    });

    it("muestra tarjetas de videos cortos y permite invocar WhatsApp de soporte", () => {
      const onOpenWhatsApp = vi.fn();
      const onClose = vi.fn();

      render(
        <HelpCenterModal
          storeName="Abarrotes Don Lucho"
          terminalCode="CAJA-02"
          appVersion="1.0.2"
          onClose={onClose}
          onOpenWhatsApp={onOpenWhatsApp}
        />
      );

      expect(screen.getByTestId("help-center-modal")).toBeDefined();
      expect(screen.getByTestId("tutorial-card-vender")).toBeDefined();
      expect(screen.getByTestId("tutorial-card-arqueo")).toBeDefined();

      fireEvent.click(screen.getByTestId("btn-whatsapp-support"));
      expect(onOpenWhatsApp).toHaveBeenCalledWith(
        expect.stringContaining("Abarrotes%20Don%20Lucho")
      );

      fireEvent.click(screen.getByTestId("btn-close-help"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("HU-368: AnonymousAnalytics", () => {
    it("registra métricas técnicas y descarta cualquier dato personal PII", () => {
      const analytics = new AnonymousAnalytics();

      const event = analytics.track("pos_checkout_completed", {
        checkout_duration_ms: 3200,
        items_count: 5,
        customer_name: "Juan Perez", // PII
        customer_email: "juan@gmail.com", // PII
        phone_number: "3001234567", // PII
        payment_method: "CASH"
      });

      expect(event.event).toBe("pos_checkout_completed");
      expect(event.properties["checkout_duration_ms"]).toBe(3200);
      expect(event.properties["items_count"]).toBe(5);
      expect(event.properties["payment_method"]).toBe("CASH");

      // No debe contener PII
      expect(event.properties["customer_name"]).toBeUndefined();
      expect(event.properties["customer_email"]).toBeUndefined();
      expect(event.properties["phone_number"]).toBeUndefined();
    });
  });
});
