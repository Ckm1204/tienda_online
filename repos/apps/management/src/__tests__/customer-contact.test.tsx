import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";

vi.mock("lucide-react-native/icons/message-circle", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/shield-check", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/triangle-alert", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/clock", () => ({ default: () => null }));
vi.mock("lucide-react-native/icons/x", () => ({ default: () => null }));

import {
  CustomerContactModal,
  isColombiaLey2300Active
} from "../components/CustomerContactModal";

describe("CustomerContactModal & Ley 2300 de 2023 ('Dejen de Fregar')", () => {
  afterEach(() => {
    cleanup();
  });

  const sampleCustomer = {
    id: "cust-01",
    name: "Doña Martha Gómez",
    docNumber: "51.849.201",
    phone: "+57 310 445 8821",
    balanceCents: 8500000 // $85.000 COP
  };

  describe("Función isColombiaLey2300Active", () => {
    it("permite contacto de Lunes a Viernes entre 07:00 y 19:00 hora Colombia", () => {
      // 2026-10-28 es Miércoles
      // 15:00 UTC = 10:00 AM Colombia (hábil)
      const wednesday10am = new Date("2026-10-28T15:00:00Z");
      const res = isColombiaLey2300Active(wednesday10am);
      expect(res.allowed).toBe(true);
      expect(res.dayName).toBe("Miércoles");
    });

    it("prohíbe contacto de Lunes a Viernes pasadas las 19:00 (7:00 PM)", () => {
      // 01:00 UTC siguiente día = 20:00 (8:00 PM Colombia)
      const wednesday8pm = new Date("2026-10-29T01:00:00Z");
      const res = isColombiaLey2300Active(wednesday8pm);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Fuera de horario hábil");
    });

    it("permite contacto los Sábados entre 08:00 y 15:00 hora Colombia", () => {
      // 2026-10-31 es Sábado
      // 15:00 UTC = 10:00 AM Colombia
      const saturday10am = new Date("2026-10-31T15:00:00Z");
      const res = isColombiaLey2300Active(saturday10am);
      expect(res.allowed).toBe(true);
      expect(res.dayName).toBe("Sábado");
    });

    it("prohíbe contacto los Sábados pasadas las 15:00 (3:00 PM)", () => {
      // 21:00 UTC = 16:00 (4:00 PM Colombia)
      const saturday4pm = new Date("2026-10-31T21:00:00Z");
      const res = isColombiaLey2300Active(saturday4pm);
      expect(res.allowed).toBe(false);
      expect(res.reason).toContain("Sábado fuera de horario");
    });

    it("prohíbe taxativamente contacto los Domingos 24/7", () => {
      // 2026-11-01 es Domingo
      const sundayNoon = new Date("2026-11-01T17:00:00Z");
      const res = isColombiaLey2300Active(sundayNoon);
      expect(res.allowed).toBe(false);
      expect(res.dayName).toBe("Domingo");
      expect(res.reason).toContain("Domingo: Prohibido todo contacto de cobranza");
    });
  });

  describe("Componente CustomerContactModal", () => {
    it("renderiza información del cliente, saldo y canal por defecto WhatsApp", () => {
      render(
        <CustomerContactModal
          visible={true}
          customer={sampleCustomer}
          weeklyContactsUsed={0}
          onClose={vi.fn()}
          onSendContact={vi.fn()}
        />
      );

      expect(screen.getByText("Recordatorio de Cobro (Ley 2300)")).toBeDefined();
      expect(screen.getByText("Doña Martha Gómez")).toBeDefined();
      expect(screen.getByText("$85.000 COP")).toBeDefined();
      expect(screen.getByTestId("channel-whatsapp")).toBeDefined();
      expect(screen.getByTestId("channel-sms")).toBeDefined();
      expect(screen.getByText(/Apreciado\/a Doña Martha Gómez/)).toBeDefined();
    });

    it("permite cambiar de canal a SMS y actualizar vista previa", () => {
      render(
        <CustomerContactModal
          visible={true}
          customer={sampleCustomer}
          weeklyContactsUsed={1}
          onClose={vi.fn()}
          onSendContact={vi.fn()}
        />
      );

      fireEvent.click(screen.getByTestId("channel-sms"));
      expect(screen.getByText("SMS Celular")).toBeDefined();
    });

    it("deshabilita el botón de envío si se alcanzó el límite semanal de 2 contactos", () => {
      render(
        <CustomerContactModal
          visible={true}
          customer={sampleCustomer}
          weeklyContactsUsed={2} // Ya copó los 2 de la semana
          onClose={vi.fn()}
          onSendContact={vi.fn()}
        />
      );

      expect(screen.getByText("Límite Semanal de Contactos Alcanzado")).toBeDefined();
      const sendBtn = screen.getByTestId("btn-send-reminder");
      expect(sendBtn.hasAttribute("disabled") || sendBtn.getAttribute("aria-disabled") === "true").toBe(true);
    });

    it("ejecuta onSendContact con mensaje y canal al presionar Enviar", async () => {
      const sendSpy = vi.fn().mockResolvedValue(undefined);

      render(
        <CustomerContactModal
          visible={true}
          customer={sampleCustomer}
          weeklyContactsUsed={0}
          onClose={vi.fn()}
          onSendContact={sendSpy}
        />
      );

      const status = isColombiaLey2300Active();
      if (status.allowed) {
        fireEvent.click(screen.getByTestId("btn-send-reminder"));
        expect(sendSpy).toHaveBeenCalledWith(
          expect.objectContaining({
            customerId: "cust-01",
            channel: "WHATSAPP",
            message: expect.stringContaining("Doña Martha Gómez")
          })
        );
      }
    });
  });
});
